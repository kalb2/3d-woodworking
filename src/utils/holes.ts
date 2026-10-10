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

export function newHole(o: FurnitureObject, index = getHoles(o).length): BoardHole {
  const d = o.dimensions;
  const size = Math.max(0.25, Math.min(1, Math.min(d.length, d.width) / 4));
  return { id: `hole_${Date.now()}_${index}`, x: 0, z: 0, diameter: Math.round(size * 4) / 4, face: 'top' };
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

/** Hole row currently focused in Properties (highlighted on the part). */
export const useHoleFocus = create<{ objectId: string | null; holeId: string | null; set: (objectId: string | null, holeId: string | null) => void }>((set) => ({
  objectId: null,
  holeId: null,
  set: (objectId, holeId) => set({ objectId, holeId }),
}));
