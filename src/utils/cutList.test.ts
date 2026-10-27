import { describe, expect, it } from 'vitest';
import type { FurnitureObject, FurnitureProject } from '../types/furniture';
import { cutListByMaterial, cutListCSV, cutListSections, generateCutList, lumberBuyList, sheetBuyList } from './exportUtils';
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

  it('dimensional pine counts as lumber at nominal board feet', () => {
    const pine = { ...PRESET_WOOD_MATERIALS.pine };
    const stick = (id: string, w: number, t: number) => part(id, [96, t, w], { shape: 'cube', material: pine });
    const items = generateCutList(project([stick('a', 1.5, 0.75), stick('b', 1.5, 1.5), stick('c', 3.5, 1.5), stick('d', 3.5, 1.5), stick('e', 5.5, 1.5)]));
    expect(items.every((i) => i.kind === 'lumber')).toBe(true);
    const [sec] = cutListSections(items, 'in');
    expect(sec.pieces).toBe(5);
    expect(sec.boardFeet).toBeCloseTo(4 / 3 + 8 / 3 + 2 * 16 / 3 + 8, 6);
    expect(sec.summary).toBe('22.7 bd ft of 1×2, 2×2, 2×4, 2×6'); // stick counts say what to buy
    expect(sec.sticks!.map((b) => b.text)).toEqual(['1 × 1×2 at 8 ft', '1 × 2×2 at 8 ft', '2 × 2×4 at 8 ft', '1 × 2×6 at 8 ft']);
    const csv = cutListCSV(project([stick('stud', 3.5, 1.5)]));
    expect(csv).toContain('"stud","Box","96""","3 1/2""","1 1/2""","Rustic Pine",Lumber,1,5.3,');
  });

  it('buy list: packs each profile onto 8, 10 or 12 ft sticks', () => {
    const pine = { ...PRESET_WOOD_MATERIALS.pine };
    const stick = (id: string, len: number, w: number, t = 1.5) => part(id, [len, t, w], { shape: 'cube', material: pine });
    const items = generateCutList(project([
      stick('rail', 30, 3.5), stick('rail', 30, 3.5), stick('rail', 30, 3.5), stick('rail', 30, 3.5),
      stick('top', 100, 5.5),
      stick('cleat', 20, 1.5, 0.75),
    ]));
    const buys = lumberBuyList(cutListSections(items, 'in'));
    expect(buys.map((b) => [b.profile, b.material, b.text])).toEqual([
      ['1×2', 'Rustic Pine', '1 × 1×2 at 8 ft'],
      ['2×4', 'Rustic Pine', '1 × 2×4 at 12 ft'], // 4 × 30" + kerfs fit one 12 ft stick: less waste than two 8 ft
      ['2×6', 'Rustic Pine', '1 × 2×6 at 10 ft'],
    ]);
    expect(buys[1].sticks.map((s) => s.cuts)).toEqual([[30, 30, 30, 30]]);
  });

  it('buy list: different finishes are different profiles; hardwood and sheets get none', () => {
    const pine = { ...PRESET_WOOD_MATERIALS.pine };
    const painted = { ...PRESET_WOOD_MATERIALS.pine, name: 'Painted Pine' };
    const secs = cutListSections(generateCutList(project([
      part('a', [60, 1.5, 3.5], { shape: 'cube', material: pine }),
      part('b', [60, 1.5, 3.5], { shape: 'cube', material: painted }),
      part('leg', [29.25, 1.5, 1.5], { material: { ...PRESET_WOOD_MATERIALS.oak } }),
      part('side', [0.75, 30, 24]),
    ])), 'in');
    expect(lumberBuyList(secs).map((b) => `${b.material}: ${b.text}`).sort()).toEqual(['Painted Pine: 1 × 2×4 at 8 ft', 'Rustic Pine: 1 × 2×4 at 8 ft']);
    expect(secs.find((s) => s.title === 'Natural Oak')!.sticks).toBeUndefined();
    expect(secs.find((s) => s.kind === 'sheet')!.sticks).toBeUndefined();
  });

  it('buy list: flags parts longer than 12 ft', () => {
    const pine = { ...PRESET_WOOD_MATERIALS.pine };
    const [b] = lumberBuyList(cutListSections(generateCutList(project([
      part('beam', [168, 1.5, 5.5], { shape: 'cube', material: pine }),
      part('short', [40, 1.5, 5.5], { shape: 'cube', material: pine }),
    ])), 'in'));
    expect(b.oversize).toEqual([168]);
    expect(b.text).toBe('1 × 2×6 at 8 ft, 1 2×6 part is longer than 12 ft');
  });

  it('CSV Buy block lists sticks and the per-stick cut layout, keeping board feet', () => {
    const pine = { ...PRESET_WOOD_MATERIALS.pine };
    const rail = (id: string) => part(id, [30, 1.5, 3.5], { shape: 'cube', material: pine });
    const csv = cutListCSV(project([rail('r1'), rail('r2'), rail('r3'), part('beam', [168, 1.5, 5.5], { shape: 'cube', material: pine })]));
    expect(csv).toContain('"Rustic Pine","19 bd ft of 2×4, 2×6"');
    expect(csv).toContain('"Rustic Pine · 2×4","1 × 2×4 at 8 ft"');
    expect(csv).toContain('"Rustic Pine · 2×6","1 2×6 part is longer than 12 ft"');
    expect(csv).toContain('\nStick,Stock,Cuts,Left over\n"2×4 #1","8 ft","30"" + 30"" + 30""","5 3/4"""\n');
    expect(csv).toContain('"2×6 (too long)","over 12 ft","168""",""');
  });

  it('sheet count comes from the nested layout, per material and thickness', () => {
    const items = generateCutList(project([
      ...[1, 2, 3, 4, 5, 6, 7].map((i) => part(`side${i}`, [0.75, 30, 23.875], { name: 'Side' })),
      part('back', [0.5, 30, 34.5], { name: 'Back' }),
      part('door', [0.75, 30, 15], { name: 'Door', material: { ...PRESET_WOOD_MATERIALS.mdf } }),
    ]));
    const sheets = sheetBuyList(cutListSections(items, 'in'));
    expect(sheets.map((s) => [s.title, s.sheets.sheets, s.sheets.layouts.length])).toEqual([
      ['MDF · 3/4"', 1, 1], ['Plywood · 3/4"', 2, 2], ['Plywood · 1/2"', 1, 1],
    ]);
    const ply = sheets[1];
    expect(ply.summary).toBe(`2 sheets (4×8) · ${Math.round(ply.sheets.yield * 100)}% used`);
    expect(ply.sheets.layouts.flatMap((l) => l.panels).map((p) => p.name)).toEqual(Array(7).fill('Side'));
  });

  it('CSV lists each sheet\'s panels, offcuts and oversize panels', () => {
    const csv = cutListCSV(project([
      part('top', [0.75, 60, 48], { name: 'Top' }),
      part('huge', [0.75, 100, 30], { name: 'Huge' }),
    ]));
    expect(csv).toContain('"Plywood · 3/4""","1 sheet (4×8) · 63% used · 1 part is bigger than a sheet"');
    expect(csv).toContain('\nSheet,Used,Panels (x along 8 ft from the left × y along 4 ft from the top),Offcuts\n');
    expect(csv).toContain('"Plywood · 3/4"" · sheet 1 of 1","63%","Top 60"" × 48"" at 0"", 0""","35 7/8"" × 48"" at 60 1/8"", 0"""');
    expect(csv).toContain('"Plywood · 3/4"" · too big for a sheet","","Huge 100"" × 30""",""');
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
