/**
 * Find the opening a drawer or door should fill from the current selection:
 * a template cabinet (its inside), or two parts with a gap between them.
 * Pure.
 */
import * as THREE from 'three';
import type { BuiltInTemplateId, FurnitureObject } from '../types/furniture';
import { buildModule, normalizeModuleInput, type ModuleId } from '../generators/modules';
import { toWorld } from '../joinery/joints';

export interface Opening {
  width: number; height: number; depth: number;
  /** World point at the opening's front-bottom-center, and the yaw (degrees) of its frame. */
  origin: { x: number; y: number; z: number };
  yaw: number;
  /** Thickness of the parts around it (sets the overlay). */
  sideT: number;
  label: string;
  material?: string;
  /** A template cabinet: its group and inputs (doors/shelves it already has). */
  host?: { groupId: string; template: BuiltInTemplateId; input: Record<string, number | string>; wallId?: string; center?: number };
}

const CABINETS: ModuleId[] = ['base-cabinet', 'upper-cabinet', 'bookshelf'];
const STILE = 1.5;
const r4 = (n: number) => Math.round(n * 10000) / 10000 || 0;
const DEG = 180 / Math.PI;

function rootGroup(objects: FurnitureObject[], o: FurnitureObject | undefined, test: (g: FurnitureObject) => boolean) {
  let cur = o;
  while (cur) {
    if (cur.shape === 'group' && test(cur)) return cur;
    cur = cur.parentId ? objects.find((x) => x.id === cur!.parentId) : undefined;
  }
  return undefined;
}

/** Inside of a template cabinet, in its own module coords (x centered, y from the floor, z from the back). */
export function cabinetOpening(id: ModuleId, raw: Record<string, number | string>) {
  const v = normalizeModuleInput(id, raw);
  const W = Number(v.width), H = Number(v.height), D = Number(v.depth), T = Number(v.thickness);
  const framed = v.faceFrame === 'yes';
  const zf = v.back === 'none' ? 0 : 0.25;
  const base = id === 'upper-cabinet' ? Number(v.elevation) : Number(v.toeKick);
  const top = id === 'upper-cabinet' ? base + H : H;
  const inner = framed ? STILE : T;
  const y0 = base + inner, y1 = top - inner;
  const front = D + (framed ? T : 0);
  return {
    width: r4(W - 2 * inner), height: r4(y1 - y0), depth: r4(front - zf),
    front: { x: 0, y: y0, z: front },
    // Framed: 1/2" overlay on the frame.
    sideT: framed ? 0.5625 : T,
    material: String(v.material),
  };
}

function yawFrom(xAxis: THREE.Vector3) { return Math.atan2(-xAxis.z, xAxis.x); }

function fromCabinet(objects: FurnitureObject[], g: FurnitureObject): Opening | null {
  const bi = g.builtIn!;
  const id = bi.template as ModuleId;
  const { wallWidth: _w, ...input } = bi.input;
  void _w;
  const local = buildModule(id, input).parts;
  const placed = objects.filter((o) => o.builtInId === bi.id);
  const find = (name: string) => ({ l: local.find((p) => p.name === name), w: placed.find((p) => p.name === name) });
  const L = find('Side L'), R = find('Side R');
  if (!L.l || !L.w || !R.l || !R.w) return null;
  const pl = new THREE.Vector3(L.w.position.x, L.w.position.y, L.w.position.z);
  const pr = new THREE.Vector3(R.w.position.x, R.w.position.y, R.w.position.z);
  const xAxis = pr.clone().sub(pl).setY(0);
  if (xAxis.lengthSq() < 1e-6) return null;
  const yaw = yawFrom(xAxis.normalize());
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  const origin = pl.clone().sub(new THREE.Vector3(L.l.position.x, L.l.position.y, L.l.position.z).applyQuaternion(q));
  const o = cabinetOpening(id, input);
  const front = new THREE.Vector3(o.front.x, o.front.y, o.front.z).applyQuaternion(q).add(origin);
  return {
    width: o.width, height: o.height, depth: o.depth, sideT: o.sideT, material: o.material,
    origin: { x: r4(front.x), y: r4(front.y), z: r4(front.z) }, yaw: r4(yaw * DEG),
    label: g.name,
    host: { groupId: g.id, template: bi.template, input: { ...bi.input }, wallId: bi.wallId, center: bi.center },
  };
}

function boxIn(o: FurnitureObject, inv: THREE.Quaternion) {
  const d = o.dimensions;
  const min = new THREE.Vector3(Infinity, Infinity, Infinity), max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const p = toWorld(o, new THREE.Vector3((sx * d.length) / 2, (sy * d.height) / 2, (sz * d.width) / 2)).applyQuaternion(inv);
    min.min(p); max.max(p);
  }
  return { min, max };
}

/** The gap between two parts (side by side, or one above the other). */
export function openingBetween(a: FurnitureObject, b: FurnitureObject, yawDeg = a.rotation.y): Opening | null {
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yawDeg / DEG);
  const inv = q.clone().invert();
  const A = boxIn(a, inv), B = boxIn(b, inv);
  const overlap = (k: 'x' | 'y' | 'z') => [Math.max(A.min[k], B.min[k]), Math.min(A.max[k], B.max[k])] as const;
  const gap = (k: 'x' | 'y') => {
    if (A.max[k] <= B.min[k] + 1e-6) return [A.max[k], B.min[k]] as const;
    if (B.max[k] <= A.min[k] + 1e-6) return [B.max[k], A.min[k]] as const;
    return null;
  };
  const [z0, z1] = overlap('z');
  if (z1 - z0 < 1) return null;
  const gx = gap('x'), gy = gap('y');
  let x0: number, x1: number, y0: number, y1: number, t: number;
  if (gx && gx[1] - gx[0] >= 1) {
    [x0, x1] = gx; [y0, y1] = overlap('y');
    t = Math.min(A.max.x - A.min.x, B.max.x - B.min.x);
  } else if (gy && gy[1] - gy[0] >= 1) {
    [y0, y1] = gy; [x0, x1] = overlap('x');
    t = Math.min(A.max.y - A.min.y, B.max.y - B.min.y);
  } else return null;
  if (x1 - x0 < 1 || y1 - y0 < 1) return null;
  const front = new THREE.Vector3((x0 + x1) / 2, y0, z1).applyQuaternion(q);
  return {
    width: r4(x1 - x0), height: r4(y1 - y0), depth: r4(z1 - z0), sideT: r4(Math.min(1.5, t)),
    origin: { x: r4(front.x), y: r4(front.y), z: r4(front.z) }, yaw: r4(yawDeg),
    label: `Between ${a.name} and ${b.name}`, material: a.material.species,
  };
}

/** Opening for the selection, or null (the fitting is added free-standing). */
export function detectOpening(objects: FurnitureObject[], selectedIds: string[]): Opening | null {
  const sel = selectedIds.map((id) => objects.find((o) => o.id === id)).filter((o): o is FurnitureObject => !!o);
  if (sel.length === 2 && sel.every((o) => o.shape !== 'group')) {
    const g = rootGroup(objects, sel[0], (x) => !x.parentId);
    return openingBetween(sel[0], sel[1], g?.rotation.y ?? sel[0].rotation.y);
  }
  if (sel.length === 1) {
    const g = rootGroup(objects, sel[0], (x) => !!x.builtIn && CABINETS.includes(x.builtIn.template as ModuleId));
    if (g) return fromCabinet(objects, g);
  }
  return null;
}

/** What adding into this cabinet changes on it (its own doors/drawers, and shelves for drawers). */
export function hostChanges(o: Opening, kind: 'drawers' | 'door'): { patch: Record<string, number | string>; words: string[] } | null {
  if (!o.host) return null;
  const v = o.host.input;
  const patch: Record<string, number | string> = {};
  const words: string[] = [];
  if (v.doors !== undefined && v.doors !== 'none') { patch.doors = 'none'; words.push('doors'); }
  if (Number(v.drawers ?? 0) > 0) { patch.drawers = 0; words.push('drawers'); }
  if (kind === 'drawers' && Number(v.shelves ?? 0) > 0) { patch.shelves = 0; words.push(Number(v.shelves) === 1 ? 'shelf' : 'shelves'); }
  return words.length ? { patch, words } : null;
}

/** Input to start the form with for this opening. */
export function openingInput(o: Opening, kind: 'drawers' | 'door'): Record<string, number | string> {
  const out: Record<string, number | string> = { width: o.width, height: o.height, sideT: o.sideT };
  if (kind === 'drawers') out.depth = o.depth;
  if (o.material) out.material = o.material;
  if (kind === 'door' && o.width > 24) out.doors = '2';
  return out;
}
