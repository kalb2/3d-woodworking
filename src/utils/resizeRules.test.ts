import { describe, expect, it } from 'vitest';
import type { FurnitureObject, SnapSettings } from '../types/furniture';
import { floorSafeDy, floorSafeY, snapSize } from './resizeRules';
import { calculateSnappedPosition } from './snapUtils';

const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage ??= {
  getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); },
  removeItem: (k: string) => { mem.delete(k); }, clear: () => mem.clear(), key: () => null, length: 0,
} as Storage;
const { useProjectStore } = await import('../state/useProjectStore');
const s = () => useProjectStore.getState();
const objs = () => s().projects.find((p) => p.id === s().activeProjectId)!.objects;
const get = (id: string) => objs().find((o) => o.id === id)!;

const part = (y: number, h: number, extra: Partial<FurnitureObject> = {}): FurnitureObject => ({
  id: 'p', name: 'p', shape: 'cube', dimensions: { length: 10, width: 10, height: h }, position: { x: 0, y, z: 0 },
  rotation: { x: 0, y: 0, z: 0 }, material: {} as FurnitureObject['material'], visible: true, ...extra,
});

describe('resize snapping', () => {
  it('snaps dragged sizes to 1/4" by default and 1/2" when chosen', () => {
    expect(snapSize(44.3, 0.25)).toBe(44.25);
    expect(snapSize(0.6, 0.25)).toBe(0.5);
    expect(snapSize(12.13, 0.25)).toBe(12.25);
    expect(snapSize(44.3, 0.5)).toBe(44.5);
    expect(snapSize(0.05, 0.25)).toBe(0.25); // never collapses
    expect(snapSize(10.02, 0.25, 'mm')).toBeCloseTo(10.0394, 3); // whole mm in metric
  });
  it('typed values stay exact (the store does not round them)', () => {
    s().createProject('Typed', 'in');
    s().addObject('cube');
    const id = objs()[objs().length - 1].id;
    s().updateObject(id, { dimensions: { ...get(id).dimensions, length: 44.13 } });
    expect(get(id).dimensions.length).toBe(44.13);
  });
});

describe('floor-safe resize', () => {
  it('a part on the floor grows upward, bottom fixed', () => {
    const before = part(6, 12);
    expect(floorSafeY(before, { ...before, dimensions: { ...before.dimensions, height: 30 } })).toBe(15);
  });
  it('a raised part grows symmetrically but is lifted if it would dip below the floor', () => {
    const before = part(20, 10); // bottom at 15
    expect(floorSafeY(before, { ...before, dimensions: { ...before.dimensions, height: 20 } })).toBe(20);
    expect(floorSafeY(before, { ...before, dimensions: { ...before.dimensions, height: 50 } })).toBe(25);
  });
  it('handles rotated parts (uses the real lowest point)', () => {
    const before = part(5, 10, { rotation: { x: 0, y: 0, z: 90 }, dimensions: { length: 10, width: 10, height: 10 } });
    const after = { ...before, dimensions: { ...before.dimensions, length: 30 } }; // length is vertical now
    expect(floorSafeY(before, after)).toBeCloseTo(15, 4);
  });
  it('clamps group moves to the floor', () => {
    expect(floorSafeDy([part(6, 12), part(20, 4)], -10)).toBeCloseTo(0, 6);
    expect(floorSafeDy([part(10, 12)], -10)).toBe(-4);
    expect(floorSafeDy([part(10, 12)], 5)).toBe(5);
  });

  it('store: height via handle/bar/typed keeps a resting part on the floor; groups never dip below', () => {
    s().createProject('Floor', 'in');
    s().addObject('cube');
    s().addObject('cube');
    const [a, b] = objs().filter((o) => o.shape === 'cube').slice(-2).map((o) => o.id);
    const bottom = (id: string) => get(id).position.y - get(id).dimensions.height / 2;
    expect(bottom(a)).toBeCloseTo(0, 4);
    s().updateObject(a, { dimensions: { ...get(a).dimensions, height: 40 } });
    expect(bottom(a)).toBeCloseTo(0, 4);
    expect(get(a).position.y).toBeCloseTo(20, 4);
    s().updateObject(b, { position: { ...get(b).position, x: 40 } });
    s().selectMany([a, b]);
    s().groupSelected();
    const g = s().selectedObjectId!;
    s().updateObject(g, { position: { ...get(g).position, y: get(g).position.y - 30 } });
    expect(Math.min(bottom(a), bottom(b))).toBeGreaterThanOrEqual(-1e-6);
    // Floor off: no clamp.
    s().toggleFloor();
    s().updateObject(a, { dimensions: { ...get(a).dimensions, height: 60 } });
    expect(get(a).position.y).toBeCloseTo(20, 4);
  });
});

describe('snap contacts', () => {
  const settings: SnapSettings = { enabled: true, faceSnap: true, gridSnap: true, gridSize: 0.5, floorCollision: true };
  it('reports the target face (outer vs inner) it snapped to', () => {
    const other = { ...part(5, 10), id: 'o' }; // x from -5 to 5
    const mover = { ...part(5, 10), id: 'm' };
    const outer = calculateSnappedPosition(mover, { x: 10.5, y: 5, z: 30 }, [other], settings);
    expect(outer.position.x).toBe(10);
    expect(outer.contacts).toContainEqual({ targetId: 'o', axis: 'x', side: 'max', value: 5 });
    // Approaching from the other side hits the opposite face of the same part.
    const far = calculateSnappedPosition(mover, { x: -10.4, y: 5, z: 30 }, [other], settings);
    expect(far.position.x).toBe(-10);
    expect(far.contacts).toContainEqual({ targetId: 'o', axis: 'x', side: 'min', value: -5 });
    const none = calculateSnappedPosition(mover, { x: 40, y: 50, z: 40 }, [other], { ...settings, gridSnap: false });
    expect(none.contacts).toEqual([]);
  });
});
