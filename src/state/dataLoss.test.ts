import { afterEach, describe, expect, it } from 'vitest';
import type { FurnitureObject, FurnitureProject, Joint } from '../types/furniture';
import { deepDuplicate } from './groupTree';

const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage ??= {
  getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); },
  removeItem: (k: string) => { mem.delete(k); }, clear: () => mem.clear(), key: () => null, length: 0,
} as Storage;

const { useProjectStore, SAVE_FAILED_MESSAGE } = await import('./useProjectStore');
const s = () => useProjectStore.getState();

const mat = { id: 'oak', name: 'Oak', species: 'oak', baseColor: '#000', secondaryColor: '#000', grainIntensity: 0, grainScale: 1, roughness: 1, metalness: 0, varnishSheen: 'matte' } as FurnitureObject['material'];
const part = (id: string, x: number, extra: Partial<FurnitureObject> = {}): FurnitureObject => ({
  id, name: id, shape: 'cube', dimensions: { length: 2, width: 2, height: 2 }, position: { x, y: 1, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, material: mat, ...extra,
});
const joint = (id: string, receiverId: string, materId: string): Joint => ({
  id, type: 'dado', receiverId, materId, face: '+x', depth: 0.25, extended: 0,
} as Joint);

/** A project with a group G holding parts a and b, a dado between them, and a loose part c. */
function cabinet(id = 'p1', updatedAt = 1000): FurnitureProject {
  return {
    id, name: 'Cabinet', createdAt: 1, updatedAt, unit: 'in',
    objects: [
      { ...part('G', 0), shape: 'group' },
      part('a', 0, { parentId: 'G' }),
      part('b', 4, { parentId: 'G' }),
      part('c', 10),
    ],
    joints: [joint('j1', 'a', 'b'), joint('j2', 'a', 'c')],
  } as FurnitureProject;
}

function load(projects: FurnitureProject[], activeId = projects[0].id) {
  useProjectStore.setState({ projects, activeProjectId: activeId, selectedObjectIds: [], selectedObjectId: null, editingGroupId: null, saveError: null });
}

describe('duplicateProject', () => {
  it('re-links groups and joints to the copy’s own parts, with fresh unique ids', () => {
    load([cabinet()]);
    s().duplicateProject('p1');
    s().duplicateProject('p1');
    const [original, copy1, copy2] = s().projects;
    expect(copy1.name).toBe('Cabinet (Copy)');
    for (const copy of [copy1, copy2]) {
      const ids = new Set(copy.objects.map((o) => o.id));
      expect(copy.objects.some((o) => original.objects.some((p) => p.id === o.id))).toBe(false);
      const group = copy.objects.find((o) => o.shape === 'group')!;
      expect(copy.objects.filter((o) => o.parentId === group.id)).toHaveLength(2);
      expect(copy.objects.every((o) => !o.parentId || ids.has(o.parentId))).toBe(true);
      expect(copy.joints).toHaveLength(2);
      for (const j of copy.joints!) {
        expect(ids.has(j.receiverId)).toBe(true);
        expect(ids.has(j.materId)).toBe(true);
      }
    }
    // Two copies of the same project never share an id.
    const all = [...copy1.objects, ...copy2.objects].map((o) => o.id);
    expect(new Set(all).size).toBe(all.length);
    expect(copy1.id).not.toBe(copy2.id);
    // The original is untouched.
    expect(original.joints!.map((j) => j.receiverId)).toEqual(['a', 'a']);
    expect(copy1.joints!.map((j) => j.id)).not.toContain('j1');
  });
});

describe('renameProject', () => {
  it('bumps updatedAt on a project that is not open, so sync keeps the new name', () => {
    load([cabinet('open', 1000), cabinet('other', 2000)], 'open');
    s().renameProject('other', 'Bookshelf');
    const other = s().projects.find((p) => p.id === 'other')!;
    expect(other.name).toBe('Bookshelf');
    expect(other.updatedAt).toBeGreaterThan(2000);
  });
});

describe('copying parts copies their joints', () => {
  it('deepDuplicate copies joints only when both parts were copied', () => {
    const p = cabinet();
    const result = deepDuplicate(p.objects, ['G'], undefined, undefined, p.joints);
    expect(result.joints).toHaveLength(1); // a–b came along; a–c did not (c wasn't copied)
    const [copied] = result.joints;
    const newIds = new Set(result.objects.map((o) => o.id).filter((id) => !p.objects.some((o) => o.id === id)));
    expect(newIds.has(copied.receiverId)).toBe(true);
    expect(newIds.has(copied.materId)).toBe(true);
    expect(copied.id).not.toBe('j1');
    expect(deepDuplicate(p.objects, ['c'], undefined, undefined, p.joints).joints).toHaveLength(0);
  });

  it('Duplicate in the editor adds the copied joints to the project', () => {
    load([cabinet()]);
    useProjectStore.setState({ selectedObjectIds: ['G'], selectedObjectId: 'G' });
    s().duplicateSelected();
    const p = s().projects[0];
    expect(p.joints).toHaveLength(3);
    const copy = p.joints![2];
    expect([copy.receiverId, copy.materId]).not.toContain('a');
    expect(p.objects.find((o) => o.id === copy.receiverId)).toBeTruthy();
  });
});

describe('save failures are not silent', () => {
  const realSetItem = localStorage.setItem;
  afterEach(() => { localStorage.setItem = realSetItem; });

  it('shows the warning, keeps the edit in memory, and clears after a good save', () => {
    load([cabinet()]);
    localStorage.setItem = () => { throw new DOMException('Quota exceeded', 'QuotaExceededError'); };
    s().renameProject('p1', 'Big cabinet');
    expect(s().saveError).toBe(SAVE_FAILED_MESSAGE);
    expect(s().projects[0].name).toBe('Big cabinet');
    s().dismissSaveError();
    expect(s().saveError).toBeNull();

    s().renameProject('p1', 'Bigger cabinet');
    expect(s().saveError).toBe(SAVE_FAILED_MESSAGE);
    localStorage.setItem = realSetItem;
    s().saveCurrentProject();
    expect(s().saveError).toBeNull();
  });
});
