import type { Dimensions3D, ShapeType } from '../types/furniture';

export type MeshKind = 'box' | 'cylinder' | 'sphere';

export interface MeshExtents {
  hx: number;
  hy: number;
  hz: number;
  kind: MeshKind;
}

/**
 * Half-extents of the *drawn* mesh, not the authored AABB.
 * Cylinders / poles use min(length, width) / 2. Spheres use min(l, w, h) / 2.
 */
export function meshExtents(shape: ShapeType, dimensions: Dimensions3D): MeshExtents {
  const hy = Math.max(dimensions.height, 0.01) / 2;

  if (shape === 'cylinder' || shape === 'pole') {
    const radius = Math.max(Math.min(dimensions.length, dimensions.width), 0.01) / 2;
    return { hx: radius, hy, hz: radius, kind: 'cylinder' };
  }

  if (shape === 'sphere') {
    const radius = Math.max(Math.min(dimensions.length, dimensions.width, dimensions.height), 0.01) / 2;
    return { hx: radius, hy: radius, hz: radius, kind: 'sphere' };
  }

  return {
    hx: Math.max(dimensions.length, 0.01) / 2,
    hy,
    hz: Math.max(dimensions.width, 0.01) / 2,
    kind: 'box',
  };
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
