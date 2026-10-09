import { describe, expect, it } from 'vitest';
import { describeWall, wallsFromScan } from './wallScan';
import { MEDIA_WALL_DEFAULTS, openingReferenceParts, MEDIA_WALL_TAG } from '../generators/mediaWall';

const scan = {
  walls: [
    { id: 'a', width: 144.04, height: 96, transform: [] },
    { id: 'b', width: 120, height: 96, transform: [] },
  ],
  windows: [{ id: 'w1', kind: 'window' as const, wallId: 'a', width: 36, height: 48, offsetX: 20, bottom: 30 }],
  doors: [{ id: 'd1', kind: 'door' as const, wallId: 'b', width: 32, height: 80, offsetX: 4, bottom: 0 }],
  openings: [],
};

describe('wallsFromScan', () => {
  it('groups openings by wall and labels them', () => {
    const walls = wallsFromScan(scan);
    expect(walls).toHaveLength(2);
    expect(walls[0].openings.map((o) => o.id)).toEqual(['w1']);
    expect(describeWall(walls[0])).toBe('Wall 1 — 144×96 in, 1 window');
    expect(describeWall(walls[1])).toBe('Wall 2 — 120×96 in, 1 door');
  });
});

describe('openingReferenceParts', () => {
  it('places tagged panels on the wall face from the left edge', () => {
    const [p] = openingReferenceParts(MEDIA_WALL_DEFAULTS, wallsFromScan(scan)[0].openings);
    expect(p.generator).toBe(MEDIA_WALL_TAG);
    expect(p.position.x).toBeCloseTo(-72 + 20 + 18);
    expect(p.position.y).toBeCloseTo(30 + 24);
  });
});
