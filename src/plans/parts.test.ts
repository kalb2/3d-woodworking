import { describe, expect, it } from 'vitest';
import type { FurnitureObject, FurnitureProject } from '../types/furniture';
import { elementDims, faceDrawing, faceFrame, groupName, groupParts, handedNote, locationText, partNumbers } from './parts';
import { templateProject } from './testProjects';

describe('part grouping', () => {
  it('groups identical bookshelf parts with a quantity and one name', () => {
    const p = templateProject('bookshelf', 'Bookshelf');
    const groups = groupParts(p);
    const byName = Object.fromEntries(groups.map((g) => [g.item.name, g]));
    expect(byName.Side.item.quantity).toBe(2);
    expect(byName.Shelf.item.quantity).toBe(4);
    expect(byName.Shelf.parts.map((o) => o.name).sort()).toEqual(['Shelf 1', 'Shelf 2', 'Shelf 3', 'Shelf 4']);
    expect(groups.map((g) => g.no)).toEqual(groups.map((_, i) => i + 1));
    expect(groups.reduce((n, g) => n + g.item.quantity, 0)).toBe(10);
    const nums = partNumbers(groups);
    expect(nums.get(byName.Shelf.parts[2].id)).toBe(byName.Shelf.no);
    expect(handedNote(byName.Side)).toMatch(/mirror/);
    expect(handedNote(byName.Shelf)).toBeNull();
  });
  it('names groups from their common base', () => {
    expect(groupName(['Side L', 'Side R'])).toBe('Side');
    expect(groupName(['Door 1', 'Door 2'])).toBe('Door');
    expect(groupName(['Leg', 'Leg'])).toBe('Leg');
    expect(groupName(['Top', 'Lid'])).toBe('Top');
  });
});

describe('face drawings', () => {
  it('puts every dado and rabbet on a bookshelf side, located from its edges', () => {
    const p = templateProject('bookshelf', 'Bookshelf');
    const side = p.objects.find((o) => o.name === 'Side L')!;
    const d = faceDrawing(p, side);
    expect(d.u).toBeCloseTo(72);
    expect(d.v).toBeCloseTo(12);
    expect(d.thickness).toBeCloseTo(0.75);
    const dados = d.features.filter((f) => f.label.startsWith('Dado'));
    const rabbets = d.features.filter((f) => f.label.startsWith('Rabbet'));
    expect(dados).toHaveLength(5); // bottom + 4 shelves
    expect(rabbets).toHaveLength(2); // top and back
    for (const f of [...dados, ...rabbets]) {
      expect(f.elements.length).toBeGreaterThan(0);
      expect(f.dims.length).toBeGreaterThan(0);
      for (const e of f.elements) if (e.shape === 'rect') {
        expect(e.u0).toBeGreaterThanOrEqual(-1e-6); expect(e.u1).toBeLessThanOrEqual(d.u + 1e-6);
        expect(e.v0).toBeGreaterThanOrEqual(-1e-6); expect(e.v1).toBeLessThanOrEqual(d.v + 1e-6);
      }
    }
    // The bottom dado sits above the 3" toe kick, measured from that end.
    const bottom = dados.find((f) => f.label.includes('Bottom'))!;
    expect(bottom.text).toMatch(/3\/4" wide × 1\/4" deep; 3" from (left|right)/);
    expect(bottom.dims[0]).toMatchObject({ axis: 'u', value: 3 });
  });
  it('notes how a shelf meets its sides', () => {
    const p = templateProject('bookshelf', 'Bookshelf');
    const shelf = p.objects.find((o) => o.name === 'Shelf 1')!;
    const d = faceDrawing(p, shelf);
    expect(d.features).toHaveLength(0);
    expect(d.notes).toEqual(['Sits 1/4" into a dado in Side L', 'Sits 1/4" into a dado in Side R']);
  });
  it('merges identical shelf-pin holes into one feature with their anchored offsets', () => {
    const p = templateProject('base-cabinet', 'Base cabinet');
    const side = p.objects.find((o) => o.name === 'Side L')!;
    const d = faceDrawing(p, side);
    const holes = d.features.filter((f) => f.label.startsWith('Hole'));
    expect(holes).toHaveLength(1);
    expect(holes[0].label).toMatch(/^Holes ×\d+$/);
    expect(holes[0].elements.every((e) => e.shape === 'circle')).toBe(true);
    expect(holes[0].text).toMatch(/Ø 1\/4"/);
  });
  it('measures holes from the edge they are anchored to', () => {
    const o = {
      id: 'b', name: 'Panel', shape: 'board', position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
      dimensions: { length: 20, height: 0.75, width: 10 }, material: { species: 'birch' },
      board: { holes: [{ id: 'h', face: 'top', x: 3, z: 0, diameter: 0.5, anchor: { u: 'end', v: 'center' } }] },
    } as unknown as FurnitureObject;
    const proj = { objects: [o], joints: [], unit: 'in' } as unknown as FurnitureProject;
    const d = faceDrawing(proj, o);
    expect(d.features).toHaveLength(1);
    const f = d.features[0];
    expect(f.elements[0]).toMatchObject({ shape: 'circle', r: 0.25 });
    expect(f.text).toMatch(/Hole — Ø 1\/2", through/);
    // 3" right of center on a 20" board, anchored to the far end: 7" from that end.
    expect(f.dims.find((x) => x.axis === 'u')).toMatchObject({ from: 'right', value: 7 });
  });
});

describe('face frame', () => {
  it('views a board on its broad face with a right-handed frame', () => {
    const o = { shape: 'board', dimensions: { length: 30, height: 0.75, width: 12 } } as unknown as FurnitureObject;
    const f = faceFrame(o);
    expect([f.U, f.V, f.N]).toEqual(['x', 'z', 'y']);
    // x × z = -y: looking from +y the V axis must flip to keep the drawing unmirrored.
    expect(f.flipV).toBe(f.s === 1);
  });
});

describe('dimension specs', () => {
  it('skips full-span cuts and measures edge cuts from their edge', () => {
    expect(elementDims({ shape: 'rect', u0: 0, u1: 20, v0: 0, v1: 0.75, side: 'near', depth: 0.25 }, { u: 20, v: 10 })).toEqual([{ axis: 'v', from: 'bottom', value: 0.75, at: 0.75 }]);
  });
  it('writes locations grouped by edge', () => {
    expect(locationText([
      { axis: 'u', from: 'right', value: 2, at: 0 }, { axis: 'u', from: 'right', value: 1, at: 0 },
      { axis: 'v', from: 'top', value: 1.5, at: 0 }, { axis: 'v', from: 'bottom', value: 1.75, at: 0 },
    ], 'in')).toBe('1", 2" from right · 1 1/2" from top, 1 3/4" from bottom');
  });
});
