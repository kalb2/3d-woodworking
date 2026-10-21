import type { FurnitureObject, Position3D } from '../types/furniture';
import { boxCorners } from '../state/groupTree';

export type SnapKind = 'vertex' | 'midpoint' | 'edge' | 'face' | 'surface' | 'floor';
export interface MeasurePoint extends Position3D { kind: SnapKind }

/** Corners, edge midpoints and face centers of a box part (world). */
export function snapCandidates(o: FurnitureObject): MeasurePoint[] {
  const c = boxCorners(o); // index = ix*4 + iy*2 + iz
  const out: MeasurePoint[] = c.map((p) => ({ ...p, kind: 'vertex' as const }));
  const mid = (a: Position3D, b: Position3D) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 });
  for (let i = 0; i < 8; i++) for (const bit of [4, 2, 1]) {
    if (i & bit) continue;
    out.push({ ...mid(c[i], c[i | bit]), kind: 'midpoint' });
  }
  const faces: number[][] = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 4, 5], [2, 3, 6, 7], [0, 2, 4, 6], [1, 3, 5, 7]];
  for (const f of faces) {
    const p = f.map((i) => c[i]);
    out.push({ x: (p[0].x + p[1].x + p[2].x + p[3].x) / 4, y: (p[0].y + p[1].y + p[2].y + p[3].y) / 4, z: (p[0].z + p[1].z + p[2].z + p[3].z) / 4, kind: 'face' });
  }
  return out;
}

const dist = (a: Position3D, b: Position3D) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** Closest point to `p` on segment a–b. */
function closestOnSegment(p: Position3D, a: Position3D, b: Position3D): Position3D {
  const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const len2 = ab.x * ab.x + ab.y * ab.y + ab.z * ab.z;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y + (p.z - a.z) * ab.z) / len2)) : 0;
  const r = (n: number) => Math.round(n * 10000) / 10000 || 0;
  return { x: r(a.x + ab.x * t), y: r(a.y + ab.y * t), z: r(a.z + ab.z * t) };
}

/** The 12 edges of a box part (world). */
export function boxEdges(o: FurnitureObject): [Position3D, Position3D][] {
  const c = boxCorners(o);
  const out: [Position3D, Position3D][] = [];
  for (let i = 0; i < 8; i++) for (const bit of [4, 2, 1]) if (!(i & bit)) out.push([c[i], c[i | bit]]);
  return out;
}

/**
 * Snap a tapped surface point to the nearest corner / edge midpoint / face
 * center of the tapped part within `tol` inches (corners win ties, then
 * midpoints); otherwise keep the raw point.
 */
export function snapMeasurePoint(hit: Position3D, part: FurnitureObject | undefined, tol: number): MeasurePoint {
  if (!part) return { ...hit, kind: 'surface' };
  const rank: Record<SnapKind, number> = { vertex: 0, midpoint: 1, edge: 2, face: 3, surface: 4, floor: 5 };
  let best: MeasurePoint | null = null;
  let bestScore = Infinity;
  const cands = snapCandidates(part);
  // Corners and edge middles first.
  for (const c of cands) {
    if (c.kind === 'face') continue;
    const d = dist(hit, c);
    if (d > tol) continue;
    const score = d + rank[c.kind] * tol * 0.15;
    if (score < bestScore) { best = c; bestScore = score; }
  }
  if (best) return best;
  // Then anywhere along an edge (a bit tighter, so faces stay easy to hit).
  let edge: Position3D | null = null, edgeD = tol * 0.6;
  for (const [a, b] of boxEdges(part)) {
    const q = closestOnSegment(hit, a, b), d = dist(hit, q);
    if (d <= edgeD) { edge = q; edgeD = d; }
  }
  if (edge) return { ...edge, kind: 'edge' };
  for (const c of cands) {
    if (c.kind !== 'face') continue;
    const d = dist(hit, c);
    if (d <= tol && d < bestScore) { best = c; bestScore = d; }
  }
  return best ?? { ...hit, kind: 'surface' };
}

export const measureDistance = dist;

/** Inches as the project unit; inches show 1/16 fractions (23 1/4 in). */
export function formatLength(inches: number, unit: 'in' | 'ft' | 'cm' | 'mm'): string {
  if (unit === 'mm') return `${Math.round(inches * 25.4)} mm`;
  if (unit === 'cm') return `${Math.round(inches * 25.4) / 10} cm`;
  const sixteenths = Math.round(inches * 16);
  const whole = Math.floor(sixteenths / 16);
  let num = sixteenths % 16, den = 16;
  while (num && num % 2 === 0) { num /= 2; den /= 2; }
  const frac = num ? `${num}/${den}` : '';
  if (unit === 'ft') {
    const ft = Math.floor(whole / 12), inch = whole % 12;
    return `${ft ? `${ft}' ` : ''}${inch || !ft || frac ? `${inch}${frac ? ` ${frac}` : ''}"` : ''}`.trim();
  }
  return `${whole || !frac ? whole : ''}${whole && frac ? ' ' : ''}${frac} in`;
}

/** A point on the empty floor (y = 0), snapped to the grid step. */
export function snapFloorPoint(p: { x: number; z: number }, step: number): MeasurePoint {
  const s = step > 0 ? step : 0.5;
  const r = (n: number) => { const v = Math.round(n / s) * s; return Math.round(v * 10000) / 10000 || 0; };
  return { x: r(p.x), y: 0, z: r(p.z), kind: 'floor' };
}

export const SNAP_LABEL: Record<SnapKind, string> = { vertex: 'Corner', midpoint: 'Edge middle', edge: 'Edge', face: 'Face center', surface: 'Surface', floor: 'Floor' };

/** What the hint says about the point under the finger. */
export function snapPhrase(kind: SnapKind): string {
  if (kind === 'surface') return 'On the surface (no snap)';
  if (kind === 'floor') return 'On the floor grid';
  return `Snapped to ${SNAP_LABEL[kind].toLowerCase()}`;
}

export interface MeasureHint { step: string; title: string; detail: string }

/** Step-by-step hint for the tape measure banner. */
export function measureHint(a: MeasurePoint | null, b: MeasurePoint | null, hover: MeasurePoint | null, unit: 'in' | 'ft' | 'cm' | 'mm'): MeasureHint {
  if (!a) {
    return {
      step: 'Step 1 of 2', title: 'Tap the first point',
      detail: hover ? `${snapPhrase(hover.kind)}. Lift to place it.` : 'Touch and slide to aim. Snaps to corners, edges and faces.',
    };
  }
  if (!b) {
    return {
      step: 'Step 2 of 2', title: 'Tap the second point',
      detail: hover ? `${snapPhrase(hover.kind)} · ${formatLength(dist(a, hover), unit)}. Lift to place it.` : 'Touch and slide to aim at the other end.',
    };
  }
  return { step: 'Result', title: formatLength(dist(a, b), unit), detail: 'Pin it to keep it on the model, or measure again.' };
}

/** Top-bar text for each step of the tape measure. */
export function measureStepText(a: MeasurePoint | null, b: MeasurePoint | null, unit: 'in' | 'ft' | 'cm' | 'mm'): string {
  if (!a) return 'Step 1 of 2: Tap where to measure from';
  if (!b) return 'Step 2 of 2: Tap where to measure to';
  return `Distance ${formatLength(dist(a, b), unit)}`;
}
