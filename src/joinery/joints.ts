import * as THREE from 'three';
import type { FurnitureObject, FurnitureProject, Joint, JointType, LengthUnit } from '../types/furniture';
import { boxCorners } from '../state/groupTree';
import { type Face, faceNormalWorld, pushPull, rotationMatrix } from '../utils/pushPull';
import { formatLength } from '../utils/measure';

type Ax = 'x' | 'y' | 'z';
const AX: Ax[] = ['x', 'y', 'z'];
type Box = { min: Record<Ax, number>; max: Record<Ax, number> };

/** Gap (inches) that still counts as touching. */
export const TOUCH_TOL = 0.06;
export const DOWEL_DIAMETER = 0.375;
export const DOWEL_LENGTH = 1.5;
export const POCKET_DIAMETER = 0.375;
export const DEFAULT_SPACING: Record<'pocket' | 'dowel', number> = { pocket: 6, dowel: 4 };
export const DEFAULT_SCREW_LENGTH = 1.25;
export const dowelDiameter = (j: Pick<Joint, 'diameter'>) => j.diameter ?? DOWEL_DIAMETER;
export const dowelLength = (j: Pick<Joint, 'length'>) => j.length ?? DOWEL_LENGTH;

export const JOINT_TYPES: JointType[] = ['butt', 'dado', 'rabbet', 'pocket', 'dowel'];
export const JOINT_LABEL: Record<JointType, string> = {
  butt: 'Butt', dado: 'Dado', rabbet: 'Rabbet', pocket: 'Pocket screws', dowel: 'Dowels',
};

export const joinable = (o: FurnitureObject | undefined): o is FurnitureObject =>
  Boolean(o && (o.shape === 'board' || o.shape === 'cube') && o.generator !== 'room-scan' && !o.reference && o.visible !== false);

const half = (o: FurnitureObject): Record<Ax, number> => ({ x: o.dimensions.length / 2, y: o.dimensions.height / 2, z: o.dimensions.width / 2 });
const posOf = (o: FurnitureObject) => new THREE.Vector3(o.position.x, o.position.y, o.position.z);
export const toLocal = (o: FurnitureObject, p: THREE.Vector3) => p.clone().sub(posOf(o)).applyMatrix4(rotationMatrix(o).invert());
export const toWorld = (o: FurnitureObject, p: THREE.Vector3) => p.clone().applyMatrix4(rotationMatrix(o)).add(posOf(o));
const dirToLocal = (o: FurnitureObject, d: THREE.Vector3) => d.clone().applyMatrix4(rotationMatrix(o).invert());
const r4 = (n: number) => Math.round(n * 10000) / 10000 || 0;
const dominant = (v: THREE.Vector3): Ax => (Math.abs(v.x) >= Math.abs(v.y) && Math.abs(v.x) >= Math.abs(v.z) ? 'x' : Math.abs(v.y) >= Math.abs(v.z) ? 'y' : 'z');

/** M's bounds in R's frame; null when the parts aren't square to each other. */
export function boundsIn(R: FurnitureObject, M: FurnitureObject): Box | null {
  const pts = boxCorners(M).map((c) => toLocal(R, new THREE.Vector3(c.x, c.y, c.z)));
  const min = { x: Infinity, y: Infinity, z: Infinity }, max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const p of pts) for (const a of AX) { min[a] = Math.min(min[a], p[a]); max[a] = Math.max(max[a], p[a]); }
  const vol = AX.reduce((s, a) => s * (max[a] - min[a]), 1);
  const mv = M.dimensions.length * M.dimensions.width * M.dimensions.height;
  if (vol > mv * 1.02 + 1e-6) return null;
  for (const a of AX) { min[a] = r4(min[a]); max[a] = r4(max[a]); }
  return { min, max };
}

export interface Contact { face: Face; axis: Ax; sign: 1 | -1; gap: number; box: Box }

/** Where M meets a face of R (M may sink up to `slack` into it). */
export function contactOn(R: FurnitureObject, M: FurnitureObject, face?: Face, slack = 0): Contact | null {
  if (!joinable(R) || !joinable(M) || R.id === M.id) return null;
  const b = boundsIn(R, M);
  if (!b) return null;
  const h = half(R);
  let best: Contact | null = null;
  for (const a of AX) for (const sign of [1, -1] as const) {
    const f = `${sign > 0 ? '+' : '-'}${a}` as Face;
    if (face && f !== face) continue;
    const gap = sign > 0 ? b.min[a] - h[a] : -h[a] - b.max[a];
    if (gap > TOUCH_TOL || gap < -(slack + TOUCH_TOL)) continue;
    const out = sign > 0 ? b.max[a] - h[a] : -h[a] - b.min[a];
    if (out < TOUCH_TOL) continue;
    const others = AX.filter((x) => x !== a);
    if (others.some((o) => Math.min(b.max[o], h[o]) - Math.max(b.min[o], -h[o]) < TOUCH_TOL)) continue;
    if (!best || Math.abs(gap) < Math.abs(best.gap)) best = { face: f, axis: a, sign, gap, box: b };
  }
  return best;
}

const coverage = (R: FurnitureObject, c: Contact) => {
  const h = half(R);
  const o = AX.filter((x) => x !== c.axis);
  const area = o.reduce((s, x) => s * (Math.min(c.box.max[x], h[x]) - Math.max(c.box.min[x], -h[x])), 1);
  return area / (4 * h[o[0]] * h[o[1]]);
};

/** Two touching boards: which one takes the cut (the one whose face the other's end/edge meets). */
export function pairContact(A: FurnitureObject | undefined, B: FurnitureObject | undefined): { receiver: FurnitureObject; mater: FurnitureObject; face: Face } | null {
  if (!joinable(A) || !joinable(B)) return null;
  const ab = contactOn(A, B), ba = contactOn(B, A);
  if (ab && ba) {
    const ca = coverage(A, ab), cb = coverage(B, ba);
    const vol = (o: FurnitureObject) => o.dimensions.length * o.dimensions.width * o.dimensions.height;
    const aRec = Math.abs(ca - cb) < 0.02 ? vol(A) >= vol(B) : ca < cb;
    return aRec ? { receiver: A, mater: B, face: ab.face } : { receiver: B, mater: A, face: ba.face };
  }
  if (ab) return { receiver: A, mater: B, face: ab.face };
  if (ba) return { receiver: B, mater: A, face: ba.face };
  return null;
}

/** Thickness of the receiver through the touched face. */
export function receiverThickness(R: FurnitureObject, face: Face): number {
  return half(R)[face[1] as Ax] * 2;
}

/**
 * Dado / rabbet only make sense cut into a board's broad face (the touched face
 * is across its thickness). Boards butted end to end or edge to edge have none.
 */
export function groovable(R: FurnitureObject, face: Face): boolean {
  const h = half(R), a = face[1] as Ax;
  return AX.every((x) => x === a || h[a] <= h[x] + 1e-6);
}

/** 'end' when the receiver is touched on its longest axis, else 'edge'. */
export function buttKind(R: FurnitureObject, face: Face): 'end' | 'edge' {
  const h = half(R), a = face[1] as Ax;
  return AX.every((x) => h[a] >= h[x] - 1e-6) ? 'end' : 'edge';
}

/** 1/4" for 3/4" stock; a third of the thickness otherwise (1/16" steps). */
export function defaultDepth(R: FurnitureObject, face: Face): number {
  return Math.max(0.0625, Math.round((receiverThickness(R, face) / 3) * 16) / 16);
}

export interface JointLayout {
  contact: Contact;
  /** Across the groove / along the groove (receiver-local axes). */
  t: Ax;
  l: Ax;
  width: number;
  tMin: number;
  tMax: number;
  lMin: number;
  lMax: number;
  atEdge: boolean;
  /** From the receiver's end (−t side) to the near side of the groove. */
  offset: number;
}

/**
 * Groove extent across the cut (receiver-local t): the mating board's span, or
 * `width` laid from the edge it sits at (rabbet) / its near side (dado).
 */
export function grooveSpan(j: Pick<Joint, 'width'>, R: FurnitureObject, L: JointLayout): [number, number] {
  if (j.width === undefined || Math.abs(j.width - (L.tMax - L.tMin)) < 1e-6) return [L.tMin, L.tMax];
  const h = half(R)[L.t];
  if (L.tMax >= h - TOUCH_TOL && L.tMin > -h + TOUCH_TOL) return [r4(L.tMax - j.width), L.tMax];
  return [L.tMin, r4(L.tMin + j.width)];
}

export function jointLayout(j: Joint, R: FurnitureObject | undefined, M: FurnitureObject | undefined): JointLayout | null {
  if (!R || !M) return null;
  const c = contactOn(R, M, j.face, Math.max(j.extended, j.depth) + 0.5);
  if (!c) return null;
  const h = half(R);
  const [o0, o1] = AX.filter((x) => x !== c.axis);
  const ext = (x: Ax) => [Math.max(c.box.min[x], -h[x]), Math.min(c.box.max[x], h[x])];
  const e0 = ext(o0), e1 = ext(o1);
  const t = e0[1] - e0[0] <= e1[1] - e1[0] ? o0 : o1;
  const l = t === o0 ? o1 : o0;
  const [tMin, tMax] = ext(t), [lMin, lMax] = ext(l);
  return {
    contact: c, t, l, tMin, tMax, lMin, lMax,
    width: r4(tMax - tMin),
    atEdge: tMin <= -h[t] + TOUCH_TOL || tMax >= h[t] - TOUCH_TOL,
    offset: r4(tMin + h[t]),
  };
}

/** Default distance from each end of a joint line to the first hole. */
export const defaultSetback = (span: number) => Math.min(1.5, span / 4);

/** Evenly spaced spots along a span, inset from the ends (`count` wins over `spacing`). */
export function spots(span: number, spacing: number, setback?: number, count?: number): number[] {
  if (count === 1 || (count === undefined && setback === undefined && span < 2.5)) return [r4(span / 2)];
  const inset = Math.min(setback ?? defaultSetback(span), span / 2);
  const inner = Math.max(0, span - 2 * inset);
  const n = count !== undefined ? Math.max(1, Math.round(count)) : Math.max(2, Math.round(inner / Math.max(1, spacing)) + 1);
  if (n === 1) return [r4(span / 2)];
  return Array.from({ length: n }, (_, i) => r4(inset + (inner * i) / (n - 1)));
}

/** Hole positions along the joint line (distance from its start). */
export function hardwareSpots(j: Joint, L: JointLayout): number[] {
  const spacing = j.spacing ?? DEFAULT_SPACING[j.type === 'dowel' ? 'dowel' : 'pocket'];
  return spots(L.lMax - L.lMin, spacing, j.setback, j.count);
}

export type Cutter =
  | { kind: 'box'; center: [number, number, number]; size: [number, number, number] }
  | { kind: 'cyl'; center: [number, number, number]; axis: [number, number, number]; radius: number; depth: number };

const vec = (o: Partial<Record<Ax, number>>) => new THREE.Vector3(o.x ?? 0, o.y ?? 0, o.z ?? 0);
const arr = (v: THREE.Vector3): [number, number, number] => [r4(v.x), r4(v.y), r4(v.z)];

/** World points on the joint line (pocket screws / dowels). */
function hardwarePoints(j: Joint, R: FurnitureObject, L: JointLayout): THREE.Vector3[] {
  const h = half(R);
  const { axis, sign } = L.contact;
  return hardwareSpots(j, L).map((s) =>
    toWorld(R, vec({ [axis]: sign * h[axis], [L.t]: (L.tMin + L.tMax) / 2, [L.l]: L.lMin + s })));
}

export function hardwareCount(j: Joint, R: FurnitureObject | undefined, M: FurnitureObject | undefined): number {
  if (j.type !== 'pocket' && j.type !== 'dowel') return 0;
  const L = jointLayout(j, R, M);
  return L && R ? hardwarePoints(j, R, L).length : 0;
}

/** Part-local cutters a joint makes in one of its parts. */
export function jointCutters(j: Joint, partId: string, R: FurnitureObject | undefined, M: FurnitureObject | undefined): Cutter[] {
  if (j.type === 'butt' || !R || !M) return [];
  const L = jointLayout(j, R, M);
  if (!L) return [];
  const h = half(R);
  const { axis, sign } = L.contact;
  const out: Cutter[] = [];
  const n = faceNormalWorld(R, j.face); // out of the receiver, into the mating part
  if (j.type === 'dado' || j.type === 'rabbet') {
    if (partId !== R.id) return [];
    const d = Math.max(0.03, j.depth);
    const [g0, g1] = grooveSpan(j, R, L);
    const lo = g0 <= -h[L.t] + TOUCH_TOL ? -h[L.t] - 0.5 : g0;
    const hi = g1 >= h[L.t] - TOUCH_TOL ? h[L.t] + 0.5 : g1;
    const center = vec({ [axis]: sign * (h[axis] - d / 2 + 0.025), [L.t]: (lo + hi) / 2, [L.l]: 0 });
    const size = vec({ [axis]: d + 0.05, [L.t]: hi - lo, [L.l]: h[L.l] * 2 + 1 });
    out.push({ kind: 'box', center: arr(center), size: arr(size) });
    return out;
  }
  const pts = hardwarePoints(j, R, L);
  if (j.type === 'dowel') {
    const len = dowelLength(j), rad = dowelDiameter(j) / 2;
    const rDepth = Math.min(len / 2, h[axis] * 2 * 0.6);
    const mDepth = len - rDepth + 0.125;
    for (const p of pts) {
      if (partId === R.id) {
        const c = toLocal(R, p).add(vec({ [axis]: -sign * (rDepth / 2 - 0.02) }));
        out.push({ kind: 'cyl', center: arr(c), axis: arr(vec({ [axis]: 1 })), radius: rad, depth: rDepth + 0.04 });
      } else {
        const c = toLocal(M, p.clone().addScaledVector(n, mDepth / 2 - 0.02 - j.extended));
        out.push({ kind: 'cyl', center: arr(c), axis: arr(dirToLocal(M, n)), radius: rad, depth: mDepth + 0.04 });
      }
    }
    return out;
  }
  // Pocket screws: angled holes drilled from the mating board's hidden face, ~1" back from the joint.
  if (partId !== M.id) return [];
  const m = dominant(dirToLocal(M, n));
  const hm = half(M);
  const thin = AX.filter((a) => a !== m).reduce((a, b) => (hm[b] < hm[a] ? b : a));
  const wy = (s: number) => toWorld(M, vec({ [thin]: s })).y - M.position.y;
  const side = wy(-1) < wy(1) - 0.1 ? -1 : 1;
  const depth = Math.min(0.5, hm[thin] * 2 * 0.7);
  for (const p of pts) {
    const c = toLocal(M, p.clone().addScaledVector(n, 1));
    c[thin] = side * (hm[thin] - depth / 2 + 0.02);
    out.push({ kind: 'cyl', center: arr(c), axis: arr(vec({ [thin]: 1 })), radius: POCKET_DIAMETER / 2, depth: depth + 0.04 });
  }
  return out;
}

/** All cutters for one part from the project's joints. */
export function partCutters(project: Pick<FurnitureProject, 'objects' | 'joints'>, partId: string): Cutter[] {
  const joints = (project.joints ?? []).filter((j) => j.receiverId === partId || j.materId === partId);
  if (!joints.length) return [];
  const byId = new Map(project.objects.map((o) => [o.id, o]));
  return joints.flatMap((j) => jointCutters(j, partId, byId.get(j.receiverId), byId.get(j.materId)));
}

/** Mating part face that grows into the groove (its side facing the receiver). */
export function extendFace(R: FurnitureObject, M: FurnitureObject, face: Face): Face {
  const nL = dirToLocal(M, faceNormalWorld(R, face));
  const a = dominant(nL);
  return `${nL[a] > 0 ? '-' : '+'}${a}` as Face;
}

/** Lengthen (or shorten, negative) the mating part on its receiver side. */
export function extendMater(R: FurnitureObject, M: FurnitureObject, face: Face, amount: number) {
  return pushPull(M, extendFace(R, M, face), amount, { snap: false, step: 0.25, unit: 'in', floorOn: false, min: 0.05 });
}

const bare = (n: number, unit: LengthUnit) => (unit === 'in' ? formatLength(n, 'in').replace(/ in$/, '') : formatLength(n, unit));
const withMark = (n: number, unit: LengthUnit) => (unit === 'in' ? `${bare(n, unit)}"` : formatLength(n, unit));

/** Short label for a joint as seen from one part, e.g. 'dado 3/4 x 1/4 @ 12"'. */
export function jointNote(j: Joint, partId: string, R: FurnitureObject | undefined, M: FurnitureObject | undefined, unit: LengthUnit): string {
  const L = jointLayout(j, R, M);
  const isR = partId === j.receiverId;
  if (j.type === 'butt') return 'butt joint';
  if (j.type === 'dado' || j.type === 'rabbet') {
    if (!L) return `${j.type} (not touching)`;
    if (!isR) return `into ${j.type} ${withMark(j.depth, unit)}`;
    const size = `${bare(L.width, unit)} x ${bare(j.depth, unit)}`;
    return j.type === 'dado' && !L.atEdge ? `dado ${size} @ ${withMark(L.offset, unit)}` : `${j.type} ${size}`;
  }
  const n = hardwareCount(j, R, M);
  if (j.type === 'pocket') return isR ? `pocket screws ×${n} in` : `pocket holes ×${n}`;
  return `dowels ×${n}`;
}

/** Joint notes per part id (for the cut list). */
export function jointNotes(project: Pick<FurnitureProject, 'objects' | 'joints' | 'unit'>): Map<string, string[]> {
  const byId = new Map(project.objects.map((o) => [o.id, o]));
  const out = new Map<string, string[]>();
  for (const j of project.joints ?? []) {
    const R = byId.get(j.receiverId), M = byId.get(j.materId);
    if (!R || !M) continue;
    for (const id of [j.receiverId, j.materId]) {
      const list = out.get(id) ?? [];
      list.push(jointNote(j, id, R, M, project.unit));
      out.set(id, list);
    }
  }
  return out;
}

export interface HardwareItem { name: string; quantity: number }

/** Screws and dowels the joints need. */
export function jointHardware(project: Pick<FurnitureProject, 'objects' | 'joints'>): HardwareItem[] {
  const byId = new Map(project.objects.map((o) => [o.id, o]));
  const tally = new Map<string, number>();
  const frac = (n: number) => `${formatLength(n, 'in').replace(/ in$/, '')}"`;
  for (const j of project.joints ?? []) {
    const c = hardwareCount(j, byId.get(j.receiverId), byId.get(j.materId));
    if (!c) continue;
    const name = j.type === 'pocket'
      ? `Pocket screws ${frac(j.screwLength ?? DEFAULT_SCREW_LENGTH)}`
      : `Dowels ${frac(dowelDiameter(j))} x ${frac(dowelLength(j))}`;
    tally.set(name, (tally.get(name) ?? 0) + c);
  }
  return [...tally].map(([name, quantity]) => ({ name, quantity })).sort((x, y) => (x.name < y.name ? 1 : -1));
}

/** Joints that involve a part. */
export const jointsOf = (project: Pick<FurnitureProject, 'joints'> | undefined, id: string | null | undefined) =>
  id ? (project?.joints ?? []).filter((j) => j.receiverId === id || j.materId === id) : [];

/** Move a part by `delta` along one of R's local axes; returns its new position. */
export function shiftAlong(R: FurnitureObject, M: FurnitureObject, axis: Ax, delta: number) {
  const d = vec({ [axis]: delta }).applyMatrix4(rotationMatrix(R));
  return { x: r4(M.position.x + d.x), y: r4(M.position.y + d.y), z: r4(M.position.z + d.z) };
}

export interface JointGeometry {
  L: JointLayout;
  /** Receiver thickness through the touched face. */
  rThick: number;
  /** Mating board's thickness across the cut. */
  matThick: number;
  /** Groove extent across the cut (receiver-local) and its width. */
  groove: [number, number];
  grooveWidth: number;
  /** How far the mating board sinks into the receiver. */
  seat: number;
  /** Which edge of the receiver the joint sits at (rabbets), if any. */
  edge: 'start' | 'end' | null;
  /** From the receiver's start edge to the near side of the groove. */
  offset: number;
  /** Receiver length across the cut. */
  span: number;
}

export function jointGeometry(j: Joint, R: FurnitureObject | undefined, M: FurnitureObject | undefined): JointGeometry | null {
  if (!R || !M) return null;
  const L = jointLayout(j, R, M);
  if (!L) return null;
  const h = half(R);
  const groove = grooveSpan(j, R, L);
  const edge = L.tMin <= -h[L.t] + TOUCH_TOL ? 'start' : L.tMax >= h[L.t] - TOUCH_TOL ? 'end' : null;
  return {
    L, rThick: r4(h[L.contact.axis] * 2), matThick: r4(L.contact.box.max[L.t] - L.contact.box.min[L.t]),
    groove, grooveWidth: r4(groove[1] - groove[0]), seat: r4(-L.contact.gap), edge,
    offset: r4(L.tMin + h[L.t]), span: r4(h[L.t] * 2),
  };
}

/** Move the mating board so its near side sits `extended` into the receiver face again (null = can't line it up). */
export function reseatPosition(j: Joint, R: FurnitureObject | undefined, M: FurnitureObject | undefined) {
  if (!R || !M || !joinable(R) || !joinable(M)) return null;
  const b = boundsIn(R, M);
  if (!b) return null;
  const h = half(R), a = j.face[1] as Ax, sign = j.face[0] === '+' ? 1 : -1;
  for (const o of AX.filter((x) => x !== a)) {
    if (Math.min(b.max[o], h[o]) - Math.max(b.min[o], -h[o]) < TOUCH_TOL) return null;
  }
  const near = sign > 0 ? b.min[a] : b.max[a];
  const target = sign * h[a] - sign * j.extended;
  return shiftAlong(R, M, a, target - near);
}

/** Mirror the mating board to the other edge of the receiver (rabbet: which edge). */
export function otherEdgePosition(j: Joint, R: FurnitureObject | undefined, M: FurnitureObject | undefined) {
  const g = jointGeometry(j, R, M);
  if (!g || !R || !M) return null;
  return shiftAlong(R, M, g.L.t, -(g.L.tMin + g.L.tMax));
}

/** Where a joint's tag sits (world) and the cut region to highlight (receiver-local box). */
export function jointMarker(j: Joint, R: FurnitureObject | undefined, M: FurnitureObject | undefined) {
  const g = jointGeometry(j, R, M);
  if (!g || !R) return null;
  const { axis, sign } = g.L.contact;
  const h = half(R);
  const grooved = j.type === 'dado' || j.type === 'rabbet';
  const [t0, t1] = grooved ? g.groove : [g.L.tMin, g.L.tMax];
  const deep = grooved ? Math.max(0.03, j.depth) : 0.04;
  const center = vec({ [axis]: sign * (h[axis] - deep / 2 + 0.01), [g.L.t]: (t0 + t1) / 2, [g.L.l]: (g.L.lMin + g.L.lMax) / 2 });
  const size = vec({ [axis]: deep + 0.04, [g.L.t]: Math.max(0.05, t1 - t0) + 0.04, [g.L.l]: g.L.lMax - g.L.lMin + 0.04 });
  const anchor = toWorld(R, vec({ [axis]: sign * (h[axis] + 0.05), [g.L.t]: (t0 + t1) / 2, [g.L.l]: (g.L.lMin + g.L.lMax) / 2 }));
  return { anchor, center, size };
}
