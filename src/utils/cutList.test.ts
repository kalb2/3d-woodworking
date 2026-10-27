import { describe, expect, it } from 'vitest';
import type { FurnitureObject, FurnitureProject } from '../types/furniture';
import { cutListByMaterial, cutListCSV, cutListSections, generateCutList } from './exportUtils';
import { PRESET_WOOD_MATERIALS } from './woodTextureGenerator';

const part = (id: string, dims: [number, number, number], extra: Partial<FurnitureObject> = {}): FurnitureObject => ({
  id, name: id, shape: 'board', dimensions: { length: dims[0], height: dims[1], width: dims[2] }, position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
  material: { ...PRESET_WOOD_MATERIALS.plywood }, ...extra,
});
const project = (objects: FurnitureObject[], unit: FurnitureProject['unit'] = 'in') => ({ id: 'p', name: 'P', unit, objects } as unknown as FurnitureProject);

describe('cut list', () => {
  it('merges identical boards regardless of orientation; keeps 3/4" exact; parts in nested groups count', () => {
    const items = generateCutList(project([
      part('G', [10, 10, 10], { shape: 'group' }),
      part('H', [10, 10, 10], { shape: 'group', parentId: 'G' }),
      part('side L', [0.75, 30, 24], { parentId: 'H' }),
      part('side R', [24, 0.75, 30], { parentId: 'G' }),
      part('door', [15, 30, 0.75], { material: { ...PRESET_WOOD_MATERIALS.mdf } }),
      part('legacy', [15, 30, 0.75], { material: { ...PRESET_WOOD_MATERIALS.mdf }, visible: undefined }),
      part('hidden', [5, 5, 5], { visible: false }),
      part('wall', [100, 96, 4], { generator: 'room-scan' }),
    ]));
    expect(items).toHaveLength(2);
    const sides = items.find((i) => i.material === 'Plywood')!;
    expect(sides.quantity).toBe(2);
    expect([sides.length, sides.width, sides.height]).toEqual(['30"', '24"', '3/4"']);
    expect(items.find((i) => i.material === 'MDF')!.quantity).toBe(2);
    expect(cutListByMaterial(items).map((g) => g.material)).toEqual(['MDF', 'Plywood']);
  });

  it('shows sizes in the project unit', () => {
    const [it0] = generateCutList(project([part('a', [24, 0.75, 12])], 'mm'));
    expect([it0.length, it0.width, it0.height]).toEqual(['610 mm', '305 mm', '19 mm']);
  });

  it('lists length along the grain with numeric sizes and stock kind', () => {
    const [shelf] = generateCutList(project([part('shelf', [0.75, 11.25, 34.5])]));
    expect([shelf.lengthIn, shelf.widthIn, shelf.thicknessIn]).toEqual([34.5, 11.25, 0.75]);
    expect(shelf.kind).toBe('sheet');
  });

  it('sheet goods: one section per thickness with a 4×8 sheet count', () => {
    const items = generateCutList(project([
      part('side L', [0.75, 30, 24]), part('side R', [0.75, 30, 24]),
      part('back', [0.5, 30, 34.5]),
    ]));
    const secs = cutListSections(items, 'in');
    expect(secs.map((s) => s.title)).toEqual(['Plywood · 3/4"', 'Plywood · 1/2"']);
    expect(secs[0].summary).toBe(`1 sheet (4×8) · ${Math.round((2 * 30 * 24) / 4608 * 100)}% used`);
    expect(secs[0].pieces).toBe(2);
  });

  it('lumber: board feet from rough thickness plus waste', () => {
    const oak = { ...PRESET_WOOD_MATERIALS.oak };
    const legs = [1, 2, 3, 4].map((i) => part(`leg${i}`, [1.5, 29.25, 1.5], { name: 'Leg', material: oak }));
    const [sec] = cutListSections(generateCutList(project(legs)), 'in');
    expect(sec.kind).toBe('lumber');
    expect(sec.items[0].quantity).toBe(4);
    expect(sec.boardFeet).toBeCloseTo(2.4375, 4);
    expect(sec.summary).toBe('2.4 bd ft of 8/4 · buy 2.8 with 15% waste');
  });

  it('notes shaping and the assemblies a part is used in', () => {
    const holes = [{ id: 'h1', x: 0, z: 0, diameter: 1 }, { id: 'h2', x: 2, z: 0, diameter: 1 }];
    const items = generateCutList(project([
      part('A', [1, 1, 1], { shape: 'group', name: 'Base cabinet' }),
      part('A2', [1, 1, 1], { shape: 'group', name: 'Drawer box', parentId: 'A' }),
      part('B', [1, 1, 1], { shape: 'group', name: 'Bookshelf' }),
      part('s1', [0.75, 30, 24], { parentId: 'A2' }),
      part('s2', [0.75, 30, 24], { parentId: 'A' }),
      part('s3', [0.75, 30, 24], { parentId: 'B' }),
      part('top', [24, 0.75, 30], { board: { cornerRadius: 0.5, edge: 'roundover', holes } }),
    ]));
    const sides = items.find((i) => !i.notes)!;
    expect(sides.quantity).toBe(3);
    expect(sides.usedIn).toBe('Base cabinet ×2, Bookshelf');
    const top = items.find((i) => i.notes)!;
    expect(top.notes).toBe('1/2" radius corners; roundover edges; 2 holes');
    expect(top.usedIn).toBeUndefined();
  });

  it('CSV has grain length, board feet, notes, a buy summary and hardware columns', () => {
    const oak = { ...PRESET_WOOD_MATERIALS.oak };
    const csv = cutListCSV(project([part('side', [0.75, 30, 24]), part('rail', [0.75, 3, 30], { material: oak })]));
    const lines = csv.split('\n');
    expect(lines[0]).toBe('Name,Shape,Length (grain),Width,Thickness,Material,Stock,Quantity,Board feet,Notes,Used in');
    expect(lines.find((l) => l.startsWith('"rail"'))).toBe('"rail","Board","30""","3""","3/4""","Natural Oak",Lumber,1,0.6,"",""');
    expect(csv).toContain('"Plywood · 3/4""","1 sheet (4×8)');
    expect(csv).toContain('"Natural Oak","0.6 bd ft of 4/4');
  });
});
