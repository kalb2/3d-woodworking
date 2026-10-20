import { describe, expect, it } from 'vitest';
import type { FurnitureObject, Joint } from '../types/furniture';
import { fitCheck, jointTag, ratioLabel } from './fitCheck';
import { extendMater, reseatPosition } from './joints';

const mat = { id: 'plywood', name: 'Plywood', species: 'plywood', baseColor: '#000', secondaryColor: '#000', grainIntensity: 0, grainScale: 1, roughness: 1, metalness: 0, varnishSheen: 'matte' } as FurnitureObject['material'];
const part = (id: string, d: [number, number, number], p: [number, number, number]): FurnitureObject => ({
  id, name: id === 'side' ? 'Side' : id === 'shelf' ? 'Shelf' : id, shape: 'board', dimensions: { length: d[0], height: d[1], width: d[2] },
  position: { x: p[0], y: p[1], z: p[2] }, rotation: { x: 0, y: 0, z: 0 }, material: mat,
});
const side = part('side', [0.75, 30, 12], [0, 15, 0]);
const shelf = part('shelf', [24, 0.75, 12], [12.375, 12.375, 0]);
const J = (type: Joint['type'], extra: Partial<Joint> = {}): Joint => ({ id: 'j', type, receiverId: 'side', materId: 'shelf', face: '+x', depth: 0.25, extended: 0, ...extra });
/** Shelf grown by `d` into the side, as saving a seated dado does. */
const seated = (d: number) => ({ ...shelf, ...extendMater(side, shelf, '+x', d) });

describe('fit check', () => {
  it('dado: fits when seated, as wide as the shelf, at most half deep', () => {
    expect(fitCheck(J('dado', { extended: 0.25 }), side, seated(0.25))).toEqual({
      status: 'fits', issues: [], message: 'Fits: 3/4" Shelf in a 3/4" dado, 1/4" deep (1/3 of the board)',
    });
    expect(ratioLabel(0.25 / 0.75)).toBe('1/3');
  });

  it('dado warnings: too deep, wrong width (1/64" tolerance), not seated, poking past', () => {
    const deep = fitCheck(J('dado', { depth: 0.5, extended: 0.5 }), side, seated(0.5));
    expect(deep.status).toBe('check');
    expect(deep.issues[0]).toMatch(/^Too deep/);
    expect(fitCheck(J('dado', { extended: 0.25, width: 0.75 + 1 / 128 }), side, seated(0.25)).status).toBe('fits');
    expect(fitCheck(J('dado', { extended: 0.25, width: 0.8125 }), side, seated(0.25)).issues).toEqual(['Loose: the dado is 13/16" wide but Shelf is 3/4" thick']);
    expect(fitCheck(J('dado'), side, shelf).issues).toEqual(['Shelf sits 1/4" short of the bottom of the dado']);
    expect(fitCheck(J('dado', { depth: 0.125, extended: 0.125 }), side, seated(0.25)).issues).toEqual(['Shelf goes 1/8" past the bottom of the dado']);
  });

  it('broken when the parts no longer touch; re-seat puts it back', () => {
    const moved = { ...seated(0.25), position: { ...seated(0.25).position, x: 20 } };
    const r = fitCheck(J('dado', { extended: 0.25 }), side, moved);
    expect(r).toMatchObject({ status: 'broken', message: "Shelf isn't touching Side anymore." });
    const p = reseatPosition(J('dado', { extended: 0.25 }), side, moved)!;
    expect(fitCheck(J('dado', { extended: 0.25 }), side, { ...moved, position: p }).status).toBe('fits');
    // Slid off sideways (no overlap left on the face): can't re-seat.
    expect(reseatPosition(J('dado'), side, { ...shelf, position: { ...shelf.position, z: 40 } })).toBeNull();
  });

  it('pocket screws: ends, spacing, screw length', () => {
    expect(fitCheck(J('pocket'), side, shelf).message).toBe('Fits: 3 pocket screws, 1 1/4" long, in Shelf');
    expect(fitCheck(J('pocket', { setback: 0.5 }), side, shelf).issues[0]).toBe('A screw is only 1/2" from the end (keep 3/4" or more)');
    expect(fitCheck(J('pocket', { count: 20 }), side, shelf).issues).toContain('Screws are only 1/2" apart');
    expect(fitCheck(J('pocket', { screwLength: 2.5 }), side, shelf).issues).toEqual(['2 1/2" screws would poke out of Side']);
    expect(fitCheck(J('pocket', { screwLength: 0.75 }), side, shelf).issues).toEqual(['3/4" screws are too short to hold 3/4" stock']);
  });

  it('dowels: diameter vs thickness, length vs the receiver, spacing', () => {
    expect(fitCheck(J('dowel'), side, shelf).message).toBe('Fits: 3 dowels, 3/8" × 1 1/2"');
    expect(fitCheck(J('dowel', { diameter: 0.5 }), side, shelf).issues).toEqual(['1/2" dowels are more than half of Shelf\'s 3/4"']);
    expect(fitCheck(J('dowel', { length: 2 }), side, shelf).status).toBe('fits'); // most of it goes into the shelf's end
    const block = { ...part('shelf', [1, 0.75, 12], [0.875, 12.375, 0]) };
    expect(fitCheck(J('dowel'), side, block).issues).toEqual(['1 1/2" dowels are longer than these boards allow (1 5/16" max)']);
    expect(fitCheck(J('dowel', { setback: 0.25 }), side, shelf).status).toBe('check');
  });

  it('butt: fits with glue/screws, warns with nothing', () => {
    expect(fitCheck(J('butt'), side, shelf).message).toBe('Fits: butt joint, glued');
    expect(fitCheck(J('butt', { fasten: 'none' }), side, shelf).status).toBe('check');
  });

  it('tags on the seam', () => {
    expect(jointTag(J('dado', { extended: 0.25 }), side, seated(0.25), 'in')).toBe('Dado 3/4" × 1/4" deep');
    expect(jointTag(J('pocket'), side, shelf, 'in')).toBe('Pocket screws × 3');
    expect(jointTag(J('dowel', { count: 2 }), side, shelf, 'in')).toBe('Dowels × 2 · 3/8"');
    expect(jointTag(J('butt'), side, shelf, 'in')).toBe('Butt');
  });
});
