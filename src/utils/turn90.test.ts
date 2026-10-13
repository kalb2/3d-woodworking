import { describe, expect, it } from 'vitest';
import type { FurnitureObject } from '../types/furniture';
import { cleanDegrees, turnObjects } from './turn90';
import { objectBox } from '../state/groupTree';

const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage ??= {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => { mem.set(k, v); },
  removeItem: (k: string) => { mem.delete(k); },
  clear: () => mem.clear(), key: () => null, length: 0,
} as Storage;

const mat = { id: 'oak', name: 'Oak', species: 'oak', baseColor: '#000', secondaryColor: '#000', grainIntensity: 0, grainScale: 1, roughness: 1, metalness: 0, varnishSheen: 'matte' } as FurnitureObject['material'];
const board = (id: string, x: number, extra: Partial<FurnitureObject> = {}): FurnitureObject => ({
  id, name: id, shape: 'cube', dimensions: { length: 24, width: 6, height: 0.75 }, position: { x, y: 0.375, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, material: mat, ...extra,
});

describe('turn 90°', () => {
  it('cleans float drift onto exact multiples of 90', () => {
    expect(cleanDegrees(89.99999999)).toBe(90);
    expect(cleanDegrees(-0.0000001)).toBe(0);
    expect(cleanDegrees(270)).toBe(-90);
    expect(cleanDegrees(-180)).toBe(180);
    expect(cleanDegrees(30.5)).toBe(30.5);
  });

  it('spins a single part flat on the floor (Y), four turns = back home, exact angles', () => {
    let objs = [board('a', 10)];
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) {
      objs = turnObjects(objs, ['a'], 'y', { floorOn: true });
      seen.push(objs[0].rotation.y);
      expect(objs[0].position).toEqual({ x: 10, y: 0.375, z: 0 });
    }
    expect(seen).toEqual([90, 180, -90, 0]);
    expect(objs[0].rotation).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('tipping up about Z keeps a resting board on the floor', () => {
    const [o] = turnObjects([board('a', 0)], ['a'], 'z', { floorOn: true });
    expect(o.rotation).toEqual({ x: 0, y: 0, z: 90 });
    expect(objectBox(o).min.y).toBeCloseTo(0, 6);
    expect(o.position.y).toBeCloseTo(12, 6);
  });

  it('never goes below the floor for a floating part, and can when floor is off', () => {
    const up = board('a', 0, { position: { x: 0, y: 3, z: 0 } });
    const [on] = turnObjects([up], ['a'], 'x', { floorOn: true });
    expect(objectBox(on).min.y).toBeGreaterThanOrEqual(-1e-9);
    const [off] = turnObjects([board('a', 0)], ['a'], 'z', { floorOn: false });
    expect(objectBox(off).min.y).toBeCloseTo(-11.625, 6);
  });

  it('multi-selection turns about the selection center', () => {
    const objs = turnObjects([board('a', -20), board('b', 20)], ['a', 'b'], 'y', { floorOn: true });
    expect(objs[0].position.x).toBeCloseTo(0, 6);
    expect(objs[0].position.z).toBeCloseTo(20, 6);
    expect(objs[1].position.z).toBeCloseTo(-20, 6);
    expect(objs.map((o) => o.rotation.y)).toEqual([90, 90]);
  });

  it('room scans are left alone', () => {
    const scan = board('r', 0, { generator: 'room-scan' } as Partial<FurnitureObject>);
    expect(turnObjects([scan], ['r'], 'y', { floorOn: true })).toEqual([scan]);
  });
});

describe('store: turnSelection90', async () => {
  const { useProjectStore } = await import('../state/useProjectStore');
  const s = () => useProjectStore.getState();
  const objs = () => s().projects.find((p) => p.id === s().activeProjectId)!.objects;
  const get = (id: string) => objs().find((o) => o.id === id)!;

  it('turns a group as a whole, refits its box, one undo step', () => {
    s().createProject('Turn test', 'in');
    s().addObject('cube'); s().addObject('cube');
    const ids = objs().filter((o) => o.shape === 'cube').map((o) => o.id).slice(-2);
    s().updateObject(ids[0], { position: { x: -20, y: 6, z: 0 } });
    s().updateObject(ids[1], { position: { x: 20, y: 6, z: 0 } });
    s().selectMany(ids);
    s().groupSelected();
    const g = s().selectedObjectId!;
    const before = s().historyIndex;
    s().turnSelection90('y');
    expect(s().historyIndex).toBe(before + 1);
    expect(get(ids[0]).position.z).toBeCloseTo(20, 4);
    expect(get(ids[0]).rotation.y).toBe(90);
    expect(get(g).rotation).toEqual({ x: 0, y: 0, z: 0 });
    expect(get(g).dimensions.width).toBeCloseTo(52, 4);
    s().undo();
    expect(get(ids[0]).position).toEqual({ x: -20, y: 6, z: 0 });
    expect(get(ids[0]).rotation.y).toBe(0);
  });
});
