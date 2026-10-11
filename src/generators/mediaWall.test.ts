import { describe, expect, it } from 'vitest';
import { generateMediaWall, MEDIA_WALL_DEFAULTS, autoBaseCount, type MediaWallInput, type MediaWallPart } from './mediaWall';

const box = (p: MediaWallPart) => ({
  x0: p.position.x - p.dimensions.length / 2, x1: p.position.x + p.dimensions.length / 2,
  y0: p.position.y - p.dimensions.height / 2, y1: p.position.y + p.dimensions.height / 2,
  z0: p.position.z - p.dimensions.width / 2, z1: p.position.z + p.dimensions.width / 2,
});
const E = 5e-3; // parts are rounded to 0.001"

function check(input: MediaWallInput) {
  const parts = generateMediaWall(input);
  const wall = box(parts[0]);
  const boxes = parts.map(box);
  for (const p of parts) {
    expect(p.dimensions.length).toBeGreaterThan(0);
    expect(p.dimensions.width).toBeGreaterThan(0);
    expect(p.dimensions.height).toBeGreaterThan(0);
    expect(p.generator).toBe('media-wall');
  }
  // inside wall footprint
  for (const b of boxes) {
    expect(b.x0).toBeGreaterThanOrEqual(wall.x0 - E);
    expect(b.x1).toBeLessThanOrEqual(wall.x1 + E);
    expect(b.y0).toBeGreaterThanOrEqual(-E);
    expect(b.y1).toBeLessThanOrEqual(wall.y1 + E);
  }
  // no overlaps
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    const ov = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > E
      && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > E
      && Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) > E;
    expect(ov, `${parts[i].name} overlaps ${parts[j].name}`).toBe(false);
  }
  // nothing floating: each part touches floor or rests on another part's top
  boxes.forEach((b, i) => {
    if (b.y0 < E) return;
    const supported = boxes.some((o, j) => j !== i && Math.abs(o.y1 - b.y0) < 1e-3
      && Math.min(o.x1, b.x1) - Math.max(o.x0, b.x0) > E && Math.min(o.z1, b.z1) - Math.max(o.z0, b.z0) > E)
      || boxes.some((o, j) => j !== i && j !== 0 && (Math.abs(o.x1 - b.x0) < 1e-3 || Math.abs(o.x0 - b.x1) < 1e-3)
      && Math.min(o.y1, b.y1) - Math.max(o.y0, b.y0) > E);
    expect(supported, `${parts[i].name} floats`).toBe(true);
  });
  return parts;
}

describe('generateMediaWall', () => {
  it('is deterministic', () => {
    expect(generateMediaWall(MEDIA_WALL_DEFAULTS)).toEqual(generateMediaWall(MEDIA_WALL_DEFAULTS));
  });
  it('defaults: 4 base cabinets, centered TV panel, symmetric shelves', () => {
    const parts = check(MEDIA_WALL_DEFAULTS);
    expect(parts.filter((p) => p.name.startsWith('Base cabinet'))).toHaveLength(autoBaseCount(144));
    const tv = parts.find((p) => p.name.startsWith('TV back panel'))!;
    expect(tv.position.x).toBe(0);
    const top = box(parts.find((p) => p.name === 'Top panel')!);
    // a 65" TV centered at 42" clears the base top
    expect(top.y1).toBeLessThanOrEqual(42 - (65 * 0.4903) / 2);
    expect(box(tv).y0).toBeCloseTo(top.y1);
    const L = parts.filter((p) => p.name.startsWith('Shelf L'));
    const R = parts.filter((p) => p.name.startsWith('Shelf R'));
    expect(L.length).toBe(R.length);
    L.forEach((s, i) => { expect(R[i].position.x).toBeCloseTo(-s.position.x); expect(R[i].position.y).toBe(s.position.y); });
    expect(parts[0].name).toBe('Reference wall');
  });
  it('cabinet uppers + edge sizes stay valid', () => {
    check({ ...MEDIA_WALL_DEFAULTS, upperStyle: 'cabinets' });
    check({ wallWidth: 72, wallHeight: 84, tvSize: 85, upperStyle: 'cabinets', baseDepth: 24, baseCount: 3 });
    check({ wallWidth: 240, wallHeight: 120, tvSize: 50, upperStyle: 'shelves', baseDepth: 12, baseCount: 7 });
    check({ wallWidth: 10, wallHeight: 10, tvSize: 200, upperStyle: 'shelves', baseDepth: 0 });
  });
  it('respects edited base count', () => {
    const parts = generateMediaWall({ ...MEDIA_WALL_DEFAULTS, baseCount: 6 });
    expect(parts.filter((p) => p.name.startsWith('Base cabinet'))).toHaveLength(6);
  });
});
