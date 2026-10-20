import { describe, expect, it } from 'vitest';
import type { BoardHole, FurnitureObject } from '../types/furniture';
import { getHoles, holesUpdate, inferHoleAnchor, reanchorHoles } from './holes';
import { pushPull } from './pushPull';
import { stretchObjects } from './groupStretch';
import { spots } from '../joinery/joints';

const mat = { id: 'plywood', name: 'Plywood', species: 'plywood', baseColor: '#000', secondaryColor: '#000', grainIntensity: 0, grainScale: 1, roughness: 1, metalness: 0, varnishSheen: 'matte' } as FurnitureObject['material'];
const d = { length: 24, height: 0.75, width: 12 };
// A hole 2" in from the left end, one centered, one 3" from the right end.
const left: BoardHole = { id: 'L', x: -10, z: 0, diameter: 0.5 };
const mid: BoardHole = { id: 'C', x: 0, z: 0, diameter: 0.5 };
const right: BoardHole = { id: 'R', x: 9, z: 2, diameter: 0.5 };
const board = (holes: BoardHole[]): FurnitureObject => ({
  id: 'b', name: 'b', shape: 'board', dimensions: { ...d }, position: { x: 0, y: 0.375, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, material: mat,
  board: { cornerRadius: 0, holes, edge: 'none' },
});
/** World x of a hole on an unturned board (top face). */
const worldX = (o: FurnitureObject, id: string) => o.position.x + getHoles(o).find((h) => h.id === id)!.x;

describe('anchored holes', () => {
  it('infers the nearest edge (centered stays centered); notches hold their edge', () => {
    expect(inferHoleAnchor(d, left)).toEqual({ u: 'start', v: 'center' });
    expect(inferHoleAnchor(d, right)).toEqual({ u: 'end', v: 'end' });
    expect(inferHoleAnchor(d, { id: 'n', kind: 'notch', edge: 'v+', x: -3, z: 5.6, diameter: 1.5, height: 0.75 })).toEqual({ u: 'start', v: 'end' });
  });

  it('keeps distance from its edge when the part grows (pull the right end out 6")', () => {
    const o = board([left, mid, right]);
    const next = { ...o, ...pushPull(o, '+x', 6, { snap: false, step: 0.25, unit: 'in', floorOn: false }) };
    const moved = { ...next, board: { ...next.board!, holes: reanchorHoles(getHoles(o), o.dimensions, next.dimensions) } };
    expect(worldX(moved, 'L')).toBeCloseTo(-10); // anchored left, left face fixed: stays
    expect(worldX(moved, 'R')).toBeCloseTo(15); // anchored right: rides with the right face
    expect(worldX(moved, 'C')).toBeCloseTo(3); // centered: stays centered
    expect(getHoles(moved).find((h) => h.id === 'R')!.z).toBe(2); // width didn't change
  });

  it('pushing the anchored face moves the hole with it', () => {
    const o = board([left]);
    const next = { ...o, ...pushPull(o, '-x', -4, { snap: false, step: 0.25, unit: 'in', floorOn: false }) };
    const h = reanchorHoles(getHoles(o), o.dimensions, next.dimensions);
    expect(next.position.x + h[0].x).toBeCloseTo(-6); // left face moved from -12 to -8; still 2" in
  });

  it('shrink then grow back is lossless', () => {
    const a = reanchorHoles([left, right], d, { ...d, length: 14 });
    const b = reanchorHoles(a, { ...d, length: 14 }, d);
    expect(b.map((h) => h.x)).toEqual([-10, 9]);
  });

  it('a manual choice wins over the nearest edge', () => {
    const h = reanchorHoles([{ ...left, anchor: { u: 'end', v: 'center', manual: true } }], d, { ...d, length: 30 });
    expect(h[0].x).toBe(-7);
  });

  it('holesUpdate stamps anchors on new/moved holes and leaves untouched ones', () => {
    const o = board([{ ...left, anchor: { u: 'start', v: 'center' } }]);
    const moved = holesUpdate(o, [{ ...left, x: 11, anchor: { u: 'start', v: 'center' } }]).board!.holes[0];
    expect(moved.anchor).toEqual({ u: 'end', v: 'center' });
    const kept = holesUpdate(o, [{ ...left, diameter: 1, anchor: { u: 'start', v: 'center' } }]).board!.holes[0];
    expect(kept.anchor).toEqual({ u: 'start', v: 'center' });
  });

  it('group stretch keeps holes on their edge', () => {
    const leg: FurnitureObject = { ...board([{ id: 'top', face: 'front', x: 0, z: 13, diameter: 0.5 }]), id: 'leg', dimensions: { length: 1.5, height: 30, width: 1.5 }, position: { x: 0, y: 15, z: 0 } };
    const out = stretchObjects([leg], ['leg'], '+y', 40);
    const h = getHoles(out[0])[0];
    expect(out[0].position.y + h.z).toBeCloseTo(38); // 2" below the top before and after
  });

  it('pocket/dowel spacing recomputes the count over a longer joint', () => {
    expect(spots(12, 6)).toHaveLength(3);
    expect(spots(24, 6)).toHaveLength(5);
  });
});
