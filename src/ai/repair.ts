import { LUMBER_STOCK, SHEET_THICKNESSES, type AiBoard, type AiJoint, type AiSpec, type LumberStock, type SheetMaterial } from './spec.ts';

/**
 * Deterministic clean-up of an AI "boards" design before it becomes parts:
 * real stock sizes, 1/16" grid, square turns, no overlaps, on the floor, no
 * floating boards, joints only between touching boards. Every fix adds one
 * short plain note.
 */

type V3 = [number, number, number];
export interface RepairedBoard {
  name: string;
  stock: LumberStock | 'sheet';
  material: SheetMaterial | 'pine';
  /** World-axis-aligned box after turning (inches). */
  min: V3;
  size: V3;
  /** World axis (0 x, 1 y, 2 z) the board's length runs along. */
  lenAxis: 0 | 1 | 2;
}
export interface Repaired { boards: RepairedBoard[]; joints: AiJoint[]; notes: string[] }

/** Lumber stock lengths top out at 12 ft. */
export const MAX_LUMBER = 144;
const EPS = 1 / 32;
/** Same contact slack the joinery tools use. */
export const TOUCH = 0.06;
const s16 = (n: number) => Math.round(n * 16) / 16 || 0;
const q90 = (deg: number) => ((Math.round(deg / 90) * 90) % 360 + 360) % 360;
/** 1 3/8" style, to the nearest 1/16 (no app imports: the Worker bundles this). */
export function inch(n: number): string {
  const s = Math.round(Math.abs(n) * 16);
  if (s === 0) return '0"';
  const whole = Math.floor(s / 16);
  let num = s % 16, den = 16;
  while (num && num % 2 === 0) { num /= 2; den /= 2; }
  const frac = num ? `${num}/${den}` : '';
  return `${n < 0 ? '-' : ''}${whole && frac ? `${whole} ${frac}` : whole ? whole : frac}"`;
}

/** Integer rotation matrix for XYZ Euler angles in multiples of 90° (three.js order: R = Rx·Ry·Rz). */
function rot90(r: { x: number; y: number; z: number }): number[][] {
  const c = (d: number) => Math.round(Math.cos((d * Math.PI) / 180)), s = (d: number) => Math.round(Math.sin((d * Math.PI) / 180));
  const Rx = [[1, 0, 0], [0, c(r.x), -s(r.x)], [0, s(r.x), c(r.x)]];
  const Ry = [[c(r.y), 0, s(r.y)], [0, 1, 0], [-s(r.y), 0, c(r.y)]];
  const Rz = [[c(r.z), -s(r.z), 0], [s(r.z), c(r.z), 0], [0, 0, 1]];
  const mul = (A: number[][], B: number[][]) => A.map((row) => [0, 1, 2].map((j) => row.reduce((t, a, k) => t + a * B[k][j], 0)));
  return mul(mul(Rx, Ry), Rz);
}

/** World size and length axis of a board with local (length, thickness, width) on (x, y, z). */
export function turnedBox(local: V3, rotation: { x: number; y: number; z: number }): { size: V3; lenAxis: 0 | 1 | 2 } {
  const M = rot90({ x: q90(rotation.x), y: q90(rotation.y), z: q90(rotation.z) });
  const size = [0, 1, 2].map((i) => M[i].reduce((t, m, k) => t + Math.abs(m) * local[k], 0)) as V3;
  const lenAxis = [0, 1, 2].find((i) => M[i][0] !== 0) as 0 | 1 | 2;
  return { size, lenAxis };
}

const nearestThickness = (t: number) => SHEET_THICKNESSES.reduce((best, x) => (Math.abs(x - t) < Math.abs(best - t) ? x : best), SHEET_THICKNESSES[0] as number);

const overlap = (a: RepairedBoard, b: RepairedBoard, k: number) => Math.min(a.min[k] + a.size[k], b.min[k] + b.size[k]) - Math.max(a.min[k], b.min[k]);

/** Face contact: flush (within TOUCH) on one axis and a real shared area on the other two. */
export function touching(a: RepairedBoard, b: RepairedBoard): boolean {
  const o = [0, 1, 2].map((k) => overlap(a, b, k));
  if (o.every((v) => v > EPS)) return true; // still interpenetrating counts as attached
  return [0, 1, 2].some((k) => o[k] >= -TOUCH && o[k] <= EPS && o.every((v, j) => j === k || v > EPS));
}

function sameLocal(b: AiBoard): { local: V3; stock: RepairedBoard['stock']; material: RepairedBoard['material']; notes: string[] } {
  const notes: string[] = [];
  if (b.stock === 'sheet') {
    const t = nearestThickness(b.thickness ?? 0.75);
    if (Math.abs(t - (b.thickness ?? 0.75)) > EPS) notes.push(`thickness:${b.name}:${inch(t)}`);
    return { local: [s16(b.length), t, s16(b.width ?? 12)], stock: 'sheet', material: b.material ?? 'plywood', notes };
  }
  const [t, w] = LUMBER_STOCK[b.stock];
  let L = s16(b.length);
  if (L > MAX_LUMBER) { notes.push(`long:${b.name}`); L = MAX_LUMBER; }
  return { local: [L, t, w], stock: b.stock, material: 'pine', notes };
}

const list = (names: string[]) => {
  const u = [...new Set(names)];
  return u.length <= 3 ? u.join(', ') : `${u.slice(0, 3).join(', ')} and ${u.length - 3} more`;
};
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function repairBoards(spec: Extract<AiSpec, { kind: 'boards' }>): Repaired {
  const notes: string[] = [];
  let squared = 0, snapped = false;
  const thick: string[] = [], long: string[] = [], oversize: string[] = [];
  const boards: RepairedBoard[] = spec.boards.map((b) => {
    const r = b.rotation;
    if ([r.x, r.y, r.z].some((d) => Math.abs(d - Math.round(d / 90) * 90) > 1)) squared++;
    const { local, stock, material, notes: n } = sameLocal(b);
    for (const k of n) (k.startsWith('long:') ? long : thick).push(k.split(':')[1]);
    if (stock === 'sheet') {
      const [L, , W] = local;
      if (Math.max(L, W) > 96 + EPS || Math.min(L, W) > 48 + EPS) oversize.push(b.name);
    }
    const { size, lenAxis } = turnedBox(local, r);
    const min = [s16(b.x), s16(b.y), s16(b.z)] as V3;
    if ([b.x, b.y, b.z].some((v, i) => Math.abs(v - min[i]) > 1e-6) || Math.abs(b.length - local[0]) > 1e-6 && !long.includes(b.name)
      || (b.stock === 'sheet' && Math.abs((b.width ?? 12) - local[2]) > 1e-6)) snapped = true;
    return { name: b.name, stock, material, min, size, lenAxis };
  });
  if (squared) notes.push(`Squared up ${plural(squared, 'turned board')} to 90°.`);
  if (thick.length) notes.push(`Used real sheet thickness (1/4, 1/2 or 3/4") for ${list(thick)}.`);
  if (long.length) notes.push(`Cut ${list(long)} to 12 ft, the longest lumber stock.`);
  if (snapped) notes.push('Rounded sizes and positions to 1/16".');
  if (oversize.length) notes.push(`${list(oversize)} ${oversize.length === 1 ? 'is' : 'are'} bigger than a 4×8 sheet.`);

  // Overlaps: the later board gives way. Trim it along its length when its end runs into the other board, else move it out.
  const fixes: string[] = [];
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (let i = 0; i < boards.length; i++) {
      for (let j = i + 1; j < boards.length; j++) {
        const a = boards[i], b = boards[j];
        const o = [0, 1, 2].map((k) => overlap(a, b, k));
        if (!o.every((v) => v > EPS)) continue;
        const k = [0, 1, 2].reduce((best, x) => (o[x] < o[best] ? x : best), 0);
        const p = o[k];
        const aMax = a.min[k] + a.size[k], bMax = b.min[k] + b.size[k];
        const minInside = b.min[k] >= a.min[k] - EPS && b.min[k] < aMax;
        const maxInside = bMax > a.min[k] && bMax <= aMax + EPS;
        if (k === b.lenAxis && b.size[k] - p >= 1 && (minInside !== maxInside)) {
          if (minInside) b.min[k] = s16(b.min[k] + p);
          b.size[k] = s16(b.size[k] - p);
          fixes.push(`Trimmed ${inch(p)} off ${b.name} so it no longer runs into ${a.name}.`);
        } else {
          const dir = b.min[k] + b.size[k] / 2 >= a.min[k] + a.size[k] / 2 ? 1 : -1;
          const to = s16(dir > 0 ? aMax : a.min[k] - b.size[k]);
          fixes.push(`Moved ${b.name} by ${inch(Math.abs(to - b.min[k]))} so it no longer overlaps ${a.name}.`);
          b.min[k] = to;
        }
        changed = true;
      }
    }
    if (!changed) break;
  }
  if (fixes.length > 3) notes.push(`Fixed ${plural(fixes.length, 'overlap')} between boards.`);
  else notes.push(...fixes);

  // Ground it.
  const lowest = Math.min(...boards.map((b) => b.min[1]));
  if (Math.abs(lowest) > EPS) {
    for (const b of boards) b.min[1] = s16(b.min[1] - lowest);
    notes.push(lowest > 0 ? `Set it on the floor (it was ${inch(lowest)} up).` : `Set it on the floor (it went ${inch(-lowest)} below).`);
  }

  // Drop boards not connected (through touching boards) to one on the floor.
  const keep = new Set<number>();
  const queue = boards.map((b, i) => (b.min[1] <= EPS ? i : -1)).filter((i) => i >= 0);
  for (const i of queue) keep.add(i);
  while (queue.length) {
    const i = queue.shift()!;
    boards.forEach((b, j) => { if (!keep.has(j) && touching(boards[i], b)) { keep.add(j); queue.push(j); } });
  }
  const dropped = boards.filter((_, i) => !keep.has(i)).map((b) => b.name);
  if (dropped.length) notes.push(`Removed ${plural(dropped.length, 'floating board')}: ${list(dropped)}.`);
  const remap = new Map<number, number>();
  const kept: RepairedBoard[] = [];
  boards.forEach((b, i) => { if (keep.has(i)) { remap.set(i, kept.length); kept.push(b); } });

  // Joints: only between kept boards that touch, one per pair.
  const joints: AiJoint[] = [];
  const pairs = new Set<string>();
  let bad = 0;
  for (const j of spec.joints) {
    const a = remap.get(j.a), b = remap.get(j.b);
    if (a === undefined || b === undefined || a === b || !touching(kept[a], kept[b])) { bad++; continue; }
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (pairs.has(key)) continue;
    pairs.add(key);
    joints.push({ type: j.type, a, b });
  }
  if (bad) notes.push(`Skipped ${plural(bad, 'joint')} between boards that don't touch.`);
  return { boards: kept, joints, notes };
}
