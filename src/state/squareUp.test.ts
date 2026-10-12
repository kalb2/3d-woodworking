import { describe, expect, it } from 'vitest';
import type { RoomWall } from '../types/furniture';

const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage ??= {
  getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); },
  removeItem: (k: string) => { mem.delete(k); }, clear: () => mem.clear(), key: () => null, length: 0,
} as Storage;
const { useProjectStore } = await import('./useProjectStore');
const s = () => useProjectStore.getState();
const proj = () => s().projects.find((p) => p.id === s().activeProjectId)!;

const deg = Math.PI / 180;
function wall(id: string, l: [number, number], r: [number, number]): RoomWall {
  const dx = r[0] - l[0], dz = r[1] - l[1];
  return { id, label: id, width: Math.hypot(dx, dz), height: 96, x: (l[0] + r[0]) / 2, z: (l[1] + r[1]) / 2, yaw: Math.atan2(-dz, dx) / deg, openings: [] };
}
const rot = ([x, z]: [number, number], a: number): [number, number] => [x * Math.cos(a * deg) + z * Math.sin(a * deg), -x * Math.sin(a * deg) + z * Math.cos(a * deg)];
const mod90 = (y: number) => Math.min(((y % 90) + 90) % 90, 90 - (((y % 90) + 90) % 90));

describe('Square up walls (existing projects)', () => {
  it('re-aligns an old 37° room and moves a wall-fitted built-in with its wall', () => {
    const room = { walls: [wall('A', rot([-144, 0], 37), rot([0, 0], 37)), wall('B', rot([0, 0], 37), rot([0, 100], 37))] };
    s().createProject('Square test', 'in');
    s().addScannedRoom(room); // stored as-is, like a project scanned before this fix
    const g = s().insertBuiltIn({ template: 'media-wall', input: { wallWidth: 96, wallHeight: 96, tvSize: 55, baseDepth: 16, upperStyle: 'shelves' }, wallId: 'A' })!;
    expect(mod90(proj().objects.find((o) => o.id === g)!.rotation.y)).toBeGreaterThan(5);
    expect(s().squareUpWalls()).toBe(true);
    for (const w of proj().scannedRoom!.walls) expect(mod90(w.yaw)).toBeCloseTo(0, 5);
    const group = proj().objects.find((o) => o.builtIn?.wallId === 'A' && o.shape === 'group')!;
    expect(mod90(group.rotation.y)).toBeCloseTo(0, 5);
    const walls = proj().objects.filter((o) => o.generator === 'room-scan' && o.wallId && !o.openingId);
    for (const w of walls) expect(mod90(w.rotation.y)).toBeCloseTo(0, 5);
  });
});
