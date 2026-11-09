import { describe, expect, it } from 'vitest';
import type { FurnitureObject, SnapSettings } from '../types/furniture';
import { objectBox } from '../state/groupTree';
import { bottomOf, floorClampY, liftToFloor } from './resizeRules';
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

const mat = { type: 'wood', color: '#c8a27a' } as unknown as FurnitureObject['material'];
const part = (id: string, size: [number, number, number], at: [number, number, number], extra: Partial<FurnitureObject> = {}): FurnitureObject => ({
  id, name: id, shape: 'board', dimensions: { length: size[0], height: size[1], width: size[2] },
  position: { x: at[0], y: at[1], z: at[2] }, rotation: { x: 0, y: 0, z: 0 }, material: mat, visible: true, ...extra,
} as FurnitureObject);
const settings: SnapSettings = { enabled: true, faceSnap: true, gridSnap: false, gridSize: 0.5, floorCollision: true };
const off: SnapSettings = { ...settings, enabled: false };
// A 3/4" sheet stood up on its edge (Bunk beds side panel): turned 90° about X, so its
// 48" width is now vertical and its "height" field (3/4") is its thickness.
const panel = (id: string, y: number, x = 0) => part(id, [24, 0.75, 48], [x, y, 0], { rotation: { x: 90, y: 0, z: 0 } });
const top = (o: FurnitureObject) => objectBox(o).max.y;

describe('floor: a rotated part never goes through the floor', () => {
  it('the stood-up panel is 48" tall in the world, not 3/4"', () => {
    expect(bottomOf(panel('p', 24))).toBeCloseTo(0, 6);
    expect(floorClampY(panel('p', 6.5))).toBeCloseTo(24, 6);
  });

  it('dragging it down stops with its bottom on the floor (old clamp used height/2 = 3/8")', () => {
    for (const s0 of [settings, off]) {
      const r = calculateSnappedPosition(panel('m', 24), { x: 0, y: 6.5, z: 0 }, [], s0, { dragAxis: 'y' });
      expect(r.position.y).toBeCloseTo(24, 6);
    }
  });

  it('snapping can never pull it below the floor (tucking under a raised rail, or a flush face)', () => {
    // A rail whose underside is 30" up; the 48" panel tucked under it would end at -18".
    const rail = part('rail', [40, 4, 4], [0, 32, 0]);
    const r = calculateSnappedPosition(panel('m', 25), { x: 0, y: 6.2, z: 0 }, [rail], settings, { dragAxis: 'y' });
    expect(bottomOf({ ...panel('m', 0), position: r.position })).toBeGreaterThanOrEqual(-1e-6);
    // Sitting flush against another panel, then pushed down.
    const neighbour = panel('n', 24, 24);
    const r2 = calculateSnappedPosition(panel('m', 24, 0.3), { x: 0.3, y: 3, z: 0 }, [neighbour], settings, { dragAxis: 'y' });
    expect(bottomOf({ ...panel('m', 0), position: r2.position })).toBeGreaterThanOrEqual(-1e-6);
    expect(r2.position.x).toBeCloseTo(0, 6); // still flush (24" panels side by side)
  });

  it('store: a typed or dragged position, the Floor slider, rotate and duplicate keep it above the floor', () => {
    s().createProject('Bunk beds floor', 'in');
    s().addObject('board');
    const id = objs()[objs().length - 1].id;
    s().updateObject(id, { dimensions: { length: 24, height: 0.75, width: 48 }, rotation: { x: 90, y: 0, z: 0 } });
    expect(bottomOf(get(id))).toBeGreaterThanOrEqual(-1e-6); // rotate keeps it on the floor
    // A move to y = 6.5 (old clamp allowed it: 6.5 > 3/8") is lifted to y = 24.
    s().updateObject(id, { position: { ...get(id).position, y: 6.5 } });
    expect(bottomOf(get(id))).toBeCloseTo(0, 6);
    // Duplicate of a part that already dipped below the floor (old saved project) comes back up.
    s().updateSnapSettings({ floorCollision: false });
    s().updateObject(id, { position: { ...get(id).position, y: 6.5 } });
    expect(bottomOf(get(id))).toBeLessThan(0);
    s().updateSnapSettings({ floorCollision: true });
    s().selectObject(id);
    s().duplicateSelected();
    const copy = s().selectedObjectId!;
    expect(copy).not.toBe(id);
    expect(bottomOf(get(copy))).toBeCloseTo(0, 6);
    s().duplicateObject(id);
    expect(bottomOf(get(s().selectedObjectId!))).toBeCloseTo(0, 6);
  });

  it('group moves and copies of groups lift the whole group by its lowest part', () => {
    const a = { ...panel('a', 10), parentId: 'g' }, b = { ...part('b', [10, 10, 10], [30, 20, 0]), parentId: 'g' };
    const g = part('g', [1, 1, 1], [0, 0, 0], { shape: 'group' } as Partial<FurnitureObject>);
    const out = liftToFloor([g, a, b], ['g']);
    expect(bottomOf(out.find((o) => o.id === 'a')!)).toBeCloseTo(0, 6);
    expect(out.find((o) => o.id === 'b')!.position.y).toBeCloseTo(34, 6); // moved by the same 14"
    expect(liftToFloor([b], ['b'])).toEqual([b]); // nothing below: untouched
  });
});

describe('floor: tipped parts use the rotated bounding box', () => {
  it('a 10" cube tipped 45° on X is lifted by half its world height, not height/2', () => {
    const tipped = part('t', [10, 10, 10], [0, 1, 0], { rotation: { x: 45, y: 0, z: 0 } });
    const y = floorClampY(tipped);
    expect(y).toBeCloseTo(5 * Math.SQRT2, 5);
    expect(bottomOf({ ...tipped, position: { x: 0, y, z: 0 } })).toBeCloseTo(0, 5);
    // The old half-height clamp (y = 5) would still leave the corners below the floor.
    expect(bottomOf({ ...tipped, position: { x: 0, y: 5, z: 0 } })).toBeLessThan(-0.5);
  });
});

describe('magnet: touching parts can be levelled top to top and bottom to bottom', () => {
  // Two 24 x 6 boards, 3/4" thick, end to end; the mover is raised a little.
  const board = (id: string, x: number, y = 0.375) => part(id, [24, 0.75, 6], [x, y, 0]);

  it('two 3/4" boards touching end to end: a vertical drag levels the tops instead of stacking a board-thickness off', () => {
    const a = board('a', 0);
    // Old behaviour: bottom-to-top distance 0.45 < 1.2" reach, so it "stacked" at y = 1.125.
    const r = calculateSnappedPosition(board('m', 24, 0.675), { x: 24, y: 0.675, z: 0 }, [a], settings, { dragAxis: 'y' });
    expect(r.position).toEqual({ x: 24, y: 0.375, z: 0 });
    expect(top({ ...board('m', 0), position: r.position })).toBeCloseTo(top(a), 9);
    expect(r.contacts.find((c) => c.axis === 'y')).toBeUndefined();
    expect(r.hint).toBe('Ends touching · Tops flush');
  });

  it('raised boards: tops level with tops, bottoms with bottoms, whichever is nearer', () => {
    const a = board('a', 0, 20); // top at 20.375, bottom at 19.625
    const up = calculateSnappedPosition(board('m', 24), { x: 24, y: 20.9, z: 0 }, [a], settings, { dragAxis: 'y' });
    expect(up.position.y).toBeCloseTo(20, 9);
    expect(up.hint).toBe('Ends touching · Tops flush');
    // A 30" tall side beside a 30" cabinet: 1" off is still within reach of tops flush.
    const cab = part('cab', [24, 30, 12], [0, 25, 0]); // bottom at 10
    const side = part('m', [0.75, 30, 12], [12.375, 26, 0]);
    const r = calculateSnappedPosition(side, { x: 12.375, y: 26, z: 0 }, [cab], settings, { dragAxis: 'y' });
    expect(r.position.y).toBeCloseTo(25, 9);
    expect(r.position.x).toBeCloseTo(12.375, 9); // still against the cabinet side
    expect(r.hint).toMatch(/Tops flush/);
    // Bottoms flush when the mover is shorter.
    const short = part('m', [0.75, 10, 12], [12.375, 14.4, 0]); // bottom at 9.4, cabinet bottom at 10
    const rb = calculateSnappedPosition(short, { x: 12.375, y: 14.4, z: 0 }, [cab], settings, { dragAxis: 'y' });
    expect(objectBox({ ...short, position: rb.position }).min.y).toBeCloseTo(10, 9);
    expect(rb.hint).toMatch(/Bottoms flush/);
  });

  it('a horizontal drag into a side contact also levels tops (flush only), and a flush face on X does not block Z alignment', () => {
    const a = board('a', 0);
    const r = calculateSnappedPosition(board('m', 30, 0.675), { x: 24.3, y: 0.675, z: 0.1 }, [a], settings, { dragAxis: 'x' });
    expect(r.position.x).toBeCloseTo(24, 9); // ends touching
    expect(r.position.y).toBeCloseTo(0.375, 9); // tops flush
    expect(r.position.z).toBeCloseTo(0, 9); // sides lined up on the other axis
    // Without any contact a horizontal drag still keeps its height.
    const free = calculateSnappedPosition(board('m', 60, 0.675), { x: 60, y: 0.675, z: 0 }, [a], settings, { dragAxis: 'x' });
    expect(free.position.y).toBeCloseTo(0.675, 9);
  });

  it('the touched part wins over a nearer edge of some other part', () => {
    const a = board('a', 0);
    const shelf = part('shelf', [24, 0.75, 6], [24, 0.6, 20]); // top at 0.975, 14" behind
    const r = calculateSnappedPosition(board('m', 24, 0.8), { x: 24, y: 0.8, z: 0 }, [a, shelf], settings, { dragAxis: 'y' });
    expect(r.position.y).toBeCloseTo(0.375, 9);
  });

  it('a part sitting on another never snaps its end onto the other part\'s far face', () => {
    const a = board('a', 0);
    const r = calculateSnappedPosition(board('m', 17), { x: 23.4, y: 1.125, z: 0 }, [a], settings, { dragAxis: 'x' });
    expect(r.contacts.find((c) => c.axis === 'x')).toBeUndefined();
    expect(r.position.x).toBeCloseTo(23.4, 9);
  });

  it('stood-up panels snap with their real (rotated) faces', () => {
    const p = panel('p', 24);
    const b = objectBox(p);
    expect(b.max.y - b.min.y).toBeCloseTo(48, 6);
    const r = calculateSnappedPosition(panel('m', 24.4), { x: 24.5, y: 24.4, z: 0 }, [p], settings, { dragAxis: 'x' });
    expect(r.position.x).toBeCloseTo(24, 9); // edge to edge
    expect(r.position.y).toBeCloseTo(24, 9); // tops flush (and on the floor)
  });
});

describe('magnet: no fake insets', () => {
  it('a 3/4" board never offers "Inset 3/4"" (that is its opposite face, a stack offset)', async () => {
    const { inferAlignments } = await import('./snapInfer');
    const a = part('a', [24, 0.75, 6], [0, 20, 0]);
    const m = part('m', [24, 0.75, 6], [30, 20.8, 0]);
    const r = inferAlignments(m, { x: 30, y: 20.8, z: 0 }, [a], {});
    expect(r.alignments.find((x) => x.axis === 'y' && x.kind === 'inset' && x.inset === 0.75)).toBeUndefined();
  });
});
