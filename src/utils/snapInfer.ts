import type { FurnitureObject, Position3D } from '../types/furniture';
import { objectBox, type Box } from '../state/groupTree';

export type AxisKey = 'x' | 'y' | 'z';
export type AlignKind = 'flush' | 'centered' | 'inset';

/** One inferred alignment: on `axis`, a mover feature lines up with a target feature at `value`. */
export interface Alignment {
  axis: AxisKey;
  kind: AlignKind;
  /** Inset amount (inches) for kind 'inset'. */
  inset?: number;
  targetId: string;
  value: number;
  /** Ends of the dashed guide (both lie on the plane axis = value). */
  from: Position3D;
  to: Position3D;
}

export const ALIGN_TOL = 0.6;
export const INSET_TOL = 0.2;
export const INSETS = [0.25, 0.5, 0.75];
/** Targets farther apart than this (gap between boxes) don't infer. */
export const NEAR_GAP = 36;

const AXES: AxisKey[] = ['x', 'y', 'z'];
const center = (b: Box, a: AxisKey) => (b.min[a] + b.max[a]) / 2;
const gap = (a: Box, b: Box, ax: AxisKey) => Math.max(0, a.min[ax] - b.max[ax], b.min[ax] - a.max[ax]);
const turnedOff90 = (o: FurnitureObject) =>
  [o.rotation.x, o.rotation.y, o.rotation.z].some((d) => Math.abs(d / 90 - Math.round(d / 90)) > 1e-6);

/** "Inset 3/4"" style fraction. */
export function insetLabel(inches: number): string {
  const map: Record<string, string> = { '0.25': '1/4', '0.5': '1/2', '0.75': '3/4' };
  return `Inset ${map[String(inches)] ?? inches}"`;
}

/**
 * Edge / middle / inset inference for a moving part: on every axis without a
 * face contact, line the mover's min, center or max up with a nearby
 * target's min (Flush), center (Centered), max (Flush), or min/max inset by
 * a common sheet thickness (Inset 1/4", 1/2", 3/4"). Nearest candidate wins
 * per axis. Targets turned off 90° steps are skipped (their box isn't their
 * shape). Pure: returns the adjusted position and the alignments used.
 */
export function inferAlignments(
  mover: FurnitureObject,
  pos: Position3D,
  targets: FurnitureObject[],
  lockedAxes: Partial<Record<AxisKey, unknown>>,
): { position: Position3D; alignments: Alignment[] } {
  const out = { ...pos };
  const mb0 = objectBox({ ...mover, position: pos });
  const half = { x: (mb0.max.x - mb0.min.x) / 2, y: (mb0.max.y - mb0.min.y) / 2, z: (mb0.max.z - mb0.min.z) / 2 };
  const off = { x: center(mb0, 'x') - pos.x, y: center(mb0, 'y') - pos.y, z: center(mb0, 'z') - pos.z };
  const boxes = targets
    .filter((t) => t.id !== mover.id && t.visible !== false && t.shape !== 'group' && !turnedOff90(t))
    .map((t) => ({ t, b: objectBox(t) }));
  const alignments: Alignment[] = [];

  for (const a of AXES) {
    if (lockedAxes[a]) continue;
    const others = AXES.filter((x) => x !== a);
    let best: { d: number; shift: number; kind: AlignKind; inset?: number; value: number; t: FurnitureObject; b: Box } | null = null;
    const c = pos[a] + off[a];
    const m = { min: c - half[a], ctr: c, max: c + half[a] };
    for (const { t, b } of boxes) {
      if (others.some((o) => gap(mb0, b, o) > NEAR_GAP)) continue;
      const cands: { mine: number; theirs: number; kind: AlignKind; inset?: number; tol: number }[] = [
        { mine: m.min, theirs: b.min[a], kind: 'flush', tol: ALIGN_TOL },
        { mine: m.max, theirs: b.max[a], kind: 'flush', tol: ALIGN_TOL },
        { mine: m.ctr, theirs: center(b, a), kind: 'centered', tol: ALIGN_TOL },
        ...INSETS.flatMap((i) => [
          { mine: m.min, theirs: b.min[a] + i, kind: 'inset' as const, inset: i, tol: INSET_TOL },
          { mine: m.max, theirs: b.max[a] - i, kind: 'inset' as const, inset: i, tol: INSET_TOL },
        ]),
      ];
      for (const k of cands) {
        const d = k.theirs - k.mine;
        if (Math.abs(d) > k.tol) continue;
        // Prefer exact flush/centered over insets on ties.
        const score = Math.abs(d) + (k.kind === 'inset' ? 1e-3 : 0);
        if (!best || score < best.d) best = { d: score, shift: d, kind: k.kind, inset: k.inset, value: k.theirs, t, b };
      }
    }
    if (!best) continue;
    out[a] = Math.round((pos[a] + best.shift) * 1e4) / 1e4 || 0;
    const mc = { x: out.x + off.x, y: out.y + off.y, z: out.z + off.z };
    const tc = { x: center(best.b, 'x'), y: center(best.b, 'y'), z: center(best.b, 'z') };
    alignments.push({
      axis: a, kind: best.kind, inset: best.inset, targetId: best.t.id, value: best.value,
      from: { ...mc, [a]: best.value }, to: { ...tc, [a]: best.value },
    });
  }
  return { position: out, alignments };
}

/** The chip text for a set of alignments (most specific first). */
export function alignmentHint(al: Alignment[], againstWall = false): string | null {
  const inset = al.find((x) => x.kind === 'inset');
  if (inset) return insetLabel(inset.inset!);
  if (al.some((x) => x.kind === 'centered')) return 'Centered';
  if (al.some((x) => x.kind === 'flush')) return 'Flush';
  return againstWall ? 'Against wall' : null;
}
