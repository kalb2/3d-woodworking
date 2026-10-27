import { describe, expect, it } from 'vitest';
import { dim, dimBare, fitRect, niceScale, overallSize, partSize, planDate } from './format';

describe('plan dimension text', () => {
  it('writes inches as shop fractions', () => {
    expect(dim(11.75, 'in')).toBe('11 3/4"');
    expect(dim(0.375, 'in')).toBe('3/8"');
    expect(dim(30.3125, 'in')).toBe('30 5/16"');
    expect(dimBare(34.5, 'in')).toBe('34 1/2');
    expect(dimBare(72, 'in')).toBe('72');
  });
  it('labels overall and part sizes', () => {
    expect(overallSize({ w: 36, h: 72, d: 12 }, 'in')).toBe('W 36" × H 72" × D 12"');
    expect(partSize(35, 11.5, 0.75, 'in')).toBe('35" × 11 1/2" × 3/4"');
  });
  it('dates in long form', () => {
    expect(planDate(new Date(2026, 9, 27))).toBe('October 27, 2026');
  });
});

describe('drawing scale', () => {
  it('picks the largest standard scale that fits', () => {
    // 48" × 84" into 400 × 500 pt: 1:12 is 288 × 504 (too tall), 1:16 fits.
    expect(niceScale({ w: 48, h: 84 }, { w: 400, h: 500 })).toEqual({ ptPerIn: 72 / 16, label: 'Scale 1:16' });
    expect(niceScale({ w: 2, h: 2 }, { w: 400, h: 400 }).label).toBe('Scale 1:1');
  });
  it('falls back to not-to-scale for huge pieces', () => {
    const s = niceScale({ w: 2000, h: 10 }, { w: 300, h: 300 });
    expect(s.label).toBe('Not to scale');
    expect(2000 * s.ptPerIn).toBeLessThanOrEqual(300 + 1e-6);
  });
  it('centers a fitted rectangle', () => {
    const r = fitRect({ w: 10, h: 5 }, { x: 0, y: 0, w: 100, h: 100 });
    expect(r.scale).toBe(10);
    expect(r.x).toBe(0);
    expect(r.y).toBe(25);
  });
});
