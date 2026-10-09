import { beforeEach, describe, expect, it } from 'vitest';

const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage ??= {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => { mem.set(k, v); },
  removeItem: (k: string) => { mem.delete(k); },
  clear: () => mem.clear(),
  key: () => null,
  length: 0,
} as Storage;

const { useProjectStore, HISTORY_LIMIT } = await import('./useProjectStore');
const s = () => useProjectStore.getState();
const objs = () => s().projects.find((p) => p.id === s().activeProjectId)!.objects;

describe('undo / redo', () => {
  beforeEach(() => { s().createProject('Undo test', 'in'); });

  it('undoes and redoes adds, and clears redo on a new change', () => {
    const start = objs().length;
    s().addObject('cube');
    s().addObject('board');
    expect(objs().length).toBe(start + 2);
    s().undo();
    expect(objs().length).toBe(start + 1);
    s().redo();
    expect(objs().length).toBe(start + 2);
    s().undo();
    s().addObject('cylinder');
    expect(s().historyIndex).toBe(s().historyStack.length - 1);
    s().redo();
    expect(objs().some((o) => o.shape === 'board')).toBe(false);
  });

  it('treats a whole drag as one step and ignores no-op gestures', () => {
    s().addObject('cube');
    const id = objs()[objs().length - 1].id;
    const before = s().historyIndex;
    for (let i = 1; i <= 10; i++) s().updateObject(id, { position: { x: i, y: 10, z: 0 } }, true);
    s().pushHistoryState();
    s().pushHistoryState(); // nothing changed since
    expect(s().historyIndex).toBe(before + 1);
    s().undo();
    expect(objs().find((o) => o.id === id)!.position.x).not.toBe(10);
  });

  it('selection changes are not steps; undo drops a stale selection', () => {
    s().addObject('cube');
    const id = objs()[objs().length - 1].id;
    const before = s().historyIndex;
    s().selectObject(null);
    s().selectObject(id);
    expect(s().historyIndex).toBe(before);
    s().undo();
    expect(s().selectedObjectIds).not.toContain(id);
  });

  it('persists the undone state and caps history', () => {
    s().addObject('cube');
    s().undo();
    const saved = JSON.parse(localStorage.getItem('ipad_3d_furniture_projects_v1')!);
    const proj = saved.find((p: { id: string }) => p.id === s().activeProjectId);
    expect(proj.objects.length).toBe(objs().length);
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) s().addObject('cube');
    expect(s().historyStack.length).toBeLessThanOrEqual(HISTORY_LIMIT);
  });

  it('switching projects resets history', () => {
    const first = s().activeProjectId;
    s().addObject('cube');
    s().createProject('Other', 'in');
    s().switchProject(first);
    expect(s().historyIndex).toBe(0);
  });
});
