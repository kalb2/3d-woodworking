import { describe, expect, it } from 'vitest';
import { clearSpans, fitModule, generateModule, MODULES, normalizeModuleInput, type ModuleId, type ModulePart } from './modules';
import { placeBuiltIn, findBuiltInTemplate } from '../builtins/builtIns';
import { PRESET_WOOD_MATERIALS } from '../utils/woodTextureGenerator';
import type { ScannedRoom } from '../types/furniture';

const box = (parts: ModulePart[]) => {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of parts) {
    const d = p.dimensions, c = p.position;
    x0 = Math.min(x0, c.x - d.length / 2); x1 = Math.max(x1, c.x + d.length / 2);
    y0 = Math.min(y0, c.y - d.height / 2); y1 = Math.max(y1, c.y + d.height / 2);
    z0 = Math.min(z0, c.z - d.width / 2); z1 = Math.max(z1, c.z + d.width / 2);
  }
  return { x0, x1, y0, y1, z0, z1 };
};
const named = (parts: ModulePart[], re: RegExp) => parts.filter((p) => re.test(p.name));

describe('parametric modules', () => {
  it('every module is real sheet-stock Boards with positive sizes and sits on/against the wall', () => {
    for (const m of MODULES) {
      const parts = generateModule(m.id, m.defaults);
      expect(parts.length).toBeGreaterThan(4);
      for (const p of parts) {
        expect(p.shape).toBe('board');
        expect(['plywood', 'mdf']).toContain(p.material.species);
        expect(Math.min(p.dimensions.length, p.dimensions.width, p.dimensions.height)).toBeGreaterThan(0);
      }
      const b = box(parts);
      expect(b.z0).toBeCloseTo(0, 6); // back against the wall face
      expect(b.x1 - b.x0).toBeCloseTo(Number(m.defaults.width), 6);
    }
  });

  it('base cabinet: size, toe kick, doors vs drawers count', () => {
    const doors = generateModule('base-cabinet', { width: 36, height: 34.5, depth: 24, fronts: 'doors', count: 2, toeKick: 4 });
    const b = box(doors);
    expect(b.y0).toBe(0);
    expect(b.y1).toBeCloseTo(34.5, 6);
    expect(named(doors, /^Door/)).toHaveLength(2);
    expect(named(doors, /^Toe kick/)).toHaveLength(1);
    expect(named(doors, /^Bottom/)[0].position.y - 0.375).toBeCloseTo(4, 6);
    const drawers = generateModule('base-cabinet', { width: 36, fronts: 'drawers', count: 3, toeKick: 0 });
    expect(named(drawers, /^Drawer front/)).toHaveLength(3);
    expect(named(drawers, /^Toe kick/)).toHaveLength(0);
  });

  it('wall cabinet hangs at its elevation; bookshelf shelf count; bench cubbies', () => {
    const up = box(generateModule('upper-cabinet', { width: 30, height: 30, elevation: 54 }));
    expect(up.y0).toBeCloseTo(54, 6);
    expect(up.y1).toBeCloseTo(84, 6);
    expect(named(generateModule('bookshelf', { shelves: 5 }), /^Shelf/)).toHaveLength(5);
    expect(named(generateModule('window-bench', { sections: 4 }), /^Divider/)).toHaveLength(3);
    expect(box(generateModule('window-bench', { height: 18 })).y1).toBeCloseTo(18, 6);
  });

  it('clamps silly input to buildable ranges', () => {
    const v = normalizeModuleInput('bookshelf', { width: 9999, shelves: 2.6, height: -5 });
    expect(v.width).toBe(72);
    expect(v.shelves).toBe(3);
    expect(v.height).toBe(18);
  });
});

describe('fitting modules to a scanned wall', () => {
  const wall = { width: 144, height: 96, openings: [
    { id: 'd', kind: 'door' as const, offsetX: 0, width: 36, bottom: 0, height: 80 },
    { id: 'w', kind: 'window' as const, offsetX: 84, width: 36, bottom: 36, height: 40 },
  ] };

  it('skips the door and packs side by side after existing modules', () => {
    const a = fitModule('base-cabinet', { width: 30 }, wall);
    // Door covers wall-local -72..-36, so the first cabinet starts at -36.
    expect(a.center).toBeCloseTo(-21, 6);
    const b = fitModule('base-cabinet', { width: 30 }, wall, { occupied: [{ x0: -36, x1: -6 }] });
    expect(b.center).toBeCloseTo(9, 6);
  });

  it('a window bench centers under the window; a tall bookshelf avoids it', () => {
    const bench = fitModule('window-bench', { width: 48, height: 18 }, wall);
    expect(bench.center).toBeCloseTo(30, 6); // window -72+84 .. +36 → center 30
    const shelf = fitModule('bookshelf', { width: 24, height: 72 }, wall);
    const span = clearSpans(wall, 0, 72).find((s) => shelf.center >= s.x0 && shelf.center <= s.x1)!;
    expect(shelf.center - 12).toBeGreaterThanOrEqual(span.x0 - 1e-6);
    expect(shelf.center + 12).toBeLessThanOrEqual(span.x1 + 1e-6);
  });

  it('never taller than the wall; width clamps to the clear stretch', () => {
    const f = fitModule('bookshelf', { width: 72, height: 108 }, { width: 40, height: 80, openings: [] });
    expect(f.width).toBe(40);
    expect(box(f.parts).y1).toBeCloseTo(80, 6);
  });

  it('placed as a re-editable group; uppers and bases line up in separate rows', () => {
    const room: ScannedRoom = { walls: [{ id: 'a', label: 'Wall 1', width: 120, height: 96, x: 0, z: -60, yaw: 0, openings: [] }] };
    const mat = PRESET_WOOD_MATERIALS.birch;
    const tid = (id: ModuleId) => id;
    let objs = placeBuiltIn([], room, { template: tid('base-cabinet'), input: { width: 30 }, wallId: 'a' }, mat, 1)!.objects;
    objs = placeBuiltIn(objs, room, { template: 'base-cabinet', input: { width: 30 }, wallId: 'a' }, mat, 2)!.objects;
    objs = placeBuiltIn(objs, room, { template: 'upper-cabinet', input: { width: 30 }, wallId: 'a' }, mat, 3)!.objects;
    const groups = objs.filter((o) => o.shape === 'group');
    expect(groups.map((g) => g.builtIn!.center)).toEqual([-45, -15, -45]);
    expect(groups.every((g) => findBuiltInTemplate(g.builtIn!.template)?.fields)).toBe(true);
    // Edit: wider first cabinet keeps its spot and its own id.
    const first = groups[0].builtIn!;
    const edited = placeBuiltIn(objs, room, { template: 'base-cabinet', input: { ...first.input, width: 24 }, wallId: 'a', center: first.center, editId: first.id }, mat, 4)!;
    const g = edited.objects.find((o) => o.id === edited.groupId)!;
    expect(g.builtIn!.input.width).toBe(24);
    expect(edited.objects.filter((o) => o.shape === 'group')).toHaveLength(3);
  });
});
