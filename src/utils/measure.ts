import type { FurnitureObject, Position3D } from '../types/furniture';
import { boxCorners } from '../state/groupTree';

export type SnapKind = 'vertex' | 'midpoint' | 'face' | 'surface';
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

/**
 * Snap a tapped surface point to the nearest corner / edge midpoint / face
 * center of the tapped part within `tol` inches (corners win ties, then
 * midpoints); otherwise keep the raw point.
 */
export function snapMeasurePoint(hit: Position3D, part: FurnitureObject | undefined, tol: number): MeasurePoint {
  if (!part) return { ...hit, kind: 'surface' };
  const rank: Record<SnapKind, number> = { vertex: 0, midpoint: 1, face: 2, surface: 3 };
  let best: MeasurePoint | null = null;
  let bestScore = Infinity;
  for (const c of snapCandidates(part)) {
    const d = dist(hit, c);
    if (d > tol) continue;
    const score = d + rank[c.kind] * tol * 0.15;
    if (score < bestScore) { best = c; bestScore = score; }
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
