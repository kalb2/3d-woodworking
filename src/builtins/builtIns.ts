import * as THREE from 'three';
import type { BuiltInInfo, BuiltInTemplateId, FurnitureObject, Joint, RoomWall, ScannedRoom, WoodMaterial } from '../types/furniture';
import { generateMediaWall, MEDIA_WALL_DEFAULTS, MEDIA_WALL_TAG, type MediaWallInput, type MediaWallPart } from '../generators/mediaWall';
import { fitMediaWall } from '../generators/fitMediaWall';
import { wallFrame, wallToWorld } from '../generators/roomScan';
import { formatSmallLen } from '../utils/lengthFormat';
import { buildModule, fitModule, MODULES, moduleHardware, normalizeModuleInput, type ModuleField, type ModuleId, type ModuleJoint, type ModuleSpec } from '../generators/modules';
import type { Span } from '../generators/fitMediaWall';
import { buildDoors, buildDrawers, doorHardware, doorNote, doorSummary, DOOR_DEFAULTS, DOOR_FIELDS, drawerHardware, drawerNote, drawerSummary, DRAWER_DEFAULTS, DRAWER_FIELDS, normalizeDoors, normalizeDrawers } from '../fittings/fittings';

type Part = Omit<FurnitureObject, 'id'>;
type Input = Record<string, number | string>;

export interface BuiltInTemplate {
  id: BuiltInTemplateId;
  name: string;
  description: string;
  tag: string;
  defaults: Input;
  /** Parts in wall-local coords plus the fitted center/width. */
  fit: (input: Input, wall: RoomWall, opts: { width?: number; center?: number; occupied?: Span[] }) => { parts: Part[]; joints?: ModuleJoint[]; center: number; width: number; input?: Input };
  /** Free-standing parts around the origin (x centered, y from the floor, z from the back). */
  free: (input: Input) => { parts: Part[]; joints?: ModuleJoint[] };
  /** Parametric modules: generic form fields, and the row they line up in on a wall. */
  fields?: ModuleField[];
  tier?: 'base' | 'upper';
  /** Overall size params (group resize rebuilds instead of stretching). */
  size?: ModuleSpec['size'];
  /** Template inputs with defaults filled in and clamped. */
  normalize?: (input: Input) => Input;
  /** Drawers / doors: fill an opening; added from Drawer / Door, not the template list. */
  fitting?: boolean;
  /** Origin is the front (not the back): depth grows into the cabinet. */
  frontOrigin?: boolean;
  /** Hardware beyond the joints (slides, hinges, pulls). */
  hardware?: (input: Input) => { name: string; quantity: number }[];
  /** One-line summary for Properties. */
  summary?: (input: Input, unit: 'in' | 'cm' | 'mm' | 'ft') => string;
  /** What the numbers come out to, under the setup form. */
  note?: (input: Input, unit: 'in' | 'cm' | 'mm' | 'ft') => string;
}

const unfit = () => ({ parts: [], center: 0, width: 0 });

/** Registry: add new built-in templates here. */
export const BUILT_IN_TEMPLATES: BuiltInTemplate[] = [
  {
    id: 'media-wall',
    name: 'Media wall',
    description: 'Base cabinets, centered TV panel, matching uppers.',
    tag: MEDIA_WALL_TAG,
    defaults: { ...MEDIA_WALL_DEFAULTS } as unknown as Input,
    fit: (input, wall, opts) => fitMediaWall(input as unknown as MediaWallInput, wall, opts),
    free: (input) => ({ parts: generateMediaWall(input as unknown as MediaWallInput) as MediaWallPart[] }),
  },
  ...MODULES.map((m): BuiltInTemplate => ({
    id: m.id,
    name: m.name,
    description: m.description,
    tag: m.id,
    defaults: { ...m.defaults },
    fields: m.fields,
    tier: m.tier,
    size: m.size,
    normalize: (input) => normalizeModuleInput(m.id, input),
    fit: (input, wall, opts) => fitModule(m.id as ModuleId, input, wall, { center: opts.center, occupied: opts.occupied }),
    free: (input) => buildModule(m.id as ModuleId, input),
    hardware: (input) => moduleHardware(m.id as ModuleId, input),
  })),
  {
    id: 'drawers', name: 'Drawers', description: 'A drawer or a stack of drawers sized to an opening.', tag: 'drawers',
    defaults: { ...DRAWER_DEFAULTS }, fields: DRAWER_FIELDS, size: { x: 'width', y: 'height', z: 'depth' },
    normalize: normalizeDrawers, fitting: true, frontOrigin: true,
    fit: unfit, free: buildDrawers, hardware: drawerHardware, summary: drawerSummary, note: drawerNote,
  },
  {
    id: 'door', name: 'Doors', description: 'A door or a pair, slab or shaker, with hinge cups.', tag: 'door',
    defaults: { ...DOOR_DEFAULTS }, fields: DOOR_FIELDS, size: { x: 'width', y: 'height', z: 'thickness' },
    normalize: normalizeDoors, fitting: true, frontOrigin: true,
    fit: unfit, free: buildDoors, hardware: doorHardware, summary: doorSummary, note: doorNote,
  },
];

/** Templates shown in the template lists (drawers and doors come from Drawer / Door). */
export const LISTED_TEMPLATES = BUILT_IN_TEMPLATES.filter((t) => !t.fitting);

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
  /** New free-standing instance: floor point to center it on (default the origin). */
  at?: { x: number; z: number };
  /** Editing: move the template's origin by this much in its own frame (resize keeps the opposite face put). */
  shift?: { x: number; y: number; z: number };
  /** Free-standing: put the template's origin here, turned this way (drawers/doors in an opening). */
  frame?: { origin: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number } };
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

const DEG = Math.PI / 180;
const r3 = (n: number) => Math.round(n * 10000) / 10000 || 0;

/** Part and joint ids are stable per instance, so a rebuild keeps them. */
export const builtInPartId = (id: string, i: number) => `obj_${id}_${i}`;
export const builtInJointId = (id: string, k: number) => `jt_${id}_${k}`;

/** The template's frame (origin = back-bottom-center of its parts) for a placed free-standing instance. */
function frameOf(template: BuiltInTemplate, group: FurnitureObject) {
  const prevLocal = bounds(template.free(group.builtIn!.input).parts).center;
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(group.rotation.x * DEG, group.rotation.y * DEG, group.rotation.z * DEG, 'XYZ'));
  const o = new THREE.Vector3(group.position.x, group.position.y, group.position.z).sub(new THREE.Vector3(prevLocal.x, prevLocal.y, prevLocal.z).applyQuaternion(q));
  return { origin: o, q, rotation: { ...group.rotation } };
}

/**
 * Pure: returns the project's objects (and joints) with the built-in added, or
 * the edited instance rebuilt in place: same group id, same spot and turn,
 * nested where it was. Only that instance's group, parts and joints change.
 */
export function placeBuiltIn(
  objects: FurnitureObject[],
  room: ScannedRoom | undefined,
  req: BuiltInRequest,
  groupMaterial: WoodMaterial,
  stamp = Date.now(),
  joints: Joint[] = [],
): { objects: FurnitureObject[]; groupId: string; joints: Joint[] } | null {
  const template = findBuiltInTemplate(req.template);
  if (!template) return null;
  const wall = req.wallId ? room?.walls.find((w) => w.id === req.wallId) : undefined;
  const id = req.editId ?? `bi_${stamp}_${Math.random().toString(36).slice(2, 6)}`;
  const groupId = `grp_${id}`;
  const prev = req.editId ? objects.find((o) => o.id === groupId) : undefined;
  let parts: Part[];
  let built: ModuleJoint[] = [];
  let groupPos: { x: number; y: number; z: number };
  let groupRot = { x: 0, y: 0, z: 0 };
  let size: { length: number; height: number; width: number };
  let info: BuiltInInfo;
  if (wall) {
    // Modules line up after same-tier modules already on this wall.
    const occupied: Span[] = template.tier ? objects.filter((g) => g.shape === 'group' && g.builtIn?.wallId === wall.id && g.builtIn.id !== req.editId
      && findBuiltInTemplate(g.builtIn.template)?.tier === template.tier && typeof g.builtIn.center === 'number')
      .map((g) => { const w = Number(g.builtIn!.input.wallWidth ?? g.builtIn!.input.width ?? g.dimensions.length); return { x0: g.builtIn!.center! - w / 2, x1: g.builtIn!.center! + w / 2 }; }) : [];
    const fit = template.fit(req.input, wall, { width: req.width, center: req.center, occupied });
    if (fit.parts.length === 0) return null;
    built = fit.joints ?? [];
    const b = bounds(fit.parts);
    size = b.size;
    groupPos = wallToWorld(wall, b.center);
    groupRot = { x: 0, y: wall.yaw, z: 0 };
    parts = fit.parts.map((p) => ({ ...p, position: wallToWorld(wall, p.position), rotation: { ...p.rotation, y: (p.rotation.y + wall.yaw) % 360 } }));
    info = { id, template: template.id, wallId: wall.id, center: fit.center, input: { ...(fit.input ?? req.input), wallWidth: fit.width } };
  } else {
    const out = template.free(req.input);
    if (out.parts.length === 0) return null;
    built = out.joints ?? [];
    const b = bounds(out.parts);
    size = b.size;
    let origin: THREE.Vector3;
    let q = new THREE.Quaternion();
    if (req.frame) {
      const f = req.frame;
      origin = new THREE.Vector3(f.origin.x, f.origin.y, f.origin.z);
      groupRot = { ...f.rotation };
      q = new THREE.Quaternion().setFromEuler(new THREE.Euler(f.rotation.x * DEG, f.rotation.y * DEG, f.rotation.z * DEG, 'XYZ'));
    } else if (prev?.builtIn && !prev.builtIn.wallId) {
      const f = frameOf(template, prev);
      origin = f.origin; q = f.q; groupRot = f.rotation;
    } else {
      origin = new THREE.Vector3((req.at?.x ?? 0) - b.center.x, 0, (req.at?.z ?? 0) - b.center.z);
    }
    if (req.shift) origin.add(new THREE.Vector3(req.shift.x, req.shift.y, req.shift.z).applyQuaternion(q));
    const toWorld = (p: { x: number; y: number; z: number }) => {
      const v = new THREE.Vector3(p.x, p.y, p.z).applyQuaternion(q).add(origin);
      return { x: r3(v.x), y: r3(v.y), z: r3(v.z) };
    };
    const yOnly = !groupRot.x && !groupRot.z;
    const turn = (rot: { x: number; y: number; z: number }) => {
      if (yOnly) return { x: rot.x, y: (rot.y + groupRot.y) % 360, z: rot.z };
      const e = new THREE.Euler().setFromQuaternion(q.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(rot.x * DEG, rot.y * DEG, rot.z * DEG, 'XYZ'))), 'XYZ');
      return { x: r3(e.x / DEG), y: r3(e.y / DEG), z: r3(e.z / DEG) };
    };
    groupPos = toWorld(b.center);
    parts = out.parts.map((p) => ({ ...p, position: toWorld(p.position), rotation: turn(p.rotation) }));
    info = { id, template: template.id, input: { ...(template.normalize ? template.normalize(req.input) : req.input) } };
  }
  const placed: FurnitureObject[] = parts.map((p, i) => ({ ...p, id: builtInPartId(id, i), parentId: groupId, builtInId: id }));
  const group: FurnitureObject = {
    id: groupId,
    name: prev?.name ?? template.name,
    shape: 'group',
    dimensions: size,
    position: groupPos,
    rotation: groupRot,
    material: groupMaterial,
    visible: true,
    generator: template.tag,
    builtIn: info,
  };
  if (prev?.ai) group.ai = prev.ai;
  // Editing a nested built-in keeps it in its parent group.
  if (prev?.parentId) group.parentId = prev.parentId;
  const gone = new Set(objects.filter((o) => o.builtInId === id && !(o.parentId && o.parentId !== groupId)).map((o) => o.id));
  const kept = objects.filter((o) => o.id !== groupId && !gone.has(o.id));
  const madeJoints: Joint[] = built.map((j, k) => ({
    id: builtInJointId(id, k), type: j.type, receiverId: builtInPartId(id, j.receiver), materId: builtInPartId(id, j.mater),
    face: j.face, depth: j.depth, extended: j.extended,
    ...(j.count !== undefined ? { count: j.count } : {}), ...(j.fasten ? { fasten: j.fasten } : {}),
  }));
  const newIds = new Set(placed.map((p) => p.id));
  const keptJoints = joints.filter((j) => !gone.has(j.receiverId) && !gone.has(j.materId) && !newIds.has(j.receiverId) && !newIds.has(j.materId) && !j.id.startsWith(`jt_${id}_`));
  return { objects: [...kept, ...placed, group], groupId, joints: [...keptJoints, ...madeJoints] };
}

const near = (a: number, b: number, tol = 0.01) => Math.abs(a - b) <= tol;
const angle = (d: number) => ((Math.round(d * 100) / 100) % 360 + 360) % 360;
const holesKey = (o: FurnitureObject) => JSON.stringify((o.board?.holes ?? o.holes ?? []).map((h) => [h.face ?? 'top', r3(h.x), r3(h.z), r3(h.diameter), h.depth === undefined ? null : r3(h.depth), h.kind ?? 'round']));
const jointKey = (j: Joint) => [j.type, j.receiverId, j.materId, j.face, r3(j.depth), r3(j.extended), j.count ?? null, j.spacing ?? null, j.width ?? null, j.fasten ?? null].join('|');

/**
 * True when the boards of a placed built-in were changed by hand (moved,
 * resized, re-cut, re-finished, deleted, re-joined) so a rebuild would lose that work.
 */
export function builtInModified(objects: FurnitureObject[], joints: Joint[], room: ScannedRoom | undefined, groupId: string): boolean {
  const g = objects.find((o) => o.id === groupId);
  const bi = g?.builtIn;
  if (!g || !bi) return false;
  const width = bi.wallId && typeof bi.input.wallWidth === 'number' ? bi.input.wallWidth : undefined;
  const { wallWidth: _w, ...input } = bi.input;
  void _w;
  const fresh = placeBuiltIn(objects, room, { template: bi.template, input, wallId: bi.wallId, center: bi.center, width, editId: bi.id }, g.material, 0, joints);
  if (!fresh) return false;
  const now = new Map(objects.filter((o) => o.builtInId === bi.id).map((o) => [o.id, o]));
  const made = fresh.objects.filter((o) => o.builtInId === bi.id);
  if (made.length !== now.size) return true;
  for (const m of made) {
    const o = now.get(m.id);
    if (!o) return true;
    const d = o.dimensions, md = m.dimensions;
    if (!near(d.length, md.length) || !near(d.height, md.height) || !near(d.width, md.width)) return true;
    if (!near(o.position.x, m.position.x) || !near(o.position.y, m.position.y) || !near(o.position.z, m.position.z)) return true;
    // Boxes look the same turned 180°; compare the axes they occupy.
    if (['x', 'y', 'z'].some((a) => angle(o.rotation[a as 'x'] - m.rotation[a as 'x']) % 180 > 0.05 && angle(o.rotation[a as 'x'] - m.rotation[a as 'x']) % 180 < 179.95)) return true;
    if ((o.visible !== false) !== (m.visible !== false)) return true;
    if (o.material.species !== m.material.species || o.material.baseColor !== m.material.baseColor || (o.material.stainColor ?? '') !== (m.material.stainColor ?? '')) return true;
    if (o.name !== m.name || holesKey(o) !== holesKey(m)) return true;
    if (JSON.stringify({ ...o.board, holes: undefined }) !== JSON.stringify({ ...m.board, holes: undefined })) return true;
  }
  const ids = new Set(made.map((m) => m.id));
  const mine = (list: Joint[]) => list.filter((j) => ids.has(j.receiverId) || ids.has(j.materId)).map(jointKey).sort().join('\n');
  return mine(joints) !== mine(fresh.joints);
}

/** Extra hardware for the built-ins in a project (hinges, slides, shelf pins, pulls). */
export function builtInHardware(objects: FurnitureObject[]): { name: string; quantity: number }[] {
  const tally = new Map<string, number>();
  for (const g of objects) {
    const t = g.shape === 'group' && g.builtIn ? findBuiltInTemplate(g.builtIn.template) : undefined;
    if (!t?.hardware) continue;
    if (!objects.some((o) => o.builtInId === g.builtIn!.id && o.visible !== false)) continue;
    for (const h of t.hardware(g.builtIn!.input)) tally.set(h.name, (tally.get(h.name) ?? 0) + h.quantity);
  }
  return [...tally].map(([name, quantity]) => ({ name, quantity }));
}

/**
 * Group resize on an unchanged template group: the size param that axis maps
 * to changes and the boards are rebuilt (shelves and doors respace, nothing
 * stretches); the opposite face stays put. Returns null when it doesn't apply.
 */
export function resizeBuiltIn(
  objects: FurnitureObject[], joints: Joint[], room: ScannedRoom | undefined, groupId: string,
  face: '+x' | '-x' | '+y' | '-y' | '+z' | '-z', delta: number, snap?: (n: number) => number,
): { objects: FurnitureObject[]; joints: Joint[] } | null {
  const g = objects.find((o) => o.id === groupId);
  const bi = g?.builtIn;
  const t = bi ? findBuiltInTemplate(bi.template) : undefined;
  if (!g || !bi || !t?.size || !t.normalize || !t.fields) return null;
  if (g.rotation.x || g.rotation.z || (!bi.wallId && g.rotation.y)) return null;
  if (builtInModified(objects, joints, room, groupId)) return null;
  const axis = face[1] as 'x' | 'y' | 'z';
  const key = t.size[axis];
  const { wallWidth: _w, ...cur } = t.normalize(bi.input);
  void _w;
  const old = Number(cur[key]);
  const wanted = snap ? snap(old + delta) : old + delta;
  const next = t.normalize({ ...cur, [key]: wanted });
  const d = Number(next[key]) - old;
  if (Math.abs(d) < 1e-6) return { objects, joints };
  const sign = face[0] === '+' ? 1 : -1;
  const input: Input = { ...next };
  let center = bi.center;
  const shift = { x: 0, y: 0, z: 0 };
  if (axis === 'x') { shift.x = (sign * d) / 2; if (center !== undefined) center += (sign * d) / 2; }
  if (axis === 'y' && sign < 0) {
    if (typeof input.elevation === 'number') input.elevation = Number(t.normalize({ ...input, elevation: Number(input.elevation) - d }).elevation);
    else if (!bi.wallId) shift.y = -d;
  }
  if (axis === 'z' && !bi.wallId && (t.frontOrigin ? sign > 0 : sign < 0)) shift.z = t.frontOrigin ? d : -d;
  const out = placeBuiltIn(objects, room, { template: bi.template, input, wallId: bi.wallId, center, editId: bi.id, shift }, g.material, 0, joints);
  return out ? { objects: out.objects, joints: out.joints } : null;
}

export const templateName = (g: FurnitureObject) => findBuiltInTemplate(g.builtIn!.template)?.name ?? g.name;

/** One line for a placed template, e.g. '36" × 72" × 12" · 4 shelves'. */
export function templateSummary(g: FurnitureObject, unit: 'in' | 'cm' | 'mm' | 'ft' = 'in'): string {
  const t = findBuiltInTemplate(g.builtIn!.template);
  if (!t?.normalize || !t.fields) return '';
  if (t.summary) return t.summary(g.builtIn!.input, unit);
  const v = t.normalize(g.builtIn!.input);
  const len = (n: number) => formatSmallLen(n, unit);
  const size = [v.width, v.height, v.depth].map((n) => len(Number(n))).join(' × ');
  const bits: string[] = [];
  const count = (n: number, one: string, many: string) => { if (n > 0) bits.push(`${n} ${n === 1 ? one : many}`); };
  if (v.doors !== undefined) count(v.doors === 'none' ? 0 : Number(v.doors), 'door', 'doors');
  if (v.drawers !== undefined) count(Number(v.drawers), 'drawer', 'drawers');
  if (v.shelves !== undefined) count(Number(v.shelves), 'shelf', 'shelves');
  if (v.sections !== undefined) count(Number(v.sections), 'cubby', 'cubbies');
  return [size, ...bits].join(' · ');
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
