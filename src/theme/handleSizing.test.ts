import { describe, expect, it } from 'vitest';
import {
  ARROW_LEN_PX, HIT_PX, PAD_FAR_PX, PAD_MIN_PX, PAD_NEAR_PX, RING_MAX_OBJECT, RING_MIN_OBJECT, RING_RADIUS_PX,
  handleSortDistance, hitInside, padScale, ringRadius, screenScale, worldPerPixel,
} from './handleSizing';

const VIEW = 820;
const wppAt = (d: number) => worldPerPixel(d, 45, VIEW);
const onScreen = (worldSize: number, wpp: number) => worldSize / wpp;

describe('one zoom-aware handle system', () => {
  it('world-per-pixel is linear in distance', () => {
    expect(wppAt(200) / wppAt(50)).toBeCloseTo(4, 6);
    expect(worldPerPixel(10, 45, 0)).toBe(0);
  });

  it('move arrows are the same modest size at any zoom (never huge)', () => {
    const base = 5.55;
    for (const d of [15, 60, 300, 2000]) {
      const len = onScreen(base * screenScale(ARROW_LEN_PX, wppAt(d), base), wppAt(d));
      expect(len).toBeCloseTo(ARROW_LEN_PX, 6);
    }
    // the grab widens to 44pt but the visual does not grow with it
    const sc = screenScale(ARROW_LEN_PX, wppAt(300), base);
    const widen = hitInside(sc, wppAt(300), 2.3);
    expect(onScreen(2.3 * sc * widen, wppAt(300))).toBeCloseTo(HIT_PX, 6);
    expect(hitInside(sc, wppAt(300), 1000)).toBe(1); // never shrinks a grab that's already big enough
  });

  it('resize pads: 20/12 px on big parts at any zoom, capped on small faces, floored at 10 px', () => {
    for (const d of [80, 400, 1500]) {
      const w = wppAt(d);
      expect(onScreen(1.35 * padScale(true, w, 1.35, 96), w)).toBeCloseTo(PAD_NEAR_PX, 6);
      expect(onScreen(1.35 * padScale(false, w, 1.35, 96), w)).toBeCloseTo(PAD_FAR_PX, 6);
    }
    const w = wppAt(400); // far away, thin board edge
    expect(onScreen(1.35 * padScale(true, w, 1.35, 0.75), w)).toBeCloseTo(PAD_MIN_PX, 6);
    const close = wppAt(25); // close up on that edge: capped to 40% of 0.75" (above the 10px floor here)
    expect(1.35 * padScale(true, close, 1.35, 0.75)).toBeCloseTo(Math.max(PAD_MIN_PX * close, Math.min(PAD_NEAR_PX * close, 0.3)), 6);
    expect(onScreen(1.35 * padScale(true, close, 1.35, 0.75), close)).toBeLessThan(PAD_NEAR_PX + 1e-6);
  });

  it('rotate rings: fixed screen radius, clamped to the part', () => {
    // medium part, normal zoom: exactly the target radius
    const w = wppAt(150);
    expect(onScreen(ringRadius(w, 8), w)).toBeCloseTo(RING_RADIUS_PX, 6);
    // tiny part zoomed in: no bigger than RING_MAX_OBJECT × its radius (but keeps a usable minimum)
    const wc = wppAt(20);
    expect(ringRadius(wc, 1)).toBeLessThanOrEqual(Math.max(RING_MAX_OBJECT * 1, 48 * wc) + 1e-9);
    // huge part: ring stays outside it
    expect(ringRadius(wppAt(150), 80)).toBeGreaterThanOrEqual(RING_MIN_OBJECT * 80);
    // far zoom: still at least ~half the minimum on screen
    const wf = wppAt(3000);
    expect(onScreen(ringRadius(wf, 15), wf)).toBeGreaterThanOrEqual(24);
  });

  it('nearest handle wins over farther overlapping grabs and over parts', () => {
    expect(handleSortDistance(0.2)).toBeLessThan(handleSortDistance(1.5));
    expect(handleSortDistance(50)).toBeLessThan(0);
  });
});
