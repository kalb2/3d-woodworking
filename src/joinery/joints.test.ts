import { describe, expect, it } from 'vitest';
import type { FurnitureObject, Joint } from '../types/furniture';
import { defaultDepth, extendMater, jointCutters, jointHardware, jointLayout, jointNote, jointNotes, pairContact, partCutters, spots } from './joints';

const mat = { id: 'plywood', name: 'Plywood', species: 'plywood', baseColor: '#000', secondaryColor: '#000', grainIntensity: 0, grainScale: 1, roughness: 1, metalness: 0, varnishSheen: 'matte' } as FurnitureObject['material'];
const part = (id: string, d: [number, number, number], p: [number, number, number], ry = 0): FurnitureObject => ({
  id, name: id, shape: 'board', dimensions: { length: d[0], height: d[1], width: d[2] },
  position: { x: p[0], y: p[1], z: p[2] }, rotation: { x: 0, y: ry, z: 0 }, material: mat,
});
// Side panel standing up, a shelf butting into its right face 12" up.
const side = part('side', [0.75, 30, 12], [0, 15, 0]);
const shelf = part('shelf', [24, 0.75, 12], [12.375, 12.375, 0]);
const joint = (type: Joint['type'], extra: Partial<Joint> = {}): Joint => ({ id: 'j', type, receiverId: 'side', materId: 'shelf', face: '+x', depth: 0.25, extended: 0, ...extra });

describe('joinery', () => {
  it('finds which board takes the cut, either selection order', () => {
    expect(pairContact(side, shelf)).toMatchObject({ receiver: { id: 'side' }, mater: { id: 'shelf' }, face: '+x' });
    expect(pairContact(shelf, side)).toMatchObject({ receiver: { id: 'side' }, face: '+x' });
  });

  it('ignores parts that are apart, out of square, or not boards', () => {
    expect(pairContact(side, { ...shelf, position: { ...shelf.position, x: 14 } })).toBeNull();
    expect(pairContact(side, { ...shelf, rotation: { x: 0, y: 30, z: 0 } })).toBeNull();
    expect(pairContact(side, { ...shelf, shape: 'cylinder' })).toBeNull();
    expect(pairContact(side, { ...shelf, generator: 'room-scan' })).toBeNull();
  });

  it('default depth is 1/4" in 3/4" stock', () => {
    expect(defaultDepth(side, '+x')).toBe(0.25);
    expect(defaultDepth(part('t', [1.5, 30, 12], [0, 15, 0]), '+x')).toBe(0.5);
  });

  it('dado is sized to the shelf thickness and noted with its position', () => {
    const L = jointLayout(joint('dado'), side, shelf)!;
    expect(L).toMatchObject({ t: 'y', l: 'z', width: 0.75, offset: 12, atEdge: false });
    expect(jointNote(joint('dado'), 'side', side, shelf, 'in')).toBe('dado 3/4 x 1/4 @ 12"');
    expect(jointNote(joint('dado'), 'shelf', side, shelf, 'in')).toBe('into dado 1/4"');
    const [c] = jointCutters(joint('dado'), 'side', side, shelf);
    expect(c).toMatchObject({ kind: 'box' });
    if (c.kind !== 'box') return;
    // Groove: from the face 1/4" in, 3/4" tall at the shelf, through the full width.
    expect(c.center[0] + c.size[0] / 2).toBeCloseTo(0.425, 3);
    expect(c.center[0] - c.size[0] / 2).toBeCloseTo(0.125, 3);
    expect(c.size[1]).toBeCloseTo(0.75);
    expect(c.center[1]).toBeCloseTo(-2.625);
    expect(c.size[2]).toBeGreaterThan(12);
    expect(jointCutters(joint('dado'), 'shelf', side, shelf)).toHaveLength(0);
  });

  it('a shelf at the top edge makes a rabbet', () => {
    const top = { ...shelf, position: { ...shelf.position, y: 29.625 } };
    const L = jointLayout(joint('rabbet'), side, top)!;
    expect(L.atEdge).toBe(true);
    expect(jointNote(joint('rabbet'), 'side', side, top, 'in')).toBe('rabbet 3/4 x 1/4');
  });

  it('extending the shelf into the groove lengthens only the joint end, and the joint still resolves', () => {
    const ext = extendMater(side, shelf, '+x', 0.25);
    expect(ext.dimensions.length).toBe(24.25);
    expect(ext.position.x).toBeCloseTo(12.25);
    const grown = { ...shelf, ...ext };
    expect(jointLayout(joint('dado', { extended: 0.25 }), side, grown)).toMatchObject({ width: 0.75, offset: 12 });
    expect({ ...grown, ...extendMater(side, grown, '+x', -0.25) }.dimensions.length).toBe(24);
  });

  it('follows the shelf when it moves along the panel', () => {
    const moved = { ...shelf, position: { ...shelf.position, y: 20.375 } };
    expect(jointNote(joint('dado'), 'side', side, moved, 'in')).toBe('dado 3/4 x 1/4 @ 20"');
  });

  it('works when the whole assembly is turned', () => {
    const s2 = part('side', [0.75, 30, 12], [0, 15, 0], 90);
    const m2 = part('shelf', [24, 0.75, 12], [0, 12.375, -12.375], 90);
    expect(pairContact(m2, s2)).toMatchObject({ receiver: { id: 'side' }, face: '+x' });
    expect(jointNote(joint('dado'), 'side', s2, m2, 'in')).toBe('dado 3/4 x 1/4 @ 12"');
  });

  it('spaces pocket screws and dowels and counts hardware', () => {
    expect(spots(12, 6)).toEqual([1.5, 6, 10.5]);
    expect(spots(2, 6)).toEqual([1]);
    const project = { objects: [side, shelf], joints: [joint('pocket', { id: 'a' }), joint('dowel', { id: 'b', spacing: 9 })], unit: 'in' as const };
    expect(jointHardware(project)).toEqual([{ name: 'Pocket screws 1 1/4"', quantity: 3 }, { name: 'Dowels 3/8" x 1 1/2"', quantity: 2 }]);
    // Pocket holes go in the shelf's underside only; dowels in both.
    const pockets = jointCutters(joint('pocket'), 'shelf', side, shelf);
    expect(pockets).toHaveLength(3);
    expect(pockets.every((c) => c.kind === 'cyl' && c.center[1] < 0)).toBe(true);
    expect(jointCutters(joint('pocket'), 'side', side, shelf)).toHaveLength(0);
    expect(partCutters(project, 'side')).toHaveLength(2);
    expect(partCutters(project, 'shelf')).toHaveLength(5);
    expect(jointNotes(project).get('shelf')).toEqual(['pocket holes ×3', 'dowels ×2']);
  });

  it('butt joints cut nothing', () => {
    expect(jointCutters(joint('butt'), 'side', side, shelf)).toHaveLength(0);
    expect(jointNote(joint('butt'), 'side', side, shelf, 'in')).toBe('butt joint');
  });
});
