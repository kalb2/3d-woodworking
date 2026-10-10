import { create } from 'zustand';
import type { FurnitureObject, RoomWall, WoodMaterial } from '../types/furniture';
import { wallFrame, wallToWorld } from '../generators/roomScan';

export type TemplatePart = Omit<FurnitureObject, 'id' | 'parentId'>;

export interface UserTemplate {
  id: string;
  name: string;
  createdAt: number;
  /** Parts in template-local coords: centered on x/z, floor at y = 0, unrotated. */
  parts: TemplatePart[];
}

const r = (n: number) => Math.round(n * 1000) / 1000;

function strip(o: FurnitureObject): TemplatePart {
  const { id: _id, parentId: _p, builtIn: _b, builtInId: _bi, wallId: _w, openingId: _o, generator: _g, locked: _l, reference: _r, ...rest } = o;
  void _id; void _p; void _b; void _bi; void _w; void _o; void _g; void _l; void _r;
  return JSON.parse(JSON.stringify(rest));
}

/**
 * Deep-copy the selection (an object, or a group and its members) into
 * template-local parts. Room-scan and reference parts are dropped; a group's
 * yaw is undone so the template is axis-aligned. Pure.
 */
export function partsFromSelection(objects: FurnitureObject[], selectedId: string): TemplatePart[] {
  const sel = objects.find((o) => o.id === selectedId);
  if (!sel) return [];
  const members = sel.shape === 'group' ? objects.filter((o) => o.parentId === sel.id && o.shape !== 'group') : [sel];
  const usable = members.filter((o) => o.generator !== 'room-scan' && !o.reference);
  if (usable.length === 0) return [];
  const yaw = sel.shape === 'group' ? sel.rotation.y : 0;
  const pivot = sel.position;
  // Undo the yaw (three.js Y rotation, as used for wall-fitted built-ins).
  const { along, normal } = wallFrame(yaw);
  let parts = usable.map((o) => {
    const p = strip(o);
    const x = o.position.x - pivot.x, z = o.position.z - pivot.z;
    p.position = { x: x * along.x + z * along.z, y: o.position.y, z: x * normal.x + z * normal.z };
    p.rotation = { ...o.rotation, y: o.rotation.y - yaw };
    return p;
  });
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, minY = Infinity;
  for (const p of parts) {
    minX = Math.min(minX, p.position.x - p.dimensions.length / 2); maxX = Math.max(maxX, p.position.x + p.dimensions.length / 2);
    minZ = Math.min(minZ, p.position.z - p.dimensions.width / 2); maxZ = Math.max(maxZ, p.position.z + p.dimensions.width / 2);
    minY = Math.min(minY, p.position.y - p.dimensions.height / 2);
  }
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  parts = parts.map((p) => ({ ...p, position: { x: r(p.position.x - cx), y: r(p.position.y - minY), z: r(p.position.z - cz) } }));
  return parts;
}

export interface Placement {
  /** Free placement: floor point to center on. */
  at?: { x: number; z: number };
  /** Flush against this wall, centered. */
  wall?: RoomWall;
}

/** World-space parts + group for inserting a template. Pure. */
export function instantiateUserTemplate(t: UserTemplate, place: Placement, groupMaterial: WoodMaterial, stamp = Date.now()): FurnitureObject[] {
  if (t.parts.length === 0) return [];
  const groupId = `grp_${stamp}_tpl`;
  let minZ = Infinity;
  for (const p of t.parts) minZ = Math.min(minZ, p.position.z - p.dimensions.width / 2);
  const yaw = place.wall ? place.wall.yaw : 0;
  const toWorld = (p: { x: number; y: number; z: number }) => place.wall
    ? wallToWorld(place.wall, { x: p.x, y: p.y, z: p.z - minZ })
    : { x: r(p.x + (place.at?.x ?? 0)), y: r(p.y), z: r(p.z + (place.at?.z ?? 0)) };
  const parts: FurnitureObject[] = t.parts.map((p, i) => ({
    ...JSON.parse(JSON.stringify(p)),
    id: `obj_${stamp}_tpl_${i}_${Math.random().toString(36).slice(2, 6)}`,
    parentId: groupId,
    position: toWorld(p.position),
    rotation: { ...p.rotation, y: p.rotation.y + yaw },
  }));
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, lzMin = Infinity, lzMax = -Infinity;
  for (const p of t.parts) {
    minX = Math.min(minX, p.position.x - p.dimensions.length / 2); maxX = Math.max(maxX, p.position.x + p.dimensions.length / 2);
    minY = Math.min(minY, p.position.y - p.dimensions.height / 2); maxY = Math.max(maxY, p.position.y + p.dimensions.height / 2);
    lzMin = Math.min(lzMin, p.position.z - p.dimensions.width / 2); lzMax = Math.max(lzMax, p.position.z + p.dimensions.width / 2);
  }
  const group: FurnitureObject = {
    id: groupId,
    name: t.name,
    shape: 'group',
    dimensions: { length: r(maxX - minX), height: r(maxY - minY), width: r(lzMax - lzMin) },
    position: toWorld({ x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (lzMin + lzMax) / 2 }),
    rotation: { x: 0, y: yaw, z: 0 },
    material: groupMaterial,
    visible: true,
  };
  return t.parts.length === 1 ? parts.map((p) => ({ ...p, parentId: undefined, name: t.name })) : [...parts, group];
}

const STORAGE_KEY = 'workbench_user_templates_v1';

function load(): UserTemplate[] {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

interface UserTemplateState {
  templates: UserTemplate[];
  save: (name: string, parts: TemplatePart[]) => UserTemplate | null;
  rename: (id: string, name: string) => void;
  remove: (id: string) => void;
}

/** Saved templates: local to this device (project sync carries projects only). */
export const useUserTemplates = create<UserTemplateState>((set, get) => {
  const persist = (templates: UserTemplate[]) => {
    set({ templates });
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(templates)); } catch { /* storage full/unavailable */ }
  };
  return {
    templates: load(),
    save: (name, parts) => {
      if (parts.length === 0) return null;
      const t: UserTemplate = { id: `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, name: name.trim() || 'Template', createdAt: Date.now(), parts };
      persist([t, ...get().templates]);
      return t;
    },
    rename: (id, name) => persist(get().templates.map((t) => (t.id === id ? { ...t, name: name.trim() || t.name } : t))),
    remove: (id) => persist(get().templates.filter((t) => t.id !== id)),
  };
});

/** Latest orbit target (updated by the canvas each frame, no re-renders). */
export const cameraTarget = { x: 0, z: 0 };
