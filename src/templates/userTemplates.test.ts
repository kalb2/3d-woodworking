import { describe, expect, it } from 'vitest';
import { instantiateUserTemplate, partsFromSelection, type UserTemplate } from './userTemplates';
import { placeBuiltIn } from '../builtins/builtIns';
import { MEDIA_WALL_DEFAULTS } from '../generators/mediaWall';
import { PRESET_WOOD_MATERIALS } from '../utils/woodTextureGenerator';
import type { FurnitureObject, ScannedRoom } from '../types/furniture';

const mat = PRESET_WOOD_MATERIALS.birch;
const part = (id: string, x: number, y: number, z: number, extra: Partial<FurnitureObject> = {}): FurnitureObject => ({
  id, name: id, shape: 'cube', dimensions: { length: 10, height: 20, width: 4 }, position: { x, y, z },
  rotation: { x: 0, y: 0, z: 0 }, material: mat, visible: true, ...extra,
});

describe('partsFromSelection', () => {
  it('normalizes a group to a centered, floor-level origin and strips scan/reference data', () => {
    const objects: FurnitureObject[] = [
      part('a', 100, 30, 50, { parentId: 'g', builtInId: 'bi', wallId: 'w' }),
      part('b', 120, 30, 50, { parentId: 'g' }),
      part('ref', 110, 50, 48, { parentId: 'g', reference: true }),
      { ...part('g', 110, 30, 50), shape: 'group', builtIn: { id: 'bi', template: 'media-wall', input: {} } },
    ];
    const parts = partsFromSelection(objects, 'g');
    expect(parts).toHaveLength(2);
    expect(parts.map((p) => p.position)).toEqual([{ x: -10, y: 10, z: 0 }, { x: 10, y: 10, z: 0 }]);
    expect(parts.every((p) => !('builtInId' in p) && !('wallId' in p) && !('parentId' in p) && !('id' in p))).toBe(true);
  });

  it('undoes a wall-fitted built-in yaw so the template is axis-aligned', () => {
    const room: ScannedRoom = { walls: [{ id: 'w', label: 'Wall 2', width: 150, height: 96, x: -100, z: 0, yaw: 90, openings: [] }] };
    const { objects, groupId } = placeBuiltIn([], room, { template: 'media-wall', input: { ...MEDIA_WALL_DEFAULTS } as never, wallId: 'w' }, mat, 1)!;
    const parts = partsFromSelection(objects, groupId);
    expect(parts.every((p) => Math.abs(p.rotation.y) < 1e-9)).toBe(true);
    const minY = Math.min(...parts.map((p) => p.position.y - p.dimensions.height / 2));
    expect(minY).toBeCloseTo(0);
    // Wide along x again (150" run), shallow along z.
    const xs = parts.map((p) => p.position.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(100);
  });
});

describe('instantiateUserTemplate', () => {
  const t: UserTemplate = { id: 't', name: 'Shelf pair', createdAt: 0, parts: [
    { ...part('a', -10, 10, 0) }, { ...part('b', 10, 10, 0) },
  ].map(({ id: _i, ...p }) => { void _i; return p; }) };
  it('inserts one group at the floor point with fresh ids', () => {
    const out = instantiateUserTemplate(t, { at: { x: 50, z: -20 } }, mat, 7);
    const group = out.find((o) => o.shape === 'group')!;
    expect(out).toHaveLength(3);
    expect(group.position).toMatchObject({ x: 50, z: -20 });
    expect(out.filter((o) => o.parentId === group.id).map((o) => o.position.x)).toEqual([40, 60]);
    expect(new Set(out.map((o) => o.id)).size).toBe(3);
  });
  it('places flush against a wall, centered', () => {
    const wall = { id: 'w', label: 'Wall 1', width: 120, height: 96, x: 0, z: -60, yaw: 0, openings: [] };
    const out = instantiateUserTemplate(t, { wall }, mat, 8);
    const kids = out.filter((o) => o.shape !== 'group');
    for (const k of kids) expect(k.position.z - k.dimensions.width / 2).toBeCloseTo(-60);
    expect(out.find((o) => o.shape === 'group')!.position.x).toBeCloseTo(0);
  });
});
