import * as THREE from 'three';
import type { FurnitureObject } from '../types/furniture';
import { moveSet, objectBox, unionBox } from '../state/groupTree';
import { FLOOR_REST_TOL } from './resizeRules';

export type TurnAxis = 'x' | 'y' | 'z';

const AXIS_VEC: Record<TurnAxis, THREE.Vector3> = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
};

/** Degrees in (-180, 180], snapped onto exact multiples of 90 when within float drift, no -0. */
export function cleanDegrees(d: number): number {
  let v = ((d % 360) + 360) % 360;
  if (v > 180) v -= 360;
  const q = Math.round(v / 90) * 90;
  if (Math.abs(v - q) < 0.01) v = q;
  else v = Math.round(v * 1e6) / 1e6;
  if (v === -180) v = 180;
  return v === 0 ? 0 : v;
}

/** Of the two equivalent XYZ Euler triples, keep the one with fewer / smaller angles (180° Y stays 0,180,0). */
function simplestEuler(x: number, y: number, z: number) {
  const a = { x: cleanDegrees(x), y: cleanDegrees(y), z: cleanDegrees(z) };
  const b = { x: cleanDegrees(x + 180), y: cleanDegrees(180 - y), z: cleanDegrees(z + 180) };
  const cost = (r: typeof a) => [r.x, r.y, r.z].filter((v) => v !== 0).length * 1000 + Math.abs(r.x) + Math.abs(r.y) + Math.abs(r.z);
  return cost(b) < cost(a) ? b : a;
}

const round4 = (n: number) => { const r = Math.round(n * 1e4) / 1e4; return r === 0 ? 0 : r; };
const isGroup = (o: FurnitureObject) => o.shape === 'group';
const rotated = (o: FurnitureObject) => !!(o.rotation.x || o.rotation.y || o.rotation.z);

/**
 * Turn the selected objects (and everything inside selected groups) by
 * `sign`×90° about a world axis through the selection's center. Plain
 * (unrotated) group boxes stay axis-aligned; the caller refits them.
 * With the floor on, parts resting on the floor stay resting and nothing
 * ends below y = 0.
 */
export function turnObjects(
  objects: FurnitureObject[],
  ids: string[],
  axis: TurnAxis,
  opts: { floorOn: boolean; sign?: 1 | -1 } = { floorOn: true },
): FurnitureObject[] {
  const moving = new Set<string>();
  for (const id of ids) {
    const o = objects.find((x) => x.id === id);
    if (!o || o.generator === 'room-scan') continue;
    for (const m of moveSet(objects, id)) moving.add(m);
  }
  const leaves = objects.filter((o) => moving.has(o.id) && !isGroup(o));
  const box = unionBox(leaves.map(objectBox));
  if (!box) return objects;
  const center = new THREE.Vector3((box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, (box.min.z + box.max.z) / 2);
  const qTurn = new THREE.Quaternion().setFromAxisAngle(AXIS_VEC[axis], (opts.sign ?? 1) * Math.PI / 2);
  const rad = Math.PI / 180;

  let out = objects.map((o) => {
    if (!moving.has(o.id)) return o;
    const p = new THREE.Vector3(o.position.x, o.position.y, o.position.z).sub(center).applyQuaternion(qTurn).add(center);
    let rotation = o.rotation;
    if (!isGroup(o) || rotated(o)) {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(o.rotation.x * rad, o.rotation.y * rad, o.rotation.z * rad, 'XYZ'));
      const e = new THREE.Euler().setFromQuaternion(qTurn.clone().multiply(q), 'XYZ');
      rotation = simplestEuler(e.x / rad, e.y / rad, e.z / rad);
    }
    return { ...o, position: { x: p.x, y: p.y, z: p.z }, rotation };
  });

  if (opts.floorOn) {
    const after = out.filter((o) => moving.has(o.id) && !isGroup(o));
    const before = box.min.y;
    const now = unionBox(after.map(objectBox))!.min.y;
    // Resting stays resting; otherwise only lift if it would dip below the floor.
    const target = before <= FLOOR_REST_TOL ? Math.max(0, before) : Math.max(now, 0);
    const dy = target - now;
    if (Math.abs(dy) > 1e-9) out = out.map((o) => (moving.has(o.id) ? { ...o, position: { ...o.position, y: o.position.y + dy } } : o));
  }
  return out.map((o) => (moving.has(o.id) ? { ...o, position: { x: round4(o.position.x), y: round4(o.position.y), z: round4(o.position.z) } } : o));
}

/** Groups whose boxes need refitting after a turn: moved plain groups and parents of the selection. */
export function groupsToRefit(objects: FurnitureObject[], ids: string[]): string[] {
  const out = new Set<string>();
  for (const id of ids) {
    const o = objects.find((x) => x.id === id);
    if (o?.parentId) out.add(o.parentId);
    for (const m of moveSet(objects, id)) {
      const g = objects.find((x) => x.id === m);
      if (g && isGroup(g)) out.add(g.id);
    }
  }
  return [...out];
}
