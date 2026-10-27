import { describe, expect, it } from 'vitest';
import type { FurnitureObject } from '../types/furniture';
import { convexHull, explodeOffsets, insideConvex, isoParts, levelLines, orthoView, pieceBox, project } from './geometry';
import { templateProject } from './testProjects';

const board = (id: string, pos: [number, number, number], dims: [number, number, number]): FurnitureObject => ({
  id, name: id, shape: 'board', position: { x: pos[0], y: pos[1], z: pos[2] }, rotation: { x: 0, y: 0, z: 0 },
  dimensions: { length: dims[0], height: dims[1], width: dims[2] }, material: { species: 'birch' },
} as unknown as FurnitureObject);

describe('projection', () => {
  it('maps world axes to each view', () => {
    const p = { x: 1, y: 2, z: 3 };
    expect(project('front', p)).toEqual([1, 2, 3]);
    expect(project('side', p)).toEqual([-3, 2, 1]);
    expect(project('top', p)).toEqual([1, -3, 2]);
  });
  it('builds a convex hull and tests points inside it', () => {
    const hull = convexHull([[0, 0], [2, 0], [2, 2], [0, 2], [1, 1], [1, 0]]);
    expect(hull).toHaveLength(4);
    expect(insideConvex(hull, [1, 1])).toBe(true);
    expect(insideConvex(hull, [3, 1])).toBe(false);
    // On the edge counts as outside (only strictly hidden lines dash).
    expect(insideConvex(hull, [2, 1])).toBe(false);
  });
});

describe('orthographic views', () => {
  it('dashes the edges of a part hidden behind a nearer one', () => {
    const back = board('back', [0, 0, -5], [10, 10, 1]);
    const small = board('small', [0, 0, -10], [4, 4, 1]); // fully behind `back` in the front view
    const v = orthoView([back, small], 'front');
    const smallStrokes = v.strokes.filter((s) => s.partId === 'small');
    expect(smallStrokes.length).toBeGreaterThan(0);
    expect(smallStrokes.every((s) => s.hidden)).toBe(true);
    expect(v.strokes.filter((s) => s.partId === 'back').every((s) => !s.hidden)).toBe(true);
  });
  it('outlines a bookshelf to its overall size', () => {
    const p = templateProject('bookshelf', 'Bookshelf');
    const parts = p.objects.filter((o) => o.shape !== 'group');
    const v = orthoView(parts, 'front');
    expect(v.bounds.maxX - v.bounds.minX).toBeCloseTo(36, 3);
    expect(v.bounds.maxY - v.bounds.minY).toBeCloseTo(72, 3);
    const box = pieceBox(parts);
    expect(box.size.d).toBeCloseTo(12, 3);
    // Bottom, four shelves and the top give level lines for the height chain.
    expect(levelLines(parts, box).length).toBeGreaterThanOrEqual(12);
  });
});

describe('exploded view', () => {
  it('moves parts away from the center and pulls outer panels clear', () => {
    const left = board('left', [-10, 0, 0], [1, 20, 10]);
    const right = board('right', [10, 0, 0], [1, 20, 10]);
    const off = explodeOffsets([left, right]);
    expect(off.get('left')!.x).toBeLessThan(-4);
    expect(off.get('right')!.x).toBeGreaterThan(4);
    expect(off.get('left')!.y).toBeCloseTo(0);
  });
  it('draws boxes with three visible faces, far to near', () => {
    const iso = isoParts([board('a', [0, 0, 0], [2, 2, 2]), board('b', [5, 5, 5], [2, 2, 2])]);
    expect(iso.map((p) => p.id)).toEqual(['a', 'b']);
    expect(iso[0].faces).toHaveLength(3);
  });
});
