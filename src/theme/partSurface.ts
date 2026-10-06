import type { Dimensions3D, ShapeType } from '../types/furniture';

export type MeshKind = 'box' | 'cylinder' | 'sphere';

export interface MeshExtents {
  hx: number;
  hy: number;
  hz: number;
  kind: MeshKind;
}

/** Finite size used for meshes and grips. Zero or NaN collapses the matrix and can kill the GPU. */
export function positiveSize(value: number, floor = 0.01): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return floor;
  return Math.max(n, floor);
}

/**
 * Half-extents of the drawn mesh. Each axis follows its own dimension, including
 * spheres and round parts, so a face pull changes that axis the way a box does.
 */
export function meshExtents(shape: ShapeType, dimensions: Dimensions3D): MeshExtents {
  const hx = positiveSize(dimensions.length) / 2;
  const hy = positiveSize(dimensions.height) / 2;
  const hz = positiveSize(dimensions.width) / 2;

  if (shape === 'cylinder' || shape === 'pole') return { hx, hy, hz, kind: 'cylinder' };
  if (shape === 'sphere') return { hx, hy, hz, kind: 'sphere' };
  return { hx, hy, hz, kind: 'box' };
}

export type FaceAxis = '+x' | '-x' | '+y' | '-y' | '+z' | '-z';

/**
 * Center of the face you'd pull — sides for X/Z, top/bottom for Y.
 * Same for box, cylinder wall, and sphere. Never the top-edge cluster.
 */
export function gripAnchor(axis: FaceAxis, extents: MeshExtents): [number, number, number] {
  const { hx, hy, hz } = extents;
  switch (axis) {
    case '+x': return [hx, 0, 0];
    case '-x': return [-hx, 0, 0];
    case '+y': return [0, hy, 0];
    case '-y': return [0, -hy, 0];
    case '+z': return [0, 0, hz];
    case '-z': return [0, 0, -hz];
  }
}
