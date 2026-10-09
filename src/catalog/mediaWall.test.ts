import { describe, expect, it, vi } from 'vitest';
import {
  MEDIA_WALL_DEFAULTS,
  buildMediaWallObjects,
  generateMediaWall,
  normalizeMediaWallParams,
  projectHasMediaWall,
  replaceMediaWall,
  suggestBaseCabinetCount,
  type GeneratedPart,
} from './mediaWall';
import type { FurnitureObject, FurnitureProject } from '../types/furniture';
import { generateCutList } from '../utils/exportUtils';
import { projectsFromRecords, recordsFromProjects } from '../sync/merge';
import { useProjectStore } from '../state/useProjectStore';

const EPS = 0.001;

interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

function bounds(part: GeneratedPart): Bounds {
  return {
    minX: part.position.x - part.dimensions.length / 2,
    maxX: part.position.x + part.dimensions.length / 2,
    minY: part.position.y - part.dimensions.height / 2,
    maxY: part.position.y + part.dimensions.height / 2,
    minZ: part.position.z - part.dimensions.width / 2,
    maxZ: part.position.z + part.dimensions.width / 2,
  };
}

function overlapDepth(a: Bounds, b: Bounds): number {
  const x = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
  const y = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
  const z = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
  if (x <= EPS || y <= EPS || z <= EPS) return 0;
  return Math.min(x, y, z);
}

function named(parts: GeneratedPart[], name: string): GeneratedPart[] {
  return parts.filter((part) => part.name === name || part.name.startsWith(`${name} `));
}

function expectValidLayout(parts: GeneratedPart[]) {
  expect(parts.length).toBeGreaterThan(0);
  const wall = parts.find((part) => part.name === 'Wall');
  expect(wall?.locked).toBe(true);
  expect(wall).toBeTruthy();
  const wallBox = bounds(wall!);

  for (const part of parts) {
    expect(part.dimensions.length).toBeGreaterThan(0);
    expect(part.dimensions.width).toBeGreaterThan(0);
    expect(part.dimensions.height).toBeGreaterThan(0);
    expect(part.shape).toBe('cube');
    const box = bounds(part);
    expect(box.minX).toBeGreaterThanOrEqual(wallBox.minX - EPS);
    expect(box.maxX).toBeLessThanOrEqual(wallBox.maxX + EPS);
    expect(box.minY).toBeGreaterThanOrEqual(wallBox.minY - EPS);
    expect(box.maxY).toBeLessThanOrEqual(wallBox.maxY + EPS);
    expect(box.minZ).toBeGreaterThanOrEqual(wallBox.minZ - EPS);
  }

  for (let i = 0; i < parts.length; i += 1) {
    for (let j = i + 1; j < parts.length; j += 1) {
      const depth = overlapDepth(bounds(parts[i]), bounds(parts[j]));
      if (depth > 0) {
        throw new Error(`${parts[i].name} overlaps ${parts[j].name} by ${depth}`);
      }
    }
  }

  for (const part of parts) {
    const mirror = parts.some((other) => {
      return Math.abs(other.position.x + part.position.x) <= EPS
        && Math.abs(other.position.y - part.position.y) <= EPS
        && Math.abs(other.position.z - part.position.z) <= EPS
        && Math.abs(other.dimensions.length - part.dimensions.length) <= EPS
        && Math.abs(other.dimensions.width - part.dimensions.width) <= EPS
        && Math.abs(other.dimensions.height - part.dimensions.height) <= EPS;
    });
    expect(mirror, `${part.name} has no mirror`).toBe(true);
  }
}

describe('suggestBaseCabinetCount', () => {
  it('picks a count in the 24–36 in band', () => {
    expect(suggestBaseCabinetCount(144)).toBe(5);
    expect(suggestBaseCabinetCount(96)).toBe(3);
    expect(MEDIA_WALL_DEFAULTS.baseCount).toBe(suggestBaseCabinetCount(144));
  });
});

describe('generateMediaWall', () => {
  it('is deterministic and builds the default wall without overlap', () => {
    const first = generateMediaWall(MEDIA_WALL_DEFAULTS);
    const second = generateMediaWall(MEDIA_WALL_DEFAULTS);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expectValidLayout(first);

    const wall = first.find((part) => part.name === 'Wall')!;
    expect(wall.dimensions.length).toBe(144);
    expect(wall.dimensions.height).toBe(96);
    expect(wall.dimensions.width).toBe(0.5);
    expect(wall.material.baseColor).not.toBe(first.find((part) => part.name === 'Countertop')!.material.baseColor);

    const cabinets = named(first, 'Base cabinet');
    expect(cabinets).toHaveLength(5);
    const widths = cabinets.map((part) => part.dimensions.length);
    expect(new Set(widths.map((width) => width.toFixed(4))).size).toBe(1);
    const toes = named(first, 'Toe kick');
    expect(toes).toHaveLength(5);
    for (const cabinet of cabinets) {
      const toe = toes.find((part) => Math.abs(part.position.x - cabinet.position.x) < EPS)!;
      const cabinetBox = bounds(cabinet);
      const toeBox = bounds(toe);
      expect(cabinetBox.minY).toBeCloseTo(4, 5);
      expect(toeBox.maxY).toBeCloseTo(4, 5);
      expect(toeBox.minY).toBeCloseTo(0, 5);
      expect(cabinetBox.maxZ - toeBox.maxZ).toBeCloseTo(3, 5);
      expect(toeBox.minZ).toBeCloseTo(cabinetBox.minZ, 5);
    }

    const counter = first.find((part) => part.name === 'Countertop')!;
    expect(bounds(counter).minY).toBeCloseTo(30, 5);
    expect(counter.dimensions.height).toBeCloseTo(0.75, 5);
    expect(counter.dimensions.length).toBeCloseTo(cabinets.length * cabinets[0].dimensions.length, 5);

    const tv = first.find((part) => part.name === 'TV backer')!;
    expect(tv.position.x).toBeCloseTo(0, 6);
    // A 65 in 16:9 screen does not fit with its center at 42 above a 30 in base, so it sits on the counter.
    expect(tv.position.y).toBeCloseTo(46.6546875, 4);
    expect(bounds(tv).minY).toBeGreaterThanOrEqual(bounds(counter).maxY - EPS);
    expect(tv.dimensions.length / tv.dimensions.height).toBeCloseTo(16 / 9, 4);

    const shelves = named(first, 'Shelf');
    expect(shelves.length).toBeGreaterThan(0);
    expect(shelves.length % 2).toBe(0);
    const left = shelves.filter((part) => part.position.x < 0);
    const right = shelves.filter((part) => part.position.x > 0);
    expect(left).toHaveLength(right.length);
    for (let index = 0; index < left.length; index += 1) {
      const gap = Math.abs(left[index].position.y - (index === 0 ? bounds(counter).maxY : bounds(left[index - 1]).maxY));
      expect(gap).toBeGreaterThan(PANEL_GAP_FLOOR);
    }

    expect(named(first, 'Side panel')).toHaveLength(2);
    expect(first.some((part) => part.name.startsWith('Upper cabinet'))).toBe(false);
  });

  it('keeps a smaller TV centered at 42 in', () => {
    const parts = generateMediaWall({ ...MEDIA_WALL_DEFAULTS, tvSize: 43 });
    expectValidLayout(parts);
    const tv = parts.find((part) => part.name === 'TV backer')!;
    expect(tv.position.y).toBeCloseTo(42, 5);
    expect(tv.position.x).toBeCloseTo(0, 6);
  });

  it('builds symmetrical cabinet uppers instead of shelves', () => {
    const parts = generateMediaWall({ ...MEDIA_WALL_DEFAULTS, uppers: 'cabinets' });
    expectValidLayout(parts);
    expect(named(parts, 'Shelf')).toHaveLength(0);
    const uppers = named(parts, 'Upper cabinet');
    expect(uppers).toHaveLength(2);
    expect(uppers[0].position.x).toBeCloseTo(-uppers[1].position.x, 5);
    expect(uppers[0].dimensions.height).toBeCloseTo(uppers[1].dimensions.height, 5);
  });

  it('honors an explicit cabinet count and still fills the inner width', () => {
    const parts = generateMediaWall({ ...MEDIA_WALL_DEFAULTS, baseCount: 8 });
    expectValidLayout(parts);
    const cabinets = named(parts, 'Base cabinet');
    expect(cabinets).toHaveLength(8);
    const span = cabinets.reduce((sum, part) => sum + part.dimensions.length, 0);
    expect(span).toBeCloseTo(144 - 1.5, 5);
  });

  it('shrinks a TV that is taller than the opening and stays inside a short wall', () => {
    const parts = generateMediaWall({ ...MEDIA_WALL_DEFAULTS, wallWidth: 48, wallHeight: 48, baseCount: 1 });
    expectValidLayout(parts);
    const tv = parts.find((part) => part.name === 'TV backer')!;
    expect(tv.dimensions.length / tv.dimensions.height).toBeCloseTo(16 / 9, 4);
    expect(named(parts, 'Shelf')).toHaveLength(0);
    expect(named(parts, 'Upper cabinet')).toHaveLength(0);
  });

  it('clamps invalid sizes instead of emitting empty parts', () => {
    const crazy = {
      wallWidth: -10,
      wallHeight: 4,
      tvSize: 400,
      baseCount: 0,
      uppers: 'shelves' as const,
      baseDepth: 1,
    };
    const normalized = normalizeMediaWallParams(crazy);
    expect(normalized.wallWidth).toBeGreaterThan(0);
    expect(normalized.wallHeight).toBeGreaterThan(normalized.baseDepth);
    const direct = generateMediaWall(crazy);
    const via = generateMediaWall(normalized);
    expect(JSON.stringify(direct)).toBe(JSON.stringify(via));
    expectValidLayout(direct);
  });
});

const PANEL_GAP_FLOOR = 1;

describe('replace and persistence', () => {
  it('replaces only the previous media wall and keeps other parts', () => {
    const ids = (role: string, index: number) => `${role}_${index}`;
    const first = buildMediaWallObjects(MEDIA_WALL_DEFAULTS, ids);
    const loose: FurnitureObject = {
      id: 'loose_box',
      name: 'Loose box',
      shape: 'cube',
      dimensions: { length: 4, width: 4, height: 4 },
      position: { x: 80, y: 2, z: 40 },
      rotation: { x: 0, y: 0, z: 0 },
      material: first[0].material,
      visible: true,
    };
    const second = buildMediaWallObjects(
      { ...MEDIA_WALL_DEFAULTS, baseCount: 2, uppers: 'cabinets' },
      (role, index) => `${role}_b_${index}`,
    );
    const replaced = replaceMediaWall([...first, loose], second);
    expect(replaced.find((object) => object.id === 'loose_box')).toBeTruthy();
    expect(replaced.some((object) => object.id.startsWith('part_') && !object.id.includes('_b_'))).toBe(false);
    expect(replaced.filter((object) => object.shape === 'group' && object.generator === 'media-wall')).toHaveLength(1);
    expect(projectHasMediaWall(replaced)).toBe(true);
    const group = replaced.find((object) => object.shape === 'group')!;
    expect(group.name).toBe('Media wall');
    expect(group.mediaWall?.baseCount).toBe(2);
    expect(replaced.filter((object) => object.parentId === group.id).length).toBe(second.length - 1);
  });

  it('lists cabinets in the cut list and leaves out the locked wall and the group', () => {
    const objects = buildMediaWallObjects(MEDIA_WALL_DEFAULTS, (role, index) => `${role}_${index}`);
    const project = projectWith(objects);
    const cut = generateCutList(project);
    expect(cut.some((item) => item.name === 'Wall' || item.name === 'Media wall')).toBe(false);
    expect(cut.some((item) => item.shape === 'Group')).toBe(false);
    const cabinets = cut.find((item) => item.name.startsWith('Base cabinet'));
    expect(cabinets?.quantity).toBe(5);
    expect(cabinets?.material).toBe('Plywood');
  });

  it('round-trips through the sync payload and local project reload', () => {
    const memory = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => { memory.set(key, value); },
      removeItem: (key: string) => { memory.delete(key); },
      clear: () => { memory.clear(); },
      key: () => null,
      length: 0,
    });

    const store = useProjectStore.getState();
    store.applyMediaWall(MEDIA_WALL_DEFAULTS);
    const activeId = useProjectStore.getState().activeProjectId;
    const before = useProjectStore.getState().projects.find((project) => project.id === activeId)!;
    const cabinet = before.objects.find((object) => object.name === 'Base cabinet')!;
    const shelf = before.objects.find((object) => object.name === 'Shelf')!;
    store.updateObject(cabinet.id, { dimensions: { ...cabinet.dimensions, length: 22 } });
    store.deleteObject(shelf.id);

    const saved = memory.get('ipad_3d_furniture_projects_v1');
    expect(saved).toBeTruthy();
    const records = recordsFromProjects(JSON.parse(saved!) as FurnitureProject[], {});
    const payload = JSON.stringify(records);
    expect(payload).toContain('TV backer');
    expect(payload).toContain('Media wall');
    expect(payload).toContain('"generator":"media-wall"');
    const restoredRecords = projectsFromRecords(JSON.parse(payload));
    const restoredProject = restoredRecords.find((project) => project.id === activeId)!;
    expect(restoredProject.objects.find((object) => object.name === 'Base cabinet')?.dimensions.length).toBe(22);
    expect(restoredProject.objects.some((object) => object.name === 'Shelf')).toBe(false);
    expect(restoredProject.objects.some((object) => object.name === 'Media wall')).toBe(true);

    useProjectStore.getState().loadProjects();
    const reloaded = useProjectStore.getState().projects.find((project) => project.id === activeId)!;
    expect(reloaded.objects.find((object) => object.name === 'Base cabinet')?.dimensions.length).toBe(22);
    expect(reloaded.objects.some((object) => object.id === shelf.id)).toBe(false);
    expect(reloaded.objects.some((object) => object.name === 'Wall' && object.locked)).toBe(true);

    const group = reloaded.objects.find((object) => object.name === 'Media wall')!;
    store.duplicateObject(group.id);
    const copy = useProjectStore.getState().projects
      .find((project) => project.id === activeId)!
      .objects.find((object) => object.name === 'Media wall Copy');
    expect(copy?.generator).toBeUndefined();
  });
});

function projectWith(objects: FurnitureObject[]): FurnitureProject {
  return {
    id: 'proj_test',
    name: 'Test',
    createdAt: 1,
    updatedAt: 1,
    unit: 'in',
    objects,
    snapSettings: { enabled: true, faceSnap: true, gridSnap: true, gridSize: 0.5, floorCollision: true },
    showFloor: true,
    floorOpacity: 0.4,
  };
}
