import type { BuiltInInfo, BuiltInTemplateId, FurnitureObject, RoomWall, ScannedRoom, WoodMaterial } from '../types/furniture';
import { generateMediaWall, MEDIA_WALL_DEFAULTS, MEDIA_WALL_TAG, type MediaWallInput, type MediaWallPart } from '../generators/mediaWall';
import { fitMediaWall } from '../generators/fitMediaWall';
import { wallFrame, wallToWorld } from '../generators/roomScan';

type Part = Omit<FurnitureObject, 'id'>;
type Input = Record<string, number | string>;

export interface BuiltInTemplate {
  id: BuiltInTemplateId;
  name: string;
  description: string;
  tag: string;
  defaults: Input;
  /** Parts in wall-local coords plus the fitted center/width. */
  fit: (input: Input, wall: RoomWall, opts: { width?: number; center?: number }) => { parts: Part[]; center: number; width: number };
  /** Free-standing parts at the origin (manual flow). */
  free: (input: Input) => Part[];
}

/** Registry: add new built-in templates here. */
export const BUILT_IN_TEMPLATES: BuiltInTemplate[] = [
  {
    id: 'media-wall',
    name: 'Media wall',
    description: 'Base cabinets, centered TV panel, matching uppers.',
    tag: MEDIA_WALL_TAG,
    defaults: { ...MEDIA_WALL_DEFAULTS } as unknown as Input,
    fit: (input, wall, opts) => fitMediaWall(input as unknown as MediaWallInput, wall, opts),
    free: (input) => generateMediaWall(input as unknown as MediaWallInput) as MediaWallPart[],
  },
];

export const findBuiltInTemplate = (id: BuiltInTemplateId) => BUILT_IN_TEMPLATES.find((t) => t.id === id);

export interface BuiltInRequest {
  template: BuiltInTemplateId;
  input: Input;
  wallId?: string;
  /** Wall-local center/width override (fitted only). */
  center?: number;
  width?: number;
  /** Regenerate this existing instance instead of adding a new one. */
  editId?: string;
}

function bounds(parts: Part[]) {
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const o of parts) {
    minX = Math.min(minX, o.position.x - o.dimensions.length / 2); maxX = Math.max(maxX, o.position.x + o.dimensions.length / 2);
    minY = Math.min(minY, o.position.y - o.dimensions.height / 2); maxY = Math.max(maxY, o.position.y + o.dimensions.height / 2);
    minZ = Math.min(minZ, o.position.z - o.dimensions.width / 2); maxZ = Math.max(maxZ, o.position.z + o.dimensions.width / 2);
  }
  return {
    size: { length: maxX - minX, height: maxY - minY, width: maxZ - minZ },
    center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 },
  };
}

/**
 * Pure: returns the project's objects with the built-in added (or the edited
 * instance replaced). Only that instance's group and parts are touched.
 */
export function placeBuiltIn(
  objects: FurnitureObject[],
  room: ScannedRoom | undefined,
  req: BuiltInRequest,
  groupMaterial: WoodMaterial,
  stamp = Date.now(),
): { objects: FurnitureObject[]; groupId: string } | null {
  const template = findBuiltInTemplate(req.template);
  if (!template) return null;
  const wall = req.wallId ? room?.walls.find((w) => w.id === req.wallId) : undefined;
  const id = req.editId ?? `bi_${stamp}_${Math.random().toString(36).slice(2, 6)}`;
  const groupId = `grp_${id}`;
  let parts: Part[];
  let groupPos: { x: number; y: number; z: number };
  let groupRotY = 0;
  let size: { length: number; height: number; width: number };
  let info: BuiltInInfo;
  if (wall) {
    const fit = template.fit(req.input, wall, { width: req.width, center: req.center });
    if (fit.parts.length === 0) return null;
    const b = bounds(fit.parts);
    size = b.size;
    groupPos = wallToWorld(wall, b.center);
    groupRotY = wall.yaw;
    parts = fit.parts.map((p) => ({ ...p, position: wallToWorld(wall, p.position), rotation: { ...p.rotation, y: p.rotation.y + wall.yaw } }));
    info = { id, template: template.id, wallId: wall.id, center: fit.center, input: { ...req.input, wallWidth: fit.width } };
  } else {
    parts = template.free(req.input);
    if (parts.length === 0) return null;
    const b = bounds(parts);
    size = b.size;
    groupPos = b.center;
    info = { id, template: template.id, input: { ...req.input } };
  }
  const placed: FurnitureObject[] = parts.map((p, i) => ({ ...p, id: `obj_${id}_${i}`, parentId: groupId, builtInId: id }));
  const group: FurnitureObject = {
    id: groupId,
    name: template.name,
    shape: 'group',
    dimensions: size,
    position: groupPos,
    rotation: { x: 0, y: groupRotY, z: 0 },
    material: groupMaterial,
    visible: true,
    generator: template.tag,
    builtIn: info,
  };
  const kept = objects.filter((o) => o.id !== groupId && o.builtInId !== id);
  return { objects: [...kept, ...placed, group], groupId };
}

/** Built-in groups in a project. */
export function listBuiltIns(objects: FurnitureObject[]): FurnitureObject[] {
  return objects.filter((o) => o.shape === 'group' && o.builtIn);
}

export function builtInLabel(group: FurnitureObject, room?: ScannedRoom): string {
  const name = findBuiltInTemplate(group.builtIn!.template)?.name ?? group.name;
  const wall = group.builtIn?.wallId ? room?.walls.find((w) => w.id === group.builtIn!.wallId) : undefined;
  return wall ? `${name} · ${wall.label}` : name;
}

/**
 * Constrain a wall-fitted built-in's requested position: slide along its wall
 * only, flush and on the floor, kept within the wall. Returns the new position
 * and wall-local center.
 */
export function slideAlongWall(group: FurnitureObject, wall: RoomWall, desired: { x: number; y: number; z: number }) {
  const { along, normal } = wallFrame(wall.yaw);
  const dx = desired.x - wall.x, dz = desired.z - wall.z;
  const cur = { x: group.position.x - wall.x, z: group.position.z - wall.z };
  const depth = cur.x * normal.x + cur.z * normal.z;
  const half = Math.max(0, (wall.width - group.dimensions.length) / 2);
  const t = Math.max(-half, Math.min(half, dx * along.x + dz * along.z));
  return { position: wallToWorld(wall, { x: t, y: group.position.y, z: depth }), center: Math.round(t * 1000) / 1000 };
}
