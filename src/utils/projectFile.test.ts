import { describe, expect, it } from 'vitest';
import type { FurnitureObject, FurnitureProject } from '../types/furniture';
import { importProjectFromJSON } from './exportUtils';
import { backupFileName, backupFileText, openProjectFile, openedMessage } from './projectFile';
import { sharePayloadString } from './share';
import { PRESET_WOOD_MATERIALS } from './woodTextureGenerator';

const obj = (id: string, extra: Partial<FurnitureObject> = {}): FurnitureObject => ({
  id, name: id, shape: 'board', dimensions: { length: 24, width: 12, height: 0.75 }, position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 }, material: { ...PRESET_WOOD_MATERIALS.plywood }, ...extra,
});
const proj = (id: string, updatedAt = 100): FurnitureProject => ({
  id, name: `Cabinet ${id}`, createdAt: 50, updatedAt, unit: 'in',
  objects: [obj('G', { shape: 'group' }), obj('side', { parentId: 'G' }), obj('shelf', { parentId: 'G' })],
  joints: [{ id: 'j1', type: 'dado', receiverId: 'side', materId: 'shelf', face: '+x', depth: 0.25, extended: 0.25 } as any],
  measurements: [{ id: 'm1', a: { x: 0, y: 0, z: 0 }, b: { x: 1, y: 0, z: 0 } } as any],
  scannedRoom: { walls: [] }, roomLocked: true,
  snapSettings: { enabled: true, faceSnap: true, gridSnap: true, gridSize: 0.5, floorCollision: true },
  showFloor: true, floorOpacity: 0.4, viewStyle: 'clean',
});

describe('project file import', () => {
  it('keeps groups, joints, measurements and the room, re-linked to fresh ids', () => {
    const p = importProjectFromJSON(sharePayloadString(proj('a')))!;
    expect(p.id).not.toBe('a');
    expect(p.name).toBe('Cabinet a (Imported)');
    const [g, side, shelf] = p.objects;
    expect(g.id).not.toBe('G');
    expect(side.parentId).toBe(g.id);
    expect(shelf.parentId).toBe(g.id);
    expect(p.joints).toEqual([expect.objectContaining({ receiverId: side.id, materId: shelf.id, depth: 0.25 })]);
    expect(p.measurements).toHaveLength(1);
    expect(p.scannedRoom).toEqual({ walls: [] });
    expect(p.roomLocked).toBe(true);
    expect(new Set(p.objects.map((o) => o.id)).size).toBe(3);
  });

  it('drops links to parts that are not in the file', () => {
    const raw = proj('a');
    raw.objects = raw.objects.filter((o) => o.id !== 'G' && o.id !== 'shelf');
    const p = importProjectFromJSON(JSON.stringify({ project: raw }))!;
    expect(p.objects[0].parentId).toBeUndefined();
    expect(p.joints).toBeUndefined();
  });
});

describe('backups', () => {
  it('names the file by local date', () => {
    expect(backupFileName(new Date(2026, 9, 5, 23, 30))).toBe('Workbench backup 2026-10-05.json');
  });

  it('restores missing projects as they were, skips unchanged, copies edited ones', () => {
    const text = backupFileText([proj('a', 100), proj('b', 100), proj('c', 100)]);
    const opened = openProjectFile(text, [{ id: 'a', updatedAt: 100 }, { id: 'b', updatedAt: 200 }])!;
    expect(opened.kind).toBe('backup');
    expect(opened.skipped).toBe(1);
    const [b, c] = opened.projects;
    expect(b.id).not.toBe('b');
    expect(b.name).toBe('Cabinet b (from backup)');
    expect(c).toMatchObject({ id: 'c', name: 'Cabinet c', createdAt: 50, updatedAt: 100 });
    expect(c.objects.map((o) => o.id)).toEqual(['G', 'side', 'shelf']);
    expect(c.joints?.[0]).toMatchObject({ receiverId: 'side', materId: 'shelf' });
    expect(openedMessage(opened)).toBe('Restored 2 projects (1 already here).');
  });

  it('restoring the same backup twice adds nothing', () => {
    const text = backupFileText([proj('a')]);
    const first = openProjectFile(text, [])!;
    const again = openProjectFile(text, first.projects)!;
    expect(again.projects).toHaveLength(0);
    expect(again.skipped).toBe(1);
  });

  it('opens a single project file as a new copy, rejects anything else', () => {
    const one = openProjectFile(sharePayloadString(proj('a')), [{ id: 'a', updatedAt: 100 }])!;
    expect(one.kind).toBe('project');
    expect(one.projects[0].id).not.toBe('a');
    expect(openedMessage(one)).toBe('Imported “Cabinet a (Imported)”.');
    expect(openProjectFile('not json')).toBeNull();
    expect(openProjectFile('{"hello":1}')).toBeNull();
    expect(openProjectFile('{"kind":"workbench-backup","projects":[]}')).toBeNull();
  });
});
