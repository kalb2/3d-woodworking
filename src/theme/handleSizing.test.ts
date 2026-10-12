import { describe, expect, it } from 'vitest';
import { HIT_PX, PAD_FAR_PX, PAD_NEAR_PX, handleSortDistance, hitScale, padVisualScale, worldPerPixel } from './handleSizing';

const SIDE = 1.35;
const px = (scale: number, wpp: number, side = SIDE) => (scale * side) / wpp;

describe('handle sizing', () => {
  it('world-per-pixel grows with distance', () => {
    const near = worldPerPixel(50, 45, 800);
    const far = worldPerPixel(200, 45, 800);
    expect(far / near).toBeCloseTo(4, 6);
    expect(worldPerPixel(100, 45, 0)).toBe(0);
  });

  it('far face of a 25" box gets a tappable pad and a 44pt grab (was ~5px)', () => {
    const wpp = worldPerPixel(120, 45, 820); // iPad-ish view of a 25" cube
    const base = 1.35; // capped distance scale
    const oldFarPx = px(base * 0.24, wpp);
    expect(oldFarPx).toBeLessThan(8);
    const farPx = px(padVisualScale({ baseScale: base, near: false, farShrink: 0.24, wpp, padSide: SIDE, faceSize: 25 }), wpp);
    expect(farPx).toBeCloseTo(PAD_FAR_PX, 3);
    const nearPx = px(padVisualScale({ baseScale: base, near: true, farShrink: 0.24, wpp, padSide: SIDE, faceSize: 25 }), wpp);
    expect(nearPx).toBeGreaterThanOrEqual(PAD_NEAR_PX - 1e-6);
    expect(px(hitScale(base, wpp, SIDE + 0.55), wpp, SIDE + 0.55)).toBeGreaterThanOrEqual(HIT_PX - 1e-6);
  });

  it('constant apparent size when zooming out on a big part', () => {
    const a = worldPerPixel(150, 45, 820), b = worldPerPixel(600, 45, 820);
    const s = (w: number) => px(padVisualScale({ baseScale: 1.35, near: true, farShrink: 0.24, wpp: w, padSide: SIDE, faceSize: 96 }), w);
    expect(s(a)).toBeCloseTo(s(b), 6);
  });

  it('small parts keep the current look (never smaller, capped by the face)', () => {
    const wpp = worldPerPixel(40, 45, 820);
    const base = 0.85;
    const v = padVisualScale({ baseScale: base, near: true, farShrink: 0.24, wpp, padSide: SIDE, faceSize: 0.75 });
    expect(v).toBe(base); // thin board edge: unchanged
    const far = padVisualScale({ baseScale: base, near: false, farShrink: 0.24, wpp, padSide: SIDE, faceSize: 0.75 });
    expect(far).toBeGreaterThanOrEqual(base * 0.24);
    expect(far * SIDE).toBeLessThanOrEqual(0.4 * 0.75 + 1e-9); // within 40% of the face
  });

  it('hit never shrinks below today', () => {
    expect(hitScale(1.2, 0.0001, 2)).toBe(1.2);
  });

  it('overlapping grabs: nearest-to-finger handle sorts first, ahead of any part', () => {
    expect(handleSortDistance(0.2)).toBeLessThan(handleSortDistance(1.5));
    expect(handleSortDistance(50)).toBeLessThan(0);
  });
});
