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

describe('addScannedRoom', () => {
  const wall = (id: string) => ({ id, label: 'Wall 1', width: 120, height: 96, x: 0, z: -60, yaw: 0, openings: [] });
  it('adds to the current project and replaces only an earlier scan', () => {
    s().createProject('Scan later', 'in');
    const projectId = s().activeProjectId;
    s().addObject('cube');
    const userParts = objs().filter((o) => o.generator !== 'room-scan').length;
    expect(s().addScannedRoom({ walls: [wall('a')] })).toBe(true);
    expect(s().addScannedRoom({ walls: [wall('b'), { ...wall('c'), label: 'Wall 2' }] })).toBe(true);
    expect(s().activeProjectId).toBe(projectId);
    expect(objs().filter((o) => o.generator === 'room-scan')).toHaveLength(2);
    expect(objs().filter((o) => o.generator !== 'room-scan')).toHaveLength(userParts);
    expect(s().projects.find((p) => p.id === projectId)!.scannedRoom!.walls.map((w) => w.id)).toEqual(['b', 'c']);
  });
});

describe('unlock then delete a scanned wall', () => {
  it('unlocking with a wall selects it, delete removes it and updates scannedRoom', async () => {
    const { roomScanParts } = await import('../generators/roomScan');
    void roomScanParts;
    s().createProject('Unlock', 'in');
    const walls = [
      { id: 'a', label: 'Wall 1', width: 120, height: 96, x: 0, z: -60, yaw: 0, openings: [] },
      { id: 'b', label: 'Wall 2', width: 100, height: 96, x: -60, z: 0, yaw: 90, openings: [] },
    ];
    s().addScannedRoom({ walls });
    s().setRoomLocked(false, 'b');
    const sel = objs().find((o) => o.id === s().selectedObjectId)!;
    expect(sel.generator).toBe('room-scan');
    expect(sel.wallId).toBe('b');
    s().deleteObject(sel.id);
    const proj = s().projects.find((p) => p.id === s().activeProjectId)!;
    expect(proj.objects.some((o) => o.wallId === 'b')).toBe(false);
    expect(proj.scannedRoom!.walls.map((w) => w.id)).toEqual(['a']);
    s().setRoomLocked(true);
    expect(objs().find((o) => o.id === s().selectedObjectId)?.generator).not.toBe('room-scan');
  });
});

describe('boards and sheet presets', async () => {
  const { STANDARD_WOOD_PRESETS } = await import('./useProjectStore');
  const { shapeCatalogEntry } = await import('../catalog/shapeCatalog');
  const { defaultBoardOptions } = await import('../utils/boardGeometry');
  it('names boards "Board" with square edges by default', () => {
    expect(shapeCatalogEntry('board')!.defaultName).toBe('Board');
    expect(defaultBoardOptions()).toMatchObject({ edge: 'none', cornerRadius: 0, holes: [] });
  });
  it('has plywood and MDF sheet categories with their finishes', () => {
    const ply = STANDARD_WOOD_PRESETS.filter((p) => p.category === 'Plywood sheets');
    const mdf = STANDARD_WOOD_PRESETS.filter((p) => p.category === 'MDF sheets');
    expect(ply.map((p) => p.dimensions.height)).toEqual([0.25, 0.5, 0.75]);
    expect(mdf.map((p) => p.dimensions.height)).toEqual([0.25, 0.5, 0.75]);
    expect(ply.every((p) => p.material.species === 'plywood')).toBe(true);
    expect(mdf.every((p) => p.material.species === 'mdf')).toBe(true);
  });
  it('inserting an MDF sheet applies the MDF finish', () => {
    s().createProject('Sheets', 'in');
    s().addWoodPreset('mdf_4x8_3_4');
    const o = objs()[objs().length - 1];
    expect(o.material.species).toBe('mdf');
    expect(o.shape).toBe('board');
  });
});
