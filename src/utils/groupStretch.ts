import * as THREE from 'three';
import type { Dimensions3D, FurnitureObject, LengthUnit } from '../types/furniture';
import { ancestorIds, leavesOf, objectBox, refitGroups, unionBox, type Box } from '../state/groupTree';
import { rotationMatrix, type Face } from './pushPull';
import { snapSize } from './resizeRules';

type Ax = 'x' | 'y' | 'z';
const DIM: Record<Ax, keyof Dimensions3D> = { x: 'length', y: 'height', z: 'width' };
/** Parts at least this share of the group's size along the axis stretch; thinner ones keep size and move. */
export const STRETCH_SHARE = 0.5;
const MIN = 0.25;
const r4 = (n: number) => Math.round(n * 10000) / 10000 || 0;

/** Leaves under the selected roots (groups expand recursively), de-duplicated. */
export function stretchLeaves(objects: FurnitureObject[], rootIds: string[]): FurnitureObject[] {
  const seen = new Map<string, FurnitureObject>();
  for (const id of rootIds) for (const l of leavesOf(objects, id)) seen.set(l.id, l);
  return [...seen.values()];
}

/** Box the stretch works on, or null when it can't (rotated group, scanned room). */
export function stretchBox(objects: FurnitureObject[], rootIds: string[]): Box | null {
  const roots = rootIds.map((id) => objects.find((o) => o.id === id)).filter(Boolean) as FurnitureObject[];
  if (!roots.length) return null;
  if (roots.some((r) => r.shape === 'group' && (r.rotation.x || r.rotation.y || r.rotation.z))) return null;
  const leaves = stretchLeaves(objects, rootIds);
  if (!leaves.length || leaves.some((l) => l.generator === 'room-scan' || l.reference)) return null;
  return unionBox(leaves.map(objectBox));
}

/** Part-local axis that lies along a world axis, or null when the part is turned off-square. */
function localAxisAlong(o: FurnitureObject, a: Ax): Ax | null {
  const w = new THREE.Vector3(a === 'x' ? 1 : 0, a === 'y' ? 1 : 0, a === 'z' ? 1 : 0).applyMatrix4(rotationMatrix(o).invert());
  const k: Ax = Math.abs(w.x) >= Math.abs(w.y) && Math.abs(w.x) >= Math.abs(w.z) ? 'x' : Math.abs(w.y) >= Math.abs(w.z) ? 'y' : 'z';
  return Math.abs(w[k]) > 0.999 ? k : null;
}

/** Total length of the union of intervals inside [lo, hi]. */
function covered(intervals: [number, number][], lo: number, hi: number): number {
  const c = intervals.map(([a, b]) => [Math.max(a, lo), Math.min(b, hi)] as [number, number]).filter(([a, b]) => b > a).sort((p, q) => p[0] - q[0]);
  let total = 0, end = -Infinity;
  for (const [a, b] of c) {
    if (b <= end) continue;
    total += b - Math.max(a, end);
    end = b;
  }
  return total;
}

export interface StretchOptions { snap?: boolean; step?: number; unit?: LengthUnit; floorOn?: boolean }

/**
 * Push/pull a whole group (or multi-selection) on one face of its box: the
 * opposite face stays put. Long parts along that axis (≥ half the group's
 * size) stretch; thin parts (a base board, a shelf) keep their size and move.
 * The extra length is spread over the stretchy gaps only, so parts that sat
 * on each other still touch. Returns the new objects (groups refit).
 */
export function stretchObjects(objects: FurnitureObject[], rootIds: string[], face: Face, newSize: number, opts: StretchOptions = {}): FurnitureObject[] {
  const box = stretchBox(objects, rootIds);
  if (!box) return objects;
  const a = face[1] as Ax, grow = face[0] === '+';
  const lo = box.min[a], hi = box.max[a], S = hi - lo;
  if (S < 1e-6) return objects;
  const leaves = stretchLeaves(objects, rootIds);
  const info = leaves.map((o) => {
    const b = objectBox(o);
    const k = localAxisAlong(o, a);
    const stretch = k !== null && b.max[a] - b.min[a] >= STRETCH_SHARE * S - 1e-6;
    return { o, b, k, stretch };
  });
  const rigid = info.filter((i) => !i.stretch).map((i) => [i.b.min[a], i.b.max[a]] as [number, number]);
  const elastic = S - covered(rigid, lo, hi);

  let size = Math.max(MIN, newSize);
  if (opts.snap) size = snapSize(size, opts.step ?? 0.25, opts.unit ?? 'in', MIN);
  // Stretchy gaps can shrink to 10% at most (keeps every part a real size).
  if (elastic > 1e-6) size = Math.max(size, S - elastic * 0.9);
  // Floor: pulling the bottom down stops at y = 0.
  if (opts.floorOn && a === 'y' && !grow && lo >= -1e-6) size = Math.min(size, hi);
  const delta = size - S;
  if (Math.abs(delta) < 1e-9) return objects;

  const map = elastic > 1e-6
    ? (x: number) => (grow ? x + (delta * (x - lo - covered(rigid, lo, x))) / elastic : x - (delta * (hi - x - covered(rigid, x, hi))) / elastic)
    : (x: number) => (grow ? lo + ((x - lo) * size) / S : hi - ((hi - x) * size) / S);

  const updates = new Map<string, Partial<FurnitureObject>>();
  for (const { o, b, k, stretch } of info) {
    const nMin = map(b.min[a]), nMax = map(b.max[a]);
    if (stretch && k) {
      const len = Math.max(MIN, nMax - nMin);
      updates.set(o.id, {
        dimensions: { ...o.dimensions, [DIM[k]]: r4(len) },
        position: { ...o.position, [a]: r4((nMin + nMax) / 2) },
      });
    } else {
      // Keep size; move with the gaps (centered on its mapped span when no gap is rigid).
      const shift = elastic > 1e-6 ? nMin - b.min[a] : (nMin + nMax) / 2 - (b.min[a] + b.max[a]) / 2;
      if (Math.abs(shift) > 1e-9) updates.set(o.id, { position: { ...o.position, [a]: r4(o.position[a] + shift) } });
    }
  }
  const out = objects.map((o) => (updates.has(o.id) ? { ...o, ...updates.get(o.id) } : o));
  const groups = new Set<string>();
  for (const id of updates.keys()) for (const g of ancestorIds(objects, id)) groups.add(g);
  return refitGroups(out, groups);
}
