import { beforeEach, describe, expect, it } from 'vitest';
import type { FurnitureObject } from '../types/furniture';
import { ancestorIds, areaSelect, deepDuplicate, deleteCascade, descendantIds, groupIds, normalizeTree, pathTo, topUnder, ungroupOne } from './groupTree';

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

const mat = { id: 'oak', name: 'Oak', species: 'oak', baseColor: '#000', secondaryColor: '#000', grainIntensity: 0, grainScale: 1, roughness: 1, metalness: 0, varnishSheen: 'matte' } as FurnitureObject['material'];
const part = (id: string, x: number, extra: Partial<FurnitureObject> = {}): FurnitureObject => ({
  id, name: id, shape: 'cube', dimensions: { length: 2, width: 2, height: 2 }, position: { x, y: 1, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, material: mat, ...extra,
});
const grp = (id: string, extra: Partial<FurnitureObject> = {}): FurnitureObject => ({ ...part(id, 0), shape: 'group', ...extra });

describe('groupTree (pure)', () => {
  const tree = [
    grp('A'), grp('B', { parentId: 'A' }),
    part('a1', 0, { parentId: 'A' }), part('b1', 10, { parentId: 'B' }), part('b2', 20, { parentId: 'B' }),
    part('free', 40),
  ];

  it('walks nesting', () => {
    expect(descendantIds(tree, 'A').sort()).toEqual(['B', 'a1', 'b1', 'b2']);
    expect(ancestorIds(tree, 'b1')).toEqual(['B', 'A']);
    expect(pathTo(tree, 'B')).toEqual(['A', 'B']);
  });

  it('tap resolves to the top-most item in the current context', () => {
    expect(topUnder(tree, 'b1', null)).toBe('A');
    expect(topUnder(tree, 'b1', 'A')).toBe('B');
    expect(topUnder(tree, 'b1', 'B')).toBe('b1');
    expect(topUnder(tree, 'free', 'A')).toBeNull();
  });

  it('groups siblings, nesting existing groups, and fits the box', () => {
    const r = groupIds(tree, ['A', 'free'], null, mat, 'G')!;
    expect(get2(r.objects, 'A').parentId).toBe('G');
    expect(get2(r.objects, 'free').parentId).toBe('G');
    const g = get2(r.objects, 'G');
    expect(g.parentId).toBeUndefined();
    expect(g.dimensions.length).toBeCloseTo(42); // -1 .. 41
    expect(g.position.x).toBeCloseTo(20);
  });

  it('groups inside an opened group and lifts deep picks to the context level', () => {
    const r = groupIds(tree, ['b1', 'a1'], 'A', mat, 'G')!;
    expect(get2(r.objects, 'G').parentId).toBe('A');
    expect(get2(r.objects, 'B').parentId).toBe('G'); // b1 lifted to B
    expect(get2(r.objects, 'a1').parentId).toBe('G');
  });

  it('ungroup moves children up one level only', () => {
    const r = ungroupOne(tree, 'B')!;
    expect(r.objects.some((o) => o.id === 'B')).toBe(false);
    expect(get2(r.objects, 'b1').parentId).toBe('A');
    expect(r.childIds.sort()).toEqual(['b1', 'b2']);
  });

  it('ungrouping a built-in turns its parts into plain parts', () => {
    const t = [grp('W', { builtIn: { id: 'bi1', template: 'media-wall', input: {} } }), part('w1', 0, { parentId: 'W', builtInId: 'bi1' })];
    const r = ungroupOne(t, 'W')!;
    expect(get2(r.objects, 'w1').builtInId).toBeUndefined();
    expect(get2(r.objects, 'w1').parentId).toBeUndefined();
  });

  it('delete cascades through nested groups', () => {
    const out = deleteCascade(tree, ['A']);
    expect(out.map((o) => o.id)).toEqual(['free']);
  });

  it('deep duplicate copies the subtree with fresh ids, offset, and remapped parents', () => {
    const r = deepDuplicate(tree, ['A'], { x: 4, y: 0, z: 4 }, 1);
    expect(r.objects.length).toBe(tree.length + 5);
    const top = get2(r.objects, r.topIds[0]);
    expect(top.name).toBe('A Copy');
    const copies = r.objects.slice(tree.length);
    const ids = new Set(copies.map((o) => o.id));
    for (const c of copies) {
      expect(tree.some((o) => o.id === c.id)).toBe(false);
      if (c.id !== top.id) expect(ids.has(c.parentId!)).toBe(true);
    }
    const b1copy = copies.find((c) => c.name === 'b1')!;
    expect(b1copy.position.x).toBe(14);
    expect(ancestorIds(r.objects, b1copy.id)).toHaveLength(2);
  });

  it('duplicated built-ins get a new instance id', () => {
    const t = [grp('W', { builtIn: { id: 'bi1', template: 'media-wall', input: {} } }), part('w1', 0, { parentId: 'W', builtInId: 'bi1' })];
    const r = deepDuplicate(t, ['W'], undefined, 2);
    const [g, p] = [r.objects[2], r.objects[3]];
    expect(g.builtIn!.id).not.toBe('bi1');
    expect(p.builtInId).toBe(g.builtIn!.id);
  });

  it('normalizeTree drops dangling parents and cycles, keeps old one-level groups', () => {
    const bad = [grp('X', { parentId: 'Y' }), grp('Y', { parentId: 'X' }), part('p', 0, { parentId: 'missing' }), grp('G'), part('q', 0, { parentId: 'G' })];
    const out = normalizeTree(bad);
    expect(out.find((o) => o.id === 'p')!.parentId).toBeUndefined();
    expect(out.find((o) => o.id === 'q')!.parentId).toBe('G');
    expect(out.filter((o) => o.id === 'X' || o.id === 'Y').some((o) => !o.parentId)).toBe(true);
    expect(normalizeTree(tree)).toBe(tree);
  });

  it('area select projects bounds and respects context and locked walls', () => {
    // Orthographic top-down-ish: screen x = world x * 10, y = world z * 10.
    const project = (p: { x: number; y: number; z: number }) => ({ x: p.x * 10, y: p.z * 10 });
    const t = [...tree, part('wall', 100, { generator: 'room-scan' })];
    expect(areaSelect(t, null, { x0: 350, y0: -50, x1: 450, y1: 50 }, project)).toEqual(['free']);
    expect(areaSelect(t, null, { x0: -50, y0: -50, x1: 50, y1: 50 }, project)).toEqual(['A']);
    expect(areaSelect(t, 'B', { x0: 150, y0: -50, x1: 250, y1: 50 }, project)).toEqual(['b2']);
    expect(areaSelect(t, null, { x0: 950, y0: -50, x1: 1050, y1: 50 }, project)).toEqual([]);
    expect(areaSelect(t, null, { x0: 950, y0: -50, x1: 1050, y1: 50 }, project, false)).toEqual(['wall']);
    expect(areaSelect(t, null, { x0: 450, y0: 50, x1: 350, y1: -50 }, project)).toEqual(['free']); // reversed drag
  });
});

function get2(list: FurnitureObject[], id: string) { return list.find((o) => o.id === id)!; }

describe('store: nested groups', () => {
  let ids: string[];
  beforeEach(() => {
    s().createProject('Groups test', 'in');
    for (let i = 0; i < 4; i++) s().addObject('cube');
    ids = objs().filter((o) => o.shape === 'cube').map((o) => o.id).slice(-4);
    ids.forEach((id, i) => s().updateObject(id, { position: { x: i * 20, y: 6, z: 0 } }));
  });

  it('groups, nests, moves the whole tree, and undoes in single steps', () => {
    s().selectMany([ids[0], ids[1]]);
    s().groupSelected();
    const inner = s().selectedObjectId!;
    s().selectMany([inner, ids[2]]);
    s().groupSelected();
    const outer = s().selectedObjectId!;
    expect(get(inner).parentId).toBe(outer);
    const before = s().historyIndex;
    const x0 = get(ids[0]).position.x;
    s().updateObject(outer, { position: { ...get(outer).position, x: get(outer).position.x + 10 } });
    expect(get(ids[0]).position.x).toBeCloseTo(x0 + 10);
    expect(get(inner).position.x).toBeCloseTo(get(inner).position.x);
    expect(s().historyIndex).toBe(before + 1);
    s().undo();
    expect(get(ids[0]).position.x).toBeCloseTo(x0);
  });

  it('open / breadcrumb / up a level', () => {
    s().selectMany([ids[0], ids[1]]);
    s().groupSelected();
    const inner = s().selectedObjectId!;
    s().selectMany([inner, ids[2]]);
    s().groupSelected();
    const outer = s().selectedObjectId!;
    s().enterGroup(outer);
    s().enterGroup(inner);
    expect(s().editingGroupId).toBe(inner);
    s().exitGroup();
    expect(s().editingGroupId).toBe(outer);
    expect(s().selectedObjectId).toBe(inner);
    s().enterGroup(inner);
    s().setGroupContext(null);
    expect(s().editingGroupId).toBeNull();
    expect(s().selectedObjectId).toBe(outer);
  });

  it('deletes and duplicates a nested group as one step each', () => {
    s().selectMany([ids[0], ids[1]]);
    s().groupSelected();
    const g = s().selectedObjectId!;
    const n = objs().length;
    const h = s().historyIndex;
    s().duplicateSelected();
    expect(objs().length).toBe(n + 3);
    expect(s().historyIndex).toBe(h + 1);
    s().selectMany([g]);
    s().deleteSelected();
    expect(objs().some((o) => o.id === ids[0] || o.id === g)).toBe(false);
    s().undo();
    expect(objs().some((o) => o.id === ids[0])).toBe(true);
  });

  it('moves a multi-selection together in one step', () => {
    s().selectMany([ids[0], ids[3]]);
    const h = s().historyIndex;
    s().translateSelection({ x: 5, y: 0, z: 2 }, true);
    s().translateSelection({ x: 5, y: 0, z: 2 }, true);
    s().pushHistoryState();
    expect(get(ids[0]).position).toMatchObject({ x: 10, z: 4 });
    expect(get(ids[3]).position).toMatchObject({ x: 70, z: 4 });
    expect(get(ids[1]).position.x).toBe(20);
    expect(s().historyIndex).toBe(h + 1);
  });

  it('member edits refit the group box', () => {
    s().selectMany([ids[0], ids[1]]);
    s().groupSelected();
    const g = s().selectedObjectId!;
    const len = get(g).dimensions.length;
    s().updateObject(ids[1], { position: { ...get(ids[1]).position, x: get(ids[1]).position.x + 30 } });
    expect(get(g).dimensions.length).toBeCloseTo(len + 30);
  });
});
