import type { Dimensions3D, ShapeType } from '../types/furniture';

export type MeshKind = 'box' | 'cylinder' | 'sphere';

export interface MeshExtents {
  hx: number;
  hy: number;
  hz: number;
  kind: MeshKind;
}

/** How far a resting pill sits above a top face (matches the soft-capsule radius). */
export const GRIP_SURFACE_SIT = 0.52;

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
 * Anchor on the mesh: top-edge / rim for boards and cylinders, surface for spheres.
 * No AABB corner that floats off a round part.
 */
export function gripAnchor(axis: FaceAxis, extents: MeshExtents): [number, number, number] {
  const { hx, hy, hz, kind } = extents;

  if (kind === 'sphere') {
    switch (axis) {
      case '+x': return [hx, 0, 0];
      case '-x': return [-hx, 0, 0];
      case '+y': return [0, hy, 0];
      case '-y': return [0, -hy, 0];
      case '+z': return [0, 0, hz];
      case '-z': return [0, 0, -hz];
    }
  }

  const top = hy + GRIP_SURFACE_SIT;
  // Cylinders: sit on the circular rim. Boxes: inset so the pill rests on the board.
  const inset = kind === 'cylinder' ? 0 : GRIP_SURFACE_SIT;

  switch (axis) {
    case '+x': return [hx - inset, top, 0];
    case '-x': return [-hx + inset, top, 0];
    case '+y': return [0, hy, 0];
    case '-y': return [0, -hy, 0];
    case '+z': return [0, top, hz - inset];
    case '-z': return [0, top, -hz + inset];
  }
}
