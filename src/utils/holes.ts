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

export function newHole(o: FurnitureObject, index = getHoles(o).length, kind: 'round' | 'rect' | 'notch' = 'round', face: BoardHole['face'] = 'top'): BoardHole {
  const d = o.dimensions;
  const { u, v } = faceSize(d, face);
  const id = `hole_${Date.now()}_${index}`;
  if (kind === 'notch') {
    const q = (n: number) => Math.max(0.125, Math.round(n * 8) / 8);
    // Sensible default (1.5 wide × 0.75 deep), shrunk for small faces; starts on the +v edge.
    return clampHole(d, { id, kind, face, x: 0, z: v / 2, diameter: q(Math.min(1.5, u * 0.5)), height: q(Math.min(0.75, v * 0.4)), edge: 'v+' });
  }
  const size = Math.round(Math.max(0.25, Math.min(1, Math.min(u, v) / 4)) * 4) / 4;
  return { id, x: 0, z: 0, diameter: size, face, ...(kind === 'rect' ? { kind, height: size } : {}) };
}

/** Face axes in part-local space: u (x offset), v (y offset), n (outward normal). */
export function faceAxes(face: BoardHole['face']) {
  if (face === 'front') return { u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 1, 0), n: new THREE.Vector3(0, 0, 1) };
  if (face === 'side') return { u: new THREE.Vector3(0, 0, 1), v: new THREE.Vector3(0, 1, 0), n: new THREE.Vector3(1, 0, 0) };
  return { u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 0, -1), n: new THREE.Vector3(0, 1, 0) };
}

/** Footprint on the face (center + size in u/v). Notches orient their width along the edge. */
export function footprint(h: BoardHole) {
  const kind = h.kind ?? 'round';
  if (kind === 'notch') {
    const along = Math.max(0.05, h.diameter), inward = Math.max(0.05, h.height ?? h.diameter / 2);
    const onU = h.edge === 'u-' || h.edge === 'u+';
    return { cu: h.x, cv: h.z, wu: onU ? inward : along, wv: onU ? along : inward };
  }
  const w = Math.max(0.05, h.diameter);
  return { cu: h.x, cv: h.z, wu: w, wv: kind === 'rect' ? Math.max(0.05, h.height ?? w) : w };
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

/** A cutter solid for one hole/notch (slightly oversized so faces don't coincide). */
export function holeCutter(d: Dimensions3D, h: BoardHole): THREE.Mesh {
  const thick = faceThickness(d, h.face);
  const through = h.depth === undefined || h.depth >= thick;
  const depth = through ? thick + 2 : Math.max(0.05, h.depth!);
  let { cu, cv, wu, wv } = footprint(h);
  if ((h.kind ?? 'round') === 'notch') {
    // Run the cutter 1" past the open edge.
    const ext = 1;
    if (h.edge === 'u+') { cu += ext / 2; wu += ext; }
    else if (h.edge === 'u-') { cu -= ext / 2; wu += ext; }
    else if (h.edge === 'v-') { cv -= ext / 2; wv += ext; }
    else { cv += ext / 2; wv += ext; }
  }
  const geom = (h.kind ?? 'round') === 'round'
    ? new THREE.CylinderGeometry(wu / 2, wu / 2, depth, 32)
    : new THREE.BoxGeometry(wu, depth, wv);
  const { u, v, n } = faceAxes(h.face);
  // Right-handed basis: X = u, Y = n, Z = u × n (± v; the box is symmetric).
  const basis = new THREE.Matrix4().makeBasis(u, n, u.clone().cross(n));
  const mesh = new THREE.Mesh(geom);
  mesh.quaternion.setFromRotationMatrix(basis);
  const surface = n.clone().multiplyScalar(thick / 2).addScaledVector(u, cu).addScaledVector(v, cv);
  mesh.position.copy(through ? surface.addScaledVector(n, -thick / 2) : surface.addScaledVector(n, -(depth / 2 - 0.01)));
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
  const f = footprint(h);
  return { hu: f.wu / 2, hv: f.wv / 2 };
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
  if ((h.kind ?? 'round') === 'notch') {
    const r3n = (n: number) => Math.round(n * 1000) / 1000;
    // Snap to the nearest edge, then slide along it.
    const dist = { 'u-': h.x + u / 2, 'u+': u / 2 - h.x, 'v-': h.z + v / 2, 'v+': v / 2 - h.z } as const;
    const edge = (Object.keys(dist) as Array<keyof typeof dist>).reduce((a, b) => (dist[b] < dist[a] ? b : a));
    const along = Math.min(Math.max(0.05, h.diameter), edge[0] === 'u' ? v : u);
    const inward = Math.min(Math.max(0.05, h.height ?? along / 2), (edge[0] === 'u' ? u : v));
    const n: BoardHole = { ...h, edge, diameter: r3n(along), height: r3n(inward) };
    if (edge[0] === 'u') {
      const lim = Math.max(0, v / 2 - along / 2);
      return { ...n, x: r3n((edge === 'u+' ? 1 : -1) * (u / 2 - inward / 2)), z: r3n(Math.max(-lim, Math.min(lim, h.z))) };
    }
    const lim = Math.max(0, u / 2 - along / 2);
    return { ...n, z: r3n((edge === 'v+' ? 1 : -1) * (v / 2 - inward / 2)), x: r3n(Math.max(-lim, Math.min(lim, h.x))) };
  }
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

const EDGE_NAMES: Record<NonNullable<BoardHole['face']>, Record<NonNullable<BoardHole['edge']>, string>> = {
  top: { 'u-': 'Left edge', 'u+': 'Right edge', 'v-': 'Front edge', 'v+': 'Back edge' },
  front: { 'u-': 'Left edge', 'u+': 'Right edge', 'v-': 'Bottom edge', 'v+': 'Top edge' },
  side: { 'u-': 'Back edge', 'u+': 'Front edge', 'v-': 'Bottom edge', 'v+': 'Top edge' },
};

export function describeHole(h: BoardHole, unit: string, scale: number): string {
  const c = (v: number) => String(Math.round(v * scale * 100) / 100);
  const face = (h.face ?? 'top');
  if ((h.kind ?? 'round') === 'notch') {
    const edge = EDGE_NAMES[face][h.edge ?? 'v+'];
    return `Notch ${c(h.diameter)} × ${c(h.height ?? h.diameter / 2)} ${unit} · ${face === 'top' ? '' : `${face[0].toUpperCase() + face.slice(1)} `}${edge}${h.depth !== undefined ? ` · ${c(h.depth)} deep` : ''}`;
  }
  const size = (h.kind ?? 'round') === 'rect'
    ? `Square ${c(h.diameter)}${(h.height ?? h.diameter) !== h.diameter ? `×${c(h.height!)}` : ''} ${unit}`
    : `Round Ø ${c(h.diameter)} ${unit}`;
  return `${size} · ${face[0].toUpperCase() + face.slice(1)}${h.depth !== undefined ? ` · ${c(h.depth)} deep` : ''}`;
}
