import { describe, expect, it } from 'vitest';
import { contentBox, paginate, PAPER, stackRows, stickSegments } from './layout';
import { KERF } from '../utils/stock';

describe('plan layout math', () => {
  it('fills pages in order and starts a new one when the next block does not fit', () => {
    expect(paginate([300, 300, 300, 100], 650, 10)).toEqual([[0, 1], [2, 3]]);
    expect(paginate([], 650)).toEqual([]);
  });
  it('gives an oversize block a page of its own', () => {
    expect(paginate([100, 900, 100], 650, 10)).toEqual([[0], [1], [2]]);
  });
  it('stacks overlapping dimension lines into separate rows', () => {
    expect(stackRows([[0, 10], [20, 30], [0, 25], [5, 8]], 1)).toEqual([0, 0, 1, 2]);
  });
  it('lays out stick cuts with a kerf between them', () => {
    const segs = stickSegments([24, 12]);
    expect(segs[0]).toEqual([0, 24]);
    expect(segs[1][0]).toBeCloseTo(24 + KERF);
    expect(segs[1][1]).toBeCloseTo(36 + KERF);
  });
  it('has Letter and A4 content boxes inside the margins', () => {
    for (const p of ['letter', 'a4'] as const) {
      const b = contentBox(p);
      expect(b.x + b.w).toBeLessThan(PAPER[p].w);
      expect(b.y + b.h).toBeLessThan(PAPER[p].h);
    }
  });
});
