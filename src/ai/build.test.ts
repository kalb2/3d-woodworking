import { describe, expect, it } from 'vitest';
import { currentSpec, placeAiPiece, templateInput } from './build';
import { mockBookshelf, mockChange } from './mock';
import { PRESET_WOOD_MATERIALS } from '../utils/woodTextureGenerator';
import type { FurnitureObject } from '../types/furniture';
import type { AiSpec } from './spec';

const opts = { groupMaterial: PRESET_WOOD_MATERIALS.birch, stamp: 1 };
const lowest = (os: FurnitureObject[]) => Math.min(...os.filter((o) => o.shape !== 'group').map((o) => o.position.y - o.dimensions.height / 2));

describe('placeAiPiece: boards', () => {
  const r = placeAiPiece([], [], undefined, mockBookshelf(), 'a bookshelf', opts)!;
  const group = r.objects.find((o) => o.id === r.groupId)!;
  const parts = r.objects.filter((o) => o.parentId === r.groupId);

  it('makes one group of normal parts, on the floor, carrying the design', () => {
    expect(group.shape).toBe('group');
    expect(group.name).toBe('Bookshelf');
    expect(group.ai?.prompt).toBe('a bookshelf');
    expect(group.ai?.spec.kind).toBe('boards');
    expect(parts).toHaveLength(7);
    expect(parts.every((p) => p.shape === 'board' && p.material.species === 'plywood' && p.rotation.x === 0 && p.board)).toBe(true);
    expect(lowest(parts)).toBeCloseTo(0, 6);
    expect(group.dimensions.height).toBe(48);
  });

  it('reports the fixes and joins boards with the app joint types', () => {
    expect(r.notes).toEqual([
      'Rounded sizes and positions to 1/16".',
      'Trimmed 1/8" off Shelf 1 so it no longer runs into Left side.',
      'Set it on the floor (it was 1/2" up).',
    ]);
    expect(r.joints).toHaveLength(10);
    const dado = r.joints.filter((j) => j.type === 'dado');
    expect(dado).toHaveLength(6);
    // Shelves are lengthened into their dados.
    const shelf = parts.find((p) => p.name === 'Shelf 2')!;
    expect(shelf.dimensions.length).toBe(28.625 + 0.5);
    expect(dado.every((j) => j.depth === 0.25 && j.extended === 0.25)).toBe(true);
  });

  it('places a new piece to the right of what is there', () => {
    const next = placeAiPiece(r.objects, r.joints, undefined, mockBookshelf(), 'again', { ...opts, stamp: 2 })!;
    const g2 = next.objects.find((o) => o.id === next.groupId)!;
    expect(next.objects.filter((o) => o.shape === 'group')).toHaveLength(2);
    expect(g2.position.x - g2.dimensions.length / 2).toBeCloseTo(group.position.x + group.dimensions.length / 2 + 12, 3);
  });

  it('Change it rebuilds in place: same group id and spot, old parts and joints gone', () => {
    const changed = mockChange(mockBookshelf(), 'make it 6 in taller');
    const next = placeAiPiece(r.objects, r.joints, undefined, changed, 'taller', { ...opts, replaceId: r.groupId, stamp: 3 })!;
    expect(next.groupId).toBe(r.groupId);
    const g = next.objects.find((o) => o.id === r.groupId)!;
    expect(g.dimensions.height).toBe(54);
    expect(g.position.x).toBeCloseTo(group.position.x, 6);
    expect(next.objects.filter((o) => o.shape === 'group')).toHaveLength(1);
    expect(next.objects).toHaveLength(8);
    expect(next.joints).toHaveLength(10);
  });

  it('turns lumber into pine stock parts and falls back to butt where a groove cannot go', () => {
    const stool: AiSpec = {
      kind: 'boards', name: 'Stool',
      boards: [
        // A rail butts into the leg's 3 1/2" face, which is too wide a face for a dado.
        { name: 'Leg', stock: '2x4', length: 18, x: 0, y: 0, z: 0, rotation: { x: 0, y: 0, z: 90 } },
        { name: 'Rail', stock: '2x4', length: 12, x: 0, y: 10, z: 3.5, rotation: { x: 0, y: 90, z: 0 } },
      ],
      joints: [{ type: 'dado', a: 0, b: 1 }],
    };
    const out = placeAiPiece([], [], undefined, stool, 'stool', opts)!;
    const leg = out.objects.find((o) => o.name === 'Leg')!;
    expect(leg.shape).toBe('cube');
    expect(leg.material.species).toBe('pine');
    expect(leg.dimensions).toEqual({ length: 1.5, height: 18, width: 3.5 });
    expect(out.joints).toHaveLength(1);
    expect(out.joints[0].type).toBe('butt');
    expect(out.notes).toContain('Used butt joints for 1 joint that can\'t take a groove there.');
  });
});

describe('placeAiPiece: templates', () => {
  const spec: AiSpec = { kind: 'template', name: 'Tall shelf', template: 'bookshelf', params: { width: 80, height: 60, shelves: 3 } };
  it('builds the parametric template, notes clamped values and keeps the design', () => {
    const r = placeAiPiece([], [], undefined, spec, 'tall shelf', opts)!;
    const g = r.objects.find((o) => o.id === r.groupId)!;
    expect(g.builtIn?.template).toBe('bookshelf');
    expect(g.builtIn?.input.width).toBe(72);
    expect(g.name).toBe('Tall shelf');
    expect(g.ai?.spec).toEqual(spec);
    expect(r.notes).toEqual(['Set width to 72" (the template\'s limit; asked for 80).']);
    expect(lowest(r.objects)).toBeCloseTo(0, 6);
  });

  it('maps doors to the template choice', () => {
    expect(templateInput({ kind: 'template', name: 'C', template: 'base-cabinet', params: { doors: 1 } }).input.doors).toBe('1');
    expect(templateInput({ kind: 'template', name: 'C', template: 'base-cabinet', params: { doors: 0 } }).input.doors).toBe('none');
    expect(templateInput({ kind: 'template', name: 'C', template: 'base-cabinet', params: { doors: 3 } }).notes).toContain('Used 2 doors, the most this template has.');
  });

  it('Change it keeps the group id; currentSpec follows later edits in the template sheet', () => {
    const r = placeAiPiece([], [], undefined, spec, 'tall shelf', opts)!;
    const g = r.objects.find((o) => o.id === r.groupId)!;
    const edited = { ...g, builtIn: { ...g.builtIn!, input: { ...g.builtIn!.input, height: 50 } } };
    expect(currentSpec(edited)).toMatchObject({ params: { height: 50, width: 72 } });
    const next = placeAiPiece(r.objects, r.joints, undefined, mockChange(currentSpec(edited)!, 'add a door'), 'door', { ...opts, replaceId: r.groupId, stamp: 5 })!;
    expect(next.groupId).toBe(r.groupId);
    expect(next.objects.filter((o) => o.shape === 'group')).toHaveLength(1);
    expect(next.objects.every((o) => o.id === r.groupId || o.parentId === r.groupId)).toBe(true);
  });
});
