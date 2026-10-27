import type { BoardHole, FurnitureObject, FurnitureProject, Joint, LengthUnit } from '../types/furniture';
import { cutListWithParts, type CutListItem } from '../utils/exportUtils';
import { jointCutters, jointLayout, hardwareCount, dowelDiameter, dowelLength, POCKET_DIAMETER, JOINT_LABEL, type Cutter } from '../joinery/joints';
import { faceAxes, faceThickness, footprint, getHoles, inferHoleAnchor, supportsHoles } from '../utils/holes';
import { dim } from './format';
import { isBoxy } from './geometry';

type Ax = 'x' | 'y' | 'z';
const AX: Ax[] = ['x', 'y', 'z'];
type V3 = Record<Ax, number>;

/** One unique part (a cut list row): its number on the plans and every part it covers. */
export interface PartGroup {
  no: number;
  item: CutListItem;
  parts: FurnitureObject[];
}

/** Unique parts, numbered in cut list order (identical parts share a number and a quantity). */
export function groupParts(project: FurnitureProject): PartGroup[] {
  const byId = new Map(project.objects.map((o) => [o.id, o]));
  return cutListWithParts(project).map(({ partIds, ...item }, i) => {
    const parts = partIds.map((id) => byId.get(id)).filter((o): o is FurnitureObject => !!o);
    return { no: i + 1, item: { ...item, name: groupName(parts.map((p) => p.name), item.name) }, parts };
  });
}

/**
 * One name for identical parts: 'Shelf 1'…'Shelf 4' → 'Shelf', 'Side L' and
 * 'Side R' → 'Side'. Falls back to the first name when they differ more.
 */
export function groupName(names: string[], fallback = names[0] ?? 'Part'): string {
  const uniq = [...new Set(names.map((n) => n.trim()))];
  if (uniq.length <= 1) return uniq[0] || fallback;
  const strip = (n: string) => n.replace(/\s+(?:[LR]|left|right|\d+|[A-Z])$/i, '').trim();
  const base = [...new Set(uniq.map(strip))];
  return base.length === 1 && base[0] ? base[0] : fallback;
}

/** Part number for each part id. */
export function partNumbers(groups: PartGroup[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const g of groups) for (const p of g.parts) out.set(p.id, g.no);
  return out;
}

export type Edge = 'left' | 'right' | 'bottom' | 'top';
export type Side = 'near' | 'far' | 'through' | 'edge';

export type Element =
  | { shape: 'rect'; u0: number; u1: number; v0: number; v1: number; side: Side; depth: number }
  | { shape: 'circle'; u: number; v: number; r: number; side: Side; depth: number };

/** A dimension from a part edge to a feature (its near side, or a hole's center). */
export interface DimSpec { axis: 'u' | 'v'; from: Edge | 'center'; value: number; at: number }

export interface FaceFeature {
  letter: string;
  label: string;
  detail: string;
  elements: Element[];
  dims: DimSpec[];
  /** One line for the feature list: what, size, and where from the edges. */
  text: string;
}

export interface FaceDrawing {
  /** Face size: u across (the part's length, along the grain), v up. */
  u: number;
  v: number;
  thickness: number;
  features: FaceFeature[];
  /** Joints that don't cut this part (butt joints, the board that sits in a dado). */
  notes: string[];
  /** The part is not a box (round parts): no face features. */
  round: boolean;
}

const EPS = 0.03;
const r4 = (n: number) => Math.round(n * 10000) / 10000 || 0;
const half = (o: FurnitureObject): V3 => ({ x: o.dimensions.length / 2, y: o.dimensions.height / 2, z: o.dimensions.width / 2 });

type Local =
  | { kind: 'box'; min: V3; max: V3 }
  | { kind: 'cyl'; center: V3; axis: Ax; r: number; depth: number };

const axisOf = (v: [number, number, number]): Ax => {
  const a = v.map(Math.abs);
  return a[0] >= a[1] && a[0] >= a[2] ? 'x' : a[1] >= a[2] ? 'y' : 'z';
};

function fromCutter(c: Cutter, h: V3): Local | null {
  if (c.kind === 'box') {
    const min = {} as V3, max = {} as V3;
    AX.forEach((a, i) => { min[a] = r4(Math.max(-h[a], c.center[i] - c.size[i] / 2)); max[a] = r4(Math.min(h[a], c.center[i] + c.size[i] / 2)); });
    if (AX.some((a) => max[a] - min[a] < 1e-4)) return null;
    return { kind: 'box', min, max };
  }
  const axis = axisOf(c.axis);
  return { kind: 'cyl', center: { x: c.center[0], y: c.center[1], z: c.center[2] }, axis, r: c.radius, depth: c.depth };
}

/** A hole / slot / notch as a part-local solid. */
function fromHole(o: FurnitureObject, hole: BoardHole): Local {
  const d = o.dimensions;
  const face = hole.face ?? 'top';
  const { u, v, n } = faceAxes(face);
  const thick = faceThickness(d, face);
  const depth = hole.depth === undefined || hole.depth >= thick ? thick : Math.max(0.05, hole.depth);
  const f = footprint(hole);
  const toV3 = (vec: { x: number; y: number; z: number }): V3 => ({ x: vec.x, y: vec.y, z: vec.z });
  const surf = toV3(n.clone().multiplyScalar(thick / 2).addScaledVector(u, f.cu).addScaledVector(v, f.cv));
  const nAx = axisOf([n.x, n.y, n.z]);
  if ((hole.kind ?? 'round') === 'round') {
    const center = { ...surf, [nAx]: surf[nAx] - depth / 2 } as V3;
    return { kind: 'cyl', center, axis: nAx, r: f.wu / 2, depth };
  }
  const uAx = axisOf([u.x, u.y, u.z]), vAx = axisOf([v.x, v.y, v.z]);
  const min = {} as V3, max = {} as V3;
  min[uAx] = surf[uAx] - f.wu / 2; max[uAx] = surf[uAx] + f.wu / 2;
  min[vAx] = surf[vAx] - f.wv / 2; max[vAx] = surf[vAx] + f.wv / 2;
  min[nAx] = surf[nAx] - depth; max[nAx] = surf[nAx];
  const h = half(o);
  for (const a of AX) { min[a] = Math.max(-h[a], min[a]); max[a] = Math.min(h[a], max[a]); }
  return { kind: 'box', min, max };
}

/** The face frame: u = longest local axis, v = middle, n = thinnest; viewed from `s` (+1/−1) along n. */
export interface Frame { U: Ax; V: Ax; N: Ax; s: 1 | -1; flipV: boolean; h: V3 }

export function faceFrame(o: FurnitureObject, nearScore: (N: Ax, s: 1 | -1) => number = () => 0): Frame {
  const h = half(o);
  const [U, V, N] = [...AX].sort((a, b) => h[b] - h[a] || AX.indexOf(a) - AX.indexOf(b));
  const s: 1 | -1 = nearScore(N, -1) > nearScore(N, 1) ? -1 : 1;
  // Right-handed on paper: U × V must point at the viewer (s·N).
  const idx = (a: Ax) => AX.indexOf(a);
  const k = (idx(V) - idx(U) + 3) % 3 === 1 ? 1 : -1; // U × V = k·N (x×y=z, y×z=x, z×x=y)
  return { U, V, N, s, flipV: k * s < 0, h };
}

const toU = (f: Frame, val: number) => val + f.h[f.U];
const toV = (f: Frame, val: number) => (f.flipV ? -val : val) + f.h[f.V];

function sideOf(f: Frame, lo: number, hi: number): Side {
  const hN = f.h[f.N];
  const plus = hi >= hN - EPS, minus = lo <= -hN + EPS;
  const near = f.s > 0 ? plus : minus, far = f.s > 0 ? minus : plus;
  return near && far ? 'through' : near ? 'near' : far ? 'far' : 'edge';
}

function toElement(f: Frame, l: Local): Element {
  if (l.kind === 'box') {
    const a = toV(f, l.min[f.V]), b = toV(f, l.max[f.V]);
    return {
      shape: 'rect', u0: r4(toU(f, l.min[f.U])), u1: r4(toU(f, l.max[f.U])), v0: r4(Math.min(a, b)), v1: r4(Math.max(a, b)),
      side: sideOf(f, l.min[f.N], l.max[f.N]), depth: r4(l.max[f.N] - l.min[f.N]),
    };
  }
  if (l.axis === f.N) {
    return { shape: 'circle', u: r4(toU(f, l.center[f.U])), v: r4(toV(f, l.center[f.V])), r: l.r, side: sideOf(f, l.center[f.N] - l.depth / 2, l.center[f.N] + l.depth / 2), depth: r4(l.depth) };
  }
  // Bored from an edge: shows as a hidden rectangle running in from that edge.
  const min = { ...l.center }, max = { ...l.center };
  for (const a of AX) {
    const ext = a === l.axis ? l.depth / 2 : l.r;
    min[a] = Math.max(-f.h[a], l.center[a] - ext); max[a] = Math.min(f.h[a], l.center[a] + ext);
  }
  const e = toElement(f, { kind: 'box', min, max }) as Extract<Element, { shape: 'rect' }>;
  return { ...e, side: 'edge', depth: r4(Math.min(l.depth, max[l.axis] - min[l.axis])) };
}

const EDGE: Record<'u' | 'v', [Edge, Edge]> = { u: ['left', 'right'], v: ['bottom', 'top'] };

/** Dimensions locating one element from the part's edges (nearest edge unless an anchor says otherwise). */
export function elementDims(e: Element, size: { u: number; v: number }, prefer?: { u?: 'min' | 'max' | 'center'; v?: 'min' | 'max' | 'center' }): DimSpec[] {
  const out: DimSpec[] = [];
  for (const axis of ['u', 'v'] as const) {
    const span = size[axis];
    const [eMin, eMax] = EDGE[axis];
    if (e.shape === 'circle') {
      const c = e[axis];
      const p = prefer?.[axis];
      if (p === 'center' || (!p && Math.abs(c - span / 2) < 1e-3)) { out.push({ axis, from: 'center', value: 0, at: c }); continue; }
      const fromMin = p ? p === 'min' : c <= span / 2;
      out.push({ axis, from: fromMin ? eMin : eMax, value: r4(fromMin ? c : span - c), at: c });
      continue;
    }
    const lo = axis === 'u' ? e.u0 : e.v0, hi = axis === 'u' ? e.u1 : e.v1;
    const atMin = lo <= EPS, atMax = hi >= span - EPS;
    if (atMin && atMax) continue; // runs the full length
    if (atMin) { out.push({ axis, from: eMin, value: r4(hi), at: hi }); continue; }
    if (atMax) { out.push({ axis, from: eMax, value: r4(span - lo), at: lo }); continue; }
    const p = prefer?.[axis];
    const fromMin = p ? p !== 'max' : lo <= span - hi;
    out.push(fromMin ? { axis, from: eMin, value: r4(lo), at: lo } : { axis, from: eMax, value: r4(span - hi), at: hi });
  }
  return out;
}

const letterOf = (i: number) => (i < 26 ? String.fromCharCode(65 + i) : `A${String.fromCharCode(65 + (i - 26))}`);

export function locationText(dims: DimSpec[], unit: LengthUnit): string {
  const parts: string[] = [];
  for (const axis of ['u', 'v'] as const) {
    const list = dims.filter((d) => d.axis === axis);
    if (!list.length) continue;
    if (list.every((d) => d.from === 'center')) { parts.push(axis === 'u' ? 'centered across' : 'centered up'); continue; }
    // Group by the edge measured from: '14 3/8", 15 5/8" from right'.
    const byFrom = new Map<string, number[]>();
    for (const d of list) {
      const vals = byFrom.get(d.from) ?? [];
      if (!vals.some((v) => Math.abs(v - d.value) < 1e-3)) vals.push(d.value);
      byFrom.set(d.from, vals);
    }
    const bits = [...byFrom].map(([from, vals]) => from === 'center' ? 'centered' : `${vals.sort((a, b) => a - b).map((v) => dim(v, unit)).join(', ')} from ${from}`);
    parts.push(bits.join(', '));
  }
  return parts.join(' · ');
}

/** Multi-hole rows (pocket screws, dowels) measure along the row from one edge. */
function rowDims(elements: Element[], size: { u: number; v: number }): DimSpec[] {
  if (elements.length === 1) return elementDims(elements[0], size);
  const cs = elements.map((e) => (e.shape === 'circle' ? { u: e.u, v: e.v } : { u: (e.u0 + e.u1) / 2, v: (e.v0 + e.v1) / 2 }));
  const spreadU = Math.max(...cs.map((c) => c.u)) - Math.min(...cs.map((c) => c.u));
  const spreadV = Math.max(...cs.map((c) => c.v)) - Math.min(...cs.map((c) => c.v));
  const along: 'u' | 'v' = spreadU >= spreadV ? 'u' : 'v';
  const across: 'u' | 'v' = along === 'u' ? 'v' : 'u';
  const out: DimSpec[] = [];
  const first = elementDims(elements[0], size).filter((d) => d.axis === across);
  out.push(...first);
  const [eMin] = EDGE[along];
  for (const c of [...cs].sort((a, b) => a[along] - b[along])) out.push({ axis: along, from: eMin, value: r4(c[along]), at: c[along] });
  return out;
}

function holeLabel(h: BoardHole, unit: LengthUnit, thick: number): { label: string; detail: string } {
  const kind = h.kind ?? 'round';
  const deep = h.depth === undefined || h.depth >= thick - 1e-6 ? 'through' : `${dim(h.depth, unit)} deep`;
  if (kind === 'notch') return { label: 'Notch', detail: `${dim(h.diameter, unit)} wide × ${dim(h.height ?? h.diameter / 2, unit)} in, ${deep}` };
  if (kind === 'rect') return { label: 'Cutout', detail: `${dim(h.diameter, unit)} × ${dim(h.height ?? h.diameter, unit)}, ${deep}` };
  return { label: 'Hole', detail: `Ø ${dim(h.diameter, unit)}, ${deep}` };
}

const FASTEN: Record<string, string> = { glue: 'glued', screws: 'screwed', 'glue-screws': 'glued and screwed', none: 'dry' };

/**
 * The part's broad face as a shop drawing: every joint cut and hole on it as a
 * rectangle or circle, each located from the part's edges. Hole offsets keep
 * the edge they're anchored to; joints measure from the nearest edge.
 */
export function faceDrawing(project: Pick<FurnitureProject, 'objects' | 'joints' | 'unit'>, o: FurnitureObject): FaceDrawing {
  const unit = project.unit;
  const byId = new Map(project.objects.map((p) => [p.id, p]));
  const h = half(o);
  if (!isBoxy(o)) {
    return { u: Math.max(o.dimensions.length, o.dimensions.width), v: o.dimensions.height, thickness: Math.min(o.dimensions.length, o.dimensions.width), features: [], notes: [], round: true };
  }
  type Raw = { label: string; detail: string; locals: Local[]; prefer?: (f: Frame) => { u?: 'min' | 'max' | 'center'; v?: 'min' | 'max' | 'center' } };
  const raws: Raw[] = [];
  const notes: string[] = [];
  const joints: Joint[] = (project.joints ?? []).filter((j) => j.receiverId === o.id || j.materId === o.id);
  for (const j of joints) {
    const R = byId.get(j.receiverId), M = byId.get(j.materId);
    if (!R || !M) continue;
    const other = j.receiverId === o.id ? M : R;
    const cutters = jointCutters(j, o.id, R, M).map((c) => fromCutter(c, h)).filter((l): l is Local => !!l);
    const L = jointLayout(j, R, M);
    if (j.type === 'butt') { notes.push(`Butt joint with ${other.name} (${FASTEN[j.fasten ?? 'glue'] ?? 'glued'})`); continue; }
    if (j.type === 'dado' || j.type === 'rabbet') {
      if (j.receiverId !== o.id) { notes.push(`Sits ${dim(j.depth, unit)} into a ${j.type} in ${other.name}`); continue; }
      if (!cutters.length) continue;
      const wide = L ? (j.width ?? L.width) : 0;
      raws.push({ label: `${JOINT_LABEL[j.type]} for ${other.name}`, detail: `${dim(wide, unit)} wide × ${dim(j.depth, unit)} deep`, locals: cutters });
      continue;
    }
    const n = hardwareCount(j, R, M);
    if (j.type === 'pocket') {
      if (!cutters.length) { notes.push(`Takes ${n} pocket screw${n === 1 ? '' : 's'} from ${other.name}`); continue; }
      raws.push({ label: `Pocket holes ×${n} to ${other.name}`, detail: `Ø ${dim(POCKET_DIAMETER, unit)}, on the hidden face`, locals: cutters });
      continue;
    }
    if (cutters.length) raws.push({ label: `Dowel holes ×${n} to ${other.name}`, detail: `Ø ${dim(dowelDiameter(j), unit)} dowels × ${dim(dowelLength(j), unit)}`, locals: cutters });
  }
  if (supportsHoles(o.shape)) {
    for (const hole of getHoles(o)) {
      const { label, detail } = holeLabel(hole, unit, faceThickness(o.dimensions, hole.face));
      const anchor = hole.anchor ?? inferHoleAnchor(o.dimensions, hole);
      const ax = faceAxes(hole.face);
      raws.push({
        label, detail, locals: [fromHole(o, hole)],
        prefer: (f) => {
          const out: { u?: 'min' | 'max' | 'center'; v?: 'min' | 'max' | 'center' } = {};
          for (const [vec, a] of [[ax.u, anchor.u], [ax.v, anchor.v]] as const) {
            const comp = { x: vec.x, y: vec.y, z: vec.z };
            const sgnU = comp[f.U], sgnV = comp[f.V] * (f.flipV ? -1 : 1);
            const key = Math.abs(sgnU) > 0.5 ? 'u' : Math.abs(sgnV) > 0.5 ? 'v' : null;
            if (!key) continue;
            const sgn = key === 'u' ? sgnU : sgnV;
            out[key] = a === 'center' ? 'center' : (a === 'start') === (sgn > 0) ? 'min' : 'max';
          }
          return out;
        },
      });
    }
  }
  // View from the face that carries the most cuts.
  const score = (N: Ax, s: 1 | -1) => raws.reduce((n, r) => n + r.locals.filter((l) => {
    const [lo, hi] = l.kind === 'box' ? [l.min[N], l.max[N]] : l.axis === N ? [l.center[N] - l.depth / 2, l.center[N] + l.depth / 2] : [0, 0];
    return s > 0 ? hi >= h[N] - EPS : lo <= -h[N] + EPS;
  }).length, 0);
  const f = faceFrame(o, score);
  const size = { u: r4(h[f.U] * 2), v: r4(h[f.V] * 2) };
  type Built = { label: string; detail: string; elements: Element[]; dims: DimSpec[]; hole: boolean };
  const built: Built[] = [];
  for (const r of raws) {
    const elements = r.locals.map((l) => toElement(f, l));
    const dims = elements.length > 1 ? rowDims(elements, size) : elementDims(elements[0], size, r.prefer?.(f));
    const hole = !!r.prefer;
    // Identical holes (a column of shelf pins) read as one feature.
    const twin = hole ? built.find((b) => b.hole && b.label === r.label && b.detail === r.detail && b.elements[0].side === elements[0].side) : undefined;
    if (twin) { twin.elements.push(...elements); twin.dims.push(...dims); } else built.push({ label: r.label, detail: r.detail, elements, dims, hole });
  }
  const features: FaceFeature[] = built.map((b, i) => {
    const side = b.elements[0].side;
    const where = side === 'far' ? ' (other face)' : side === 'edge' ? ' (in the edge)' : '';
    const label = b.hole && b.elements.length > 1 ? `${b.label}s ×${b.elements.length}` : b.label;
    const loc = locationText(b.dims, unit);
    return { letter: letterOf(i), label, detail: b.detail, elements: b.elements, dims: b.dims, text: `${label} — ${b.detail}${where}${loc ? `; ${loc}` : ''}` };
  });
  return { u: size.u, v: size.v, thickness: r4(h[f.N] * 2), features, notes, round: false };
}

/** Grain direction words for a part card. */
export function grainText(o: FurnitureObject): string {
  const s = o.material?.species;
  if (s === 'mdf') return 'No grain (MDF)';
  if (s === 'custom_paint') return 'Paint grade';
  if (s === 'metal_accent') return 'Metal';
  return 'Grain runs the length';
}

/** Finish words: 'Birch plywood · satin'. */
export function finishText(o: FurnitureObject): string {
  const m = o.material;
  if (!m) return 'Unknown';
  const sheen = m.varnishSheen && m.species !== 'metal_accent' ? ` · ${m.varnishSheen}` : '';
  const stain = m.stainColor && (m.stainOpacity ?? 0) > 0 ? ' · stained' : '';
  return `${m.name}${stain}${sheen}`;
}

/** 'Make a left and a right (mirror images).' when a group holds handed parts. */
export function handedNote(g: PartGroup): string | null {
  if (g.parts.length < 2) return null;
  const hand = (n: string) => /(\bL\b|\bleft\b)/i.test(n) ? 'L' : /(\bR\b|\bright\b)/i.test(n) ? 'R' : null;
  const hands = new Set(g.parts.map((p) => hand(p.name)).filter(Boolean));
  return hands.size === 2 ? 'Make lefts and rights as mirror images.' : null;
}
