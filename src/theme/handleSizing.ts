/**
 * One zoom-aware sizing system for every gizmo handle (move, resize, rotate).
 * Everything is in CSS px (≈ pt on iOS) and converted to world units each
 * frame, so handles look the same at any zoom. Pure helpers; tune here.
 */

/* ---- visible sizes (px) ---- */
/** Resize pad side, faces toward / away from the camera. */
export const PAD_NEAR_PX = 20;
export const PAD_FAR_PX = 12;
/** Never let a pad be drawn bigger than this share of the face it sits on… */
export const PAD_FACE_SHARE = 0.4;
/** …but never smaller than this, even on tiny parts. */
export const PAD_MIN_PX = 10;
/** Move arrow: total length from the center out to the tip. */
export const ARROW_LEN_PX = 54;
/** Move hub (center disc) diameter. */
export const HUB_PX = 24;
/** Rotate ring radius on screen, and its clamps. */
export const RING_RADIUS_PX = 80;
export const RING_MIN_PX = 48;
/** Ring may be at most this many times the part's radius (small parts)… */
export const RING_MAX_OBJECT = 2.2;
/** …and at least this many (large parts: ring stays outside the part). */
export const RING_MIN_OBJECT = 1.08;
/** Rotate drag pill width. */
export const PILL_PX = 18;

/* ---- touch targets (px) ---- */
export const HIT_PX = 44;
/** Half-thickness of the invisible grab tube around each ring. */
export const RING_HIT_PX = 16;

/** World units covered by one CSS pixel at `dist` from a perspective camera. */
export function worldPerPixel(dist: number, fovDeg: number, viewportPx: number): number {
  if (!(viewportPx > 0) || !(dist > 0)) return 0;
  return (2 * dist * Math.tan(((fovDeg || 45) * Math.PI) / 360)) / viewportPx;
}

/** Scale that draws a shape of `baseWorld` units at `px` on screen. */
export function screenScale(px: number, wpp: number, baseWorld: number): number {
  return baseWorld > 0 ? (px * wpp) / baseWorld : 1;
}

/** Resize pad scale: constant on screen, capped by the face, floored at PAD_MIN_PX. */
export function padScale(near: boolean, wpp: number, padSide: number, faceSize: number): number {
  const want = (near ? PAD_NEAR_PX : PAD_FAR_PX) * wpp;
  const cap = PAD_FACE_SHARE * faceSize;
  const floor = PAD_MIN_PX * wpp;
  return Math.max(floor, Math.min(want, cap)) / padSide;
}

/** Scale (inside a visual already at `parentScale`) so a grab of `hitWorld` is HIT_PX wide; never shrinks below the visual. */
export function hitInside(parentScale: number, wpp: number, hitWorld: number, px = HIT_PX): number {
  if (!(parentScale > 0) || !(hitWorld > 0)) return 1;
  return Math.max(1, (px * wpp) / (hitWorld * parentScale));
}

/** World radius for the rotate rings around a part of bounding radius `objectRadius`. */
export function ringRadius(wpp: number, objectRadius: number): number {
  const r = objectRadius > 0 ? objectRadius : 1;
  let radius = RING_RADIUS_PX * wpp;
  radius = Math.min(radius, Math.max(RING_MAX_OBJECT * r, RING_MIN_PX * wpp));
  radius = Math.max(radius, RING_MIN_OBJECT * r, RING_MIN_PX * wpp * 0.5);
  return radius;
}

/** Overlapping grabs: the handle whose center is nearest the pick ray wins, always ahead of parts. */
export function handleSortDistance(rayToCenter: number): number {
  return -1e6 + rayToCenter;
}
