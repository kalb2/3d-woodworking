import * as THREE from 'three';
import { create } from 'zustand';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';
import type { BoardHole, Dimensions3D, FurnitureObject, ShapeType } from '../types/furniture';
import { isOutlineHole } from './boardGeometry';

/** Shapes that can take holes (box-like solids). */
export const HOLE_SHAPES: ShapeType[] = ['cube', 'board'];
export const supportsHoles = (shape: ShapeType) => HOLE_SHAPES.includes(shape);

export function getHoles(o: FurnitureObject): BoardHole[] {
  return (o.shape === 'board' ? o.board?.holes : o.holes) ?? [];
}

/** Partial update that sets an object's holes in the right place. */
export function holesUpdate(o: FurnitureObject, holes: BoardHole[]): Partial<FurnitureObject> {
  if (o.shape === 'board' && o.board) return { board: { ...o.board, holes } };
  return { holes };
}

export function newHole(o: FurnitureObject, index = getHoles(o).length, kind: 'round' | 'rect' = 'round', face: BoardHole['face'] = 'top'): BoardHole {
  const d = o.dimensions;
  const { u, v } = faceSize(d, face);
  const size = Math.round(Math.max(0.25, Math.min(1, Math.min(u, v) / 4)) * 4) / 4;
  return { id: `hole_${Date.now()}_${index}`, x: 0, z: 0, diameter: size, face, ...(kind === 'rect' ? { kind, height: size } : {}) };
}

/** Thickness of the part measured through a face. */
export function faceThickness(d: Dimensions3D, face: BoardHole['face']): number {
  return face === 'front' ? d.width : face === 'side' ? d.length : d.height;
}

/** Hole frame in part-local coords: center point on the face, axis pointing into the part. */
export function holeFrame(d: Dimensions3D, h: BoardHole) {
  const face = h.face ?? 'top';
  if (face === 'front') return { surface: new THREE.Vector3(h.x, h.z, d.width / 2), axis: new THREE.Vector3(0, 0, -1) };
  if (face === 'side') return { surface: new THREE.Vector3(d.length / 2, h.z, h.x), axis: new THREE.Vector3(-1, 0, 0) };
  // Matches the board outline (its 2D y axis ends up along -Z).
  return { surface: new THREE.Vector3(h.x, d.height / 2, -h.z), axis: new THREE.Vector3(0, -1, 0) };
}

/** A cutter solid for one hole (slightly oversized so faces don't coincide). */
export function holeCutter(d: Dimensions3D, h: BoardHole): THREE.Mesh {
  const thick = faceThickness(d, h.face);
  const through = h.depth === undefined || h.depth >= thick;
  const depth = through ? thick + 2 : Math.max(0.05, h.depth!);
  const w = Math.max(0.05, h.diameter);
  const geom = (h.kind ?? 'round') === 'rect'
    ? new THREE.BoxGeometry(w, depth, Math.max(0.05, h.height ?? w))
    : new THREE.CylinderGeometry(w / 2, w / 2, depth, 32);
  const { surface, axis } = holeFrame(d, h);
  const mesh = new THREE.Mesh(geom);
  // Cylinder/box axis is Y; point it along the hole axis.
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), axis);
  const offset = through ? 0 : depth / 2 - 0.01;
  const center = through
    ? surface.clone().addScaledVector(axis, thick / 2)
    : surface.clone().addScaledVector(axis, offset);
  mesh.position.copy(center);
  mesh.updateMatrixWorld(true);
  return mesh;
}

let evaluator: Evaluator | null = null;

/**
 * Subtract holes from a centered part geometry. Boards already have their
 * simple through-holes cut in the outline; pass `skipOutline` for those.
 */
export function cutHoles(base: THREE.BufferGeometry, d: Dimensions3D, holes: BoardHole[], skipOutline = false): THREE.BufferGeometry {
  const todo = holes.filter((h) => h.diameter >= 0.05 && !(skipOutline && isOutlineHole(h)));
  if (todo.length === 0) return base;
  try {
    evaluator ??= new Evaluator();
    evaluator.attributes = ['position', 'normal', 'uv'];
    evaluator.useGroups = false;
    const src = base.index ? base.toNonIndexed() : base;
    if (!src.getAttribute('uv')) {
      src.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(src.getAttribute('position').count * 2), 2));
    }
    let result = new Brush(src);
    result.updateMatrixWorld(true);
    for (const h of todo) {
      const c = holeCutter(d, h);
      const brush = new Brush(c.geometry.index ? c.geometry.toNonIndexed() : c.geometry);
      brush.position.copy(c.position);
      brush.quaternion.copy(c.quaternion);
      brush.updateMatrixWorld(true);
      result = evaluator.evaluate(result, brush, SUBTRACTION);
    }
    const out = result.geometry;
    out.computeVertexNormals();
    return out;
  } catch (err) {
    console.warn('Hole cut failed', err);
    return base;
  }
}

/** Hole mode: which part/hole is being edited on the canvas. */
export const useHoleFocus = create<{
  objectId: string | null;
  holeId: string | null;
  editing: boolean;
  set: (objectId: string | null, holeId: string | null) => void;
  edit: (objectId: string, holeId: string) => void;
  exit: () => void;
}>((set) => ({
  objectId: null,
  holeId: null,
  editing: false,
  set: (objectId, holeId) => set({ objectId, holeId }),
  edit: (objectId, holeId) => set({ objectId, holeId, editing: true }),
  exit: () => set({ objectId: null, holeId: null, editing: false }),
}));

/** Half extents of a hole on its face (u along x, v along z). */
export function holeHalf(h: BoardHole) {
  const hu = Math.max(0.025, h.diameter / 2);
  const hv = (h.kind ?? 'round') === 'rect' ? Math.max(0.025, (h.height ?? h.diameter) / 2) : hu;
  return { hu, hv };
}

/** Face size (u, v extents) for a part. */
export function faceSize(d: Dimensions3D, face: BoardHole['face']) {
  if (face === 'front') return { u: d.length, v: d.height };
  if (face === 'side') return { u: d.width, v: d.height };
  return { u: d.length, v: d.width };
}

/** Keep a hole inside its face. */
export function clampHole(d: Dimensions3D, h: BoardHole): BoardHole {
  const { u, v } = faceSize(d, h.face);
  const { hu, hv } = holeHalf(h);
  const cu = Math.max(0, u / 2 - hu), cv = Math.max(0, v / 2 - hv);
  const r3 = (n: number) => Math.round(n * 1000) / 1000;
  return { ...h, x: r3(Math.max(-cu, Math.min(cu, h.x))), z: r3(Math.max(-cv, Math.min(cv, h.z))) };
}

/** Part-local point on a face -> hole offsets on that face. */
export function localToHole(face: NonNullable<BoardHole['face']>, p: { x: number; y: number; z: number }) {
  if (face === 'front') return { x: p.x, z: p.y };
  if (face === 'side') return { x: p.z, z: p.y };
  return { x: p.x, z: -p.z };
}

/** Which +face a part-local normal points at (null for the opposite faces / hole walls). */
export function faceFromNormal(n: { x: number; y: number; z: number }): NonNullable<BoardHole['face']> | null {
  if (n.y > 0.9) return 'top';
  if (n.z > 0.9) return 'front';
  if (n.x > 0.9) return 'side';
  return null;
}

/** The +face that best faces a part-local direction to the camera. */
export function faceTowards(dir: { x: number; y: number; z: number }): NonNullable<BoardHole['face']> {
  const best = [['top', dir.y], ['front', dir.z], ['side', dir.x]] as const;
  return [...best].sort((a, b) => b[1] - a[1])[0][0];
}

/** Is a face point (hole offsets) inside a hole's footprint (with a little slack)? */
export function hitsHole(h: BoardHole, face: NonNullable<BoardHole['face']>, at: { x: number; z: number }, slack = 0.4): boolean {
  if ((h.face ?? 'top') !== face) return false;
  const { hu, hv } = holeHalf(h);
  return Math.abs(at.x - h.x) <= hu + slack && Math.abs(at.z - h.z) <= hv + slack;
}

export function describeHole(h: BoardHole, unit: string, scale: number): string {
  const c = (v: number) => String(Math.round(v * scale * 100) / 100);
  const face = (h.face ?? 'top');
  const size = (h.kind ?? 'round') === 'rect'
    ? `Square ${c(h.diameter)}${(h.height ?? h.diameter) !== h.diameter ? `×${c(h.height!)}` : ''} ${unit}`
    : `Round Ø ${c(h.diameter)} ${unit}`;
  return `${size} · ${face[0].toUpperCase() + face.slice(1)}${h.depth !== undefined ? ` · ${c(h.depth)} deep` : ''}`;
}
