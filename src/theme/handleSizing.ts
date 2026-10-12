/**
 * Screen-space sizing for gizmo handles. Pure helpers (tested); the viewport
 * applies them every frame.
 */

/** Visual pad target (CSS px) for faces toward / away from the camera. */
export const PAD_NEAR_PX = 20;
export const PAD_FAR_PX = 12;
/** Minimum touch target (CSS px ≈ pt on iOS). */
export const HIT_PX = 44;
/** A pad is never drawn larger than this share of the face it sits on. */
export const PAD_FACE_SHARE = 0.4;

/** World units covered by one CSS pixel at `dist` from a perspective camera. */
export function worldPerPixel(dist: number, fovDeg: number, viewportPx: number): number {
  if (!(viewportPx > 0) || !(dist > 0)) return 0;
  return (2 * dist * Math.tan(((fovDeg || 45) * Math.PI) / 360)) / viewportPx;
}

/**
 * Scale for a pad's paint. Never smaller than today's look (`baseScale`),
 * grows toward a constant on-screen size, but stays within a share of the face
 * so small parts keep their current handles.
 */
export function padVisualScale(opts: {
  baseScale: number; // existing distance-based scale (current look)
  near: boolean;
  farShrink: number; // existing far-face shrink (e.g. 0.24)
  wpp: number; // world per px
  padSide: number; // pad geometry side (world, at scale 1)
  faceSize: number; // smaller side of the face the pad sits on (world)
}): number {
  const current = opts.baseScale * (opts.near ? 1 : opts.farShrink);
  const screen = ((opts.near ? PAD_NEAR_PX : PAD_FAR_PX) * opts.wpp) / opts.padSide;
  const cap = (PAD_FACE_SHARE * opts.faceSize) / opts.padSide;
  return Math.max(current, Math.min(screen, cap));
}

/** Scale so a hit shape of `hitSide` world units covers at least HIT_PX on screen. */
export function hitScale(baseScale: number, wpp: number, hitSide: number): number {
  return Math.max(baseScale, (HIT_PX * wpp) / hitSide);
}

/**
 * Sort key for overlapping handle hits: the handle whose center is closest to
 * the pick ray wins (≈ nearest on screen), always ahead of solid parts.
 */
export function handleSortDistance(rayToCenter: number): number {
  return -1e6 + rayToCenter;
}
