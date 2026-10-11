import { describe, expect, it } from 'vitest';
import { placeBuiltIn, slideAlongWall, listBuiltIns } from './builtIns';
import { MEDIA_WALL_DEFAULTS } from '../generators/mediaWall';
import { PRESET_WOOD_MATERIALS } from '../utils/woodTextureGenerator';
import type { ScannedRoom } from '../types/furniture';

const room: ScannedRoom = { walls: [
  { id: 'a', label: 'Wall 1', width: 200, height: 96, x: 0, z: -60, yaw: 0, openings: [] },
  { id: 'b', label: 'Wall 2', width: 120, height: 96, x: -100, z: 0, yaw: 90, openings: [] },
] };
const input = { ...MEDIA_WALL_DEFAULTS } as unknown as Record<string, number | string>;
const mat = PRESET_WOOD_MATERIALS.birch;

describe('placeBuiltIn', () => {
  it('adds independent instances and edit replaces only its own', () => {
    const one = placeBuiltIn([], room, { template: 'media-wall', input, wallId: 'a', width: 120 }, mat, 1)!;
    const two = placeBuiltIn(one.objects, room, { template: 'media-wall', input, wallId: 'b' }, mat, 2)!;
    expect(listBuiltIns(two.objects)).toHaveLength(2);
    const firstId = two.objects.find((o) => o.id === one.groupId)!.builtIn!.id;
    const before = two.objects.filter((o) => o.builtInId && o.builtInId !== firstId).map((o) => o.id);
    const edited = placeBuiltIn(two.objects, room, { template: 'media-wall', input: { ...input, upperStyle: 'cabinets' }, wallId: 'a', editId: firstId }, mat, 3)!;
    expect(listBuiltIns(edited.objects)).toHaveLength(2);
    expect(edited.objects.filter((o) => o.builtInId && o.builtInId !== firstId).map((o) => o.id)).toEqual(before);
    expect(edited.objects.some((o) => o.builtInId === firstId && o.name.startsWith('Upper cabinet'))).toBe(true);
  });
  it('fits flush to the wall face, no reference wall, rotated with the wall', () => {
    const { objects, groupId } = placeBuiltIn([], room, { template: 'media-wall', input, wallId: 'b' }, mat, 1)!;
    const parts = objects.filter((o) => o.parentId === groupId);
    expect(parts.some((p) => p.reference)).toBe(false);
    // Wall 2 faces +x from x = -100: every part sits in front of it.
    for (const p of parts) expect(p.position.x).toBeGreaterThan(-100);
    expect(objects.find((o) => o.id === groupId)!.rotation.y).toBe(90);
  });
  it('slides only along its wall and stays on the wall', () => {
    const { objects, groupId } = placeBuiltIn([], room, { template: 'media-wall', input, wallId: 'a', width: 100 }, mat, 1)!;
    const g = objects.find((o) => o.id === groupId)!;
    const s = slideAlongWall(g, room.walls[0], { x: 500, y: 99, z: 40 });
    expect(s.position.z).toBeCloseTo(g.position.z);
    expect(s.position.y).toBeCloseTo(g.position.y);
    expect(s.position.x).toBeCloseTo(50);
    expect(s.center).toBeCloseTo(50);
  });
});
