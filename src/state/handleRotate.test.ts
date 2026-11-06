import { beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { FurnitureObject } from '../types/furniture';
import { boxCorners, objectBox } from './groupTree';
import { turnObjects } from '../utils/turn90';
import { ringRotation } from '../utils/handleDrag';

const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage ??= {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => { mem.set(k, v); },
  removeItem: (k: string) => { mem.delete(k); },
  clear: () => mem.clear(),
  key: () => null,
  length: 0,
} as Storage;

const { useProjectStore } = await import('./useProjectStore');
const s = () => useProjectStore.getState();
const objs = () => s().projects.find((p) => p.id === s().activeProjectId)!.objects;
const get = (id: string) => objs().find((o) => o.id === id)!;
const dims = () => Object.fromEntries(objs().map((o) => [o.id, { ...o.dimensions }]));
const sortedCorners = (o: FurnitureObject) => boxCorners(o).map((c) => [c.x, c.y, c.z].map((n) => Math.round(n * 1000) / 1000).join(',')).sort();

describe('rotate handles on a group (bunk-bed frame)', () => {
  let rail: string, post: string, slat: string, group: string;
  beforeEach(() => {
    s().createProject('Rotate test', 'in');
    s().addObject('cube'); rail = objs().at(-1)!.id;
    s().addObject('cube'); post = objs().at(-1)!.id;
    s().addObject('cube'); slat = objs().at(-1)!.id;
    // Side rail: 75" long, 1.5" thick, stood up on edge (x = 90 makes "height" the thickness).
    s().updateObject(rail, { dimensions: { length: 75, height: 1.5, width: 5.5 }, rotation: { x: 90, y: 0, z: 0 }, position: { x: 0, y: 30, z: 0 } });
    // Post: 3.5 x 60, plain.
    s().updateObject(post, { dimensions: { length: 3.5, height: 60, width: 3.5 }, position: { x: 39, y: 30, z: 0 } });
    // Slat lying across, turned 90° on Y.
    s().updateObject(slat, { dimensions: { length: 40, height: 0.75, width: 3.5 }, rotation: { x: 0, y: 90, z: 0 }, position: { x: 10, y: 31, z: 0 } });
    s().selectMany([rail, post, slat]);
    s().groupSelected();
    group = s().selectedObjectId!;
  });

  it('free-rotating the group ring never changes any part size', () => {
    const before = dims();
    for (const [axis, deg] of [['y', 37], ['x', 20], ['z', -64], ['y', 90]] as const) {
      const g = get(group);
      s().updateObject(group, { rotation: ringRotation(g.rotation, axis, deg) }, true);
      expect(dims()).toEqual(before);
    }
  });

  it('members turn rigidly with the group: same result as the 90° button', () => {
    const start = objs();
    // Ring: green (Y) ring dragged 90°.
    s().updateObject(group, { rotation: ringRotation(get(group).rotation, 'y', 90) }, true);
    const viaRing = objs();
    // 90° button on the same group from the same start.
    const viaTurn = turnObjects(start, [group], 'y', { floorOn: false });
    for (const id of [rail, post, slat]) {
      const a = viaRing.find((o) => o.id === id)!, b = viaTurn.find((o) => o.id === id)!;
      expect(sortedCorners(a)).toEqual(sortedCorners(b));
    }
    // The stood-up rail still lies flat-on-edge along the floor (it used to tip up into a 75" "post").
    const rb = objectBox(viaRing.find((o) => o.id === rail)!);
    expect(rb.max.y - rb.min.y).toBeCloseTo(5.5, 3);
    expect(rb.max.z - rb.min.z).toBeCloseTo(75, 3);
  });

  it('a typed group angle also turns members rigidly about the group pivot', () => {
    const pivot = { ...get(group).position };
    const r0 = new THREE.Vector3(get(post).position.x - pivot.x, get(post).position.y - pivot.y, get(post).position.z - pivot.z).length();
    s().updateObject(group, { rotation: { x: 0, y: 0, z: 30 } });
    const p = get(post).position;
    const r1 = new THREE.Vector3(p.x - pivot.x, p.y - pivot.y, p.z - pivot.z).length();
    expect(r1).toBeCloseTo(r0, 3);
    expect(get(post).dimensions).toEqual({ length: 3.5, height: 60, width: 3.5 });
  });

  it('moving the group only translates members', () => {
    const before = objs().map((o) => ({ id: o.id, rotation: { ...o.rotation }, dimensions: { ...o.dimensions } }));
    const g = get(group);
    s().updateObject(group, { position: { x: g.position.x + 12, y: g.position.y, z: g.position.z - 5 } });
    for (const b of before) {
      expect(get(b.id).rotation).toEqual(b.rotation);
      expect(get(b.id).dimensions).toEqual(b.dimensions);
    }
  });
});

describe('rotate handles on one part', () => {
  it('ring drag writes rotation only; the part keeps its size', () => {
    s().createProject('Rotate part', 'in');
    s().addObject('cube');
    const id = objs().at(-1)!.id;
    s().updateObject(id, { dimensions: { length: 3.5, height: 60, width: 3.5 }, position: { x: 0, y: 30, z: 0 } });
    let r = get(id).rotation;
    for (const [axis, deg] of [['x', 90], ['y', 45], ['z', 12], ['x', -30]] as const) {
      r = ringRotation(r, axis, deg);
      s().updateObject(id, { rotation: r }, true);
      expect(get(id).dimensions).toEqual({ length: 3.5, height: 60, width: 3.5 });
    }
  });
});
