import { describe, expect, it } from 'vitest';
import type { FurnitureObject, SnapSettings } from '../types/furniture';
import { calculateSnappedPosition } from './snapUtils';
import { pairContact } from '../joinery/joints';

const mat = { type: 'wood', color: '#c8a27a', grain: 'oak', roughness: 0.6, metalness: 0 } as unknown as FurnitureObject['material'];
// A flat 24" x 6" board, 3/4" thick, lying on the floor (Kaleb's Planer Table Saw Stand case).
const board = (id: string, x: number, y = 0.375, z = 0): FurnitureObject => ({
  id, name: id, shape: 'board', dimensions: { length: 24, height: 0.75, width: 6 }, position: { x, y, z }, rotation: { x: 0, y: 0, z: 0 }, material: mat,
} as FurnitureObject);
const settings: SnapSettings = { enabled: true, faceSnap: true, gridSnap: false, gridSize: 0.5, floorCollision: true };
const a = board('a', 0);

describe('two 3/4" boards butted end to end on the floor', () => {
  it('a sliver of end overlap butts the ends and stays on the floor (no climbing to 0.75)', () => {
    const mover = board('m', 30);
    const r = calculateSnappedPosition(mover, { x: 24 - 0.3, y: 0.375, z: 0.1 }, [a], settings, { dragAxis: 'xz' });
    expect(r.position.y).toBeCloseTo(0.375, 9); // bottom still on the floor
    expect(r.position.x).toBeCloseTo(24, 9); // ends touching
    expect(r.position.z).toBeCloseTo(0, 9); // sides lined up
    expect(r.hint).toBe('Ends touching · Tops flush');
    expect(pairContact(a, { ...mover, position: r.position })).not.toBeNull(); // Join shows
  });

  it('beside it with a small gap also butts at the same height', () => {
    const r = calculateSnappedPosition(board('m', 30), { x: 24 + 0.8, y: 0.375, z: 0 }, [a], settings, { dragAxis: 'x' });
    expect(r.position).toEqual({ x: 24, y: 0.375, z: 0 });
  });

  it('edge to edge: butts the long edges, tops flush, Join available', () => {
    const r = calculateSnappedPosition(board('m', 30), { x: 0.3, y: 0.375, z: 6 - 0.2 }, [a], settings, { dragAxis: 'xz' });
    expect(r.position.y).toBeCloseTo(0.375, 9);
    expect(r.position.z).toBeCloseTo(6, 9);
    expect(r.hint).toBe('Edges touching · Tops flush');
    expect(pairContact(a, board('m', r.position.x, r.position.y, r.position.z))).not.toBeNull();
  });

  it('only stacks when mostly over the other board, or when dragged vertically', () => {
    const over = calculateSnappedPosition(board('m', 30), { x: 4, y: 0.375, z: 0 }, [a], settings, { dragAxis: 'xz' });
    expect(over.position.y).toBeCloseTo(1.125, 9);
    expect(over.hint).toMatch(/^On top/);
    const lifted = calculateSnappedPosition(board('m', 22), { x: 22, y: 1.3, z: 0 }, [a], settings, { dragAxis: 'y' });
    expect(lifted.position.y).toBeCloseTo(1.125, 9);
  });

  it('Join counts butts within ~1/32", not boards that only meet at a corner line', () => {
    expect(pairContact(a, board('m', 24 + 1 / 32))).not.toBeNull();
    expect(pairContact(a, board('m', 24 - 1 / 32))).not.toBeNull();
    // The old bug: raised onto the top, ends overlapping — no real contact.
    expect(pairContact(a, board('m', 24, 1.125))).toBeNull();
  });
});
