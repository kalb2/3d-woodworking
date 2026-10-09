import { describe, expect, it } from 'vitest';
import { fitMediaWall, freeSpans, obstaclesFor, partOverlapsObstacle } from './fitMediaWall';
import { MEDIA_WALL_DEFAULTS } from './mediaWall';
import type { ScannedOpening } from '../types/furniture';

const door: ScannedOpening = { id: 'd', kind: 'door', width: 32, height: 80, offsetX: 10, bottom: 0 };
const highWindow: ScannedOpening = { id: 'w', kind: 'window', width: 40, height: 30, offsetX: 150, bottom: 50 };
const lowWindow: ScannedOpening = { id: 'lw', kind: 'window', width: 30, height: 40, offsetX: 220, bottom: 20 };
const wall = { width: 260, height: 96, openings: [door, highWindow, lowWindow] };

describe('freeSpans', () => {
  it('blocks doors and low windows, not high windows', () => {
    expect(freeSpans(260, wall.openings, 28)).toEqual([{ x0: -130, x1: -120 }, { x0: -88, x1: 90 }, { x0: 120, x1: 130 }]);
  });
});

describe('fitMediaWall', () => {
  for (const upperStyle of ['shelves', 'cabinets'] as const) {
    for (const tvSize of [43, 65, 85]) {
      it(`never overlaps an opening (${upperStyle}, ${tvSize}")`, () => {
        const fit = fitMediaWall({ ...MEDIA_WALL_DEFAULTS, upperStyle, tvSize }, wall);
        const obstacles = obstaclesFor(wall.width, wall.openings);
        expect(fit.parts.length).toBeGreaterThan(5);
        for (const p of fit.parts) for (const o of obstacles) expect(partOverlapsObstacle(p, o)).toBe(false);
      });
    }
  }
  it('defaults to the largest span, centered', () => {
    const fit = fitMediaWall(MEDIA_WALL_DEFAULTS, wall);
    expect(fit.span).toEqual({ x0: -88, x1: 90 });
    expect(fit.center).toBe(1);
    expect(fit.width).toBe(178);
  });
  it('clamps a width override into the span', () => {
    const fit = fitMediaWall(MEDIA_WALL_DEFAULTS, wall, { width: 120, center: 80 });
    expect(fit.width).toBe(120);
    expect(fit.center).toBe(30);
    expect(fit.parts.every((p) => p.position.x - p.dimensions.length / 2 >= -88 - 1e-6)).toBe(true);
  });
  it('keeps base cabinets under a high window', () => {
    const w = { width: 144, height: 96, openings: [{ ...highWindow, offsetX: 52 }] };
    const fit = fitMediaWall(MEDIA_WALL_DEFAULTS, w);
    expect(fit.width).toBe(144);
    expect(fit.parts.some((p) => p.name.startsWith('Base cabinet') && Math.abs(p.position.x) < 20)).toBe(true);
  });
});
