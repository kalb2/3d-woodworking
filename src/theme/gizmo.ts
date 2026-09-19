/**
 * Moblo axis paint — sampled from the Move / Rotate / Resize reference shots.
 * Light-mode iOS system RGB (handles render unlit so these hexes hit the screen).
 */
export const GIZMO_AXIS = {
  x: '#FF3B30',
  y: '#34C759',
  z: '#007AFF',
} as const;

export const GIZMO_HUB_FILL = '#F3F5F8';
export const GIZMO_HUB_EDGE = '#C5CDD6';
export const GIZMO_HUB_CHEVRON = '#8A96A3';

/**
 * Screen-size compensation for grip *meshes only*.
 * Positions stay on the part bounds — never scale the whole gizmo from the origin.
 * Cap is tight so handles stay tappable without swallowing the wood.
 */
export const GIZMO_DISTANCE_REF = 88;
export const GIZMO_SCALE_MIN = 0.72;
export const GIZMO_SCALE_MAX = 1.35;

export const GIZMO_OUTLINE_WIDTH = 2.25;

/** Extra air so rings / arrows sit just outside the mesh instead of z-fighting. */
export const GIZMO_BOUND_PAD = 1.05;

export function partHalfExtents(length: number, height: number, width: number) {
  return {
    hx: Math.max(length, 0.01) / 2,
    hy: Math.max(height, 0.01) / 2,
    hz: Math.max(width, 0.01) / 2,
  };
}

/** Per-axis hoop radius: wraps that plane’s silhouette so rings hug the part. */
export function boundRingRadiusForAxis(
  axis: 'x' | 'y' | 'z',
  length: number,
  height: number,
  width: number,
  pad = GIZMO_BOUND_PAD,
) {
  const { hx, hy, hz } = partHalfExtents(length, height, width);
  const pair = axis === 'x' ? [hy, hz] : axis === 'y' ? [hx, hz] : [hx, hy];
  return Math.hypot(pair[0], pair[1]) + pad;
}

/** Circular triad sized to wrap the part's bounding box (not a tiny center widget). */
export function boundRingRadius(length: number, height: number, width: number, pad = GIZMO_BOUND_PAD) {
  const { hx, hy, hz } = partHalfExtents(length, height, width);
  return Math.hypot(hx, hy, hz) + pad;
}

export function boundRingTube(radius: number) {
  return THREE_CLAMP(radius * 0.01, 0.055, 0.14);
}

function THREE_CLAMP(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
