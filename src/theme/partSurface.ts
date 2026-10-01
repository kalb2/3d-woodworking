import type { Dimensions3D, ShapeType } from '../types/furniture';

export type MeshKind = 'box' | 'cylinder' | 'sphere';

export interface MeshExtents {
  hx: number;
  hy: number;
  hz: number;
  kind: MeshKind;
}

/** Tight pad so rotate hoops kiss the silhouette instead of a loose AABB. */
export const MESH_RING_PAD = 0.18;

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

/** Ring that wraps this axis’ silhouette of the real mesh. */
export function meshRingRadius(
  shape: ShapeType,
  dimensions: Dimensions3D,
  axis: 'x' | 'y' | 'z',
  pad = MESH_RING_PAD,
) {
  const { hx, hy, hz } = meshExtents(shape, dimensions);
  const pair = axis === 'x' ? [hy, hz] : axis === 'y' ? [hx, hz] : [hx, hy];
  return Math.hypot(pair[0], pair[1]) + pad;
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
