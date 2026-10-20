import type { FurnitureObject, Joint, LengthUnit } from '../types/furniture';
import { formatLength } from '../utils/measure';
import {
  DEFAULT_SCREW_LENGTH, JOINT_LABEL, dowelDiameter, dowelLength, hardwareSpots, jointGeometry, type JointGeometry,
} from './joints';

/** Fit tolerance: 1/64". */
export const FIT_TOL = 1 / 64;
/** Holes this close to an end of the joint get a warning. */
export const MIN_END = 0.75;
/** Holes closer than this to each other get a warning. */
export const MIN_GAP = 1;

export type FitStatus = 'fits' | 'check' | 'broken';
export interface FitResult {
  status: FitStatus;
  /** One plain-language line for the top of the editor. */
  message: string;
  /** Every reason it warns (first one is in the message). */
  issues: string[];
}

const len = (n: number, unit: LengthUnit) => {
  const s = formatLength(n, unit === 'ft' ? 'in' : unit);
  return s.endsWith(' in') ? `${s.slice(0, -3)}"` : s;
};

/** '1/3', '1/4', '1/2' … for simple ratios, else a percent. */
export function ratioLabel(r: number): string {
  for (const d of [2, 3, 4, 5, 6, 8]) {
    for (let n = 1; n < d; n++) if (Math.abs(r - n / d) < 0.02) return `${n}/${d}`;
  }
  return `${Math.round(r * 100)}%`;
}

export const BUTT_FASTEN_LABEL = { glue: 'glued', screws: 'screwed', 'glue-screws': 'glued and screwed', none: 'held by nothing yet' } as const;

/** Short tag shown on the seam, e.g. 'Dado 3/4" × 1/4" deep'. */
export function jointTag(j: Joint, R: FurnitureObject | undefined, M: FurnitureObject | undefined, unit: LengthUnit): string {
  const g = jointGeometry(j, R, M);
  if (j.type === 'dado' || j.type === 'rabbet') {
    return g ? `${JOINT_LABEL[j.type]} ${len(g.grooveWidth, unit)} × ${len(j.depth, unit)} deep` : JOINT_LABEL[j.type];
  }
  if (j.type === 'pocket' || j.type === 'dowel') {
    const n = g ? hardwareSpots(j, g.L).length : 0;
    return j.type === 'pocket' ? `Pocket screws × ${n}` : `Dowels × ${n} · ${len(dowelDiameter(j), unit)}`;
  }
  return 'Butt';
}

function holeIssues(j: Joint, g: JointGeometry, unit: LengthUnit, what: string): string[] {
  const out: string[] = [];
  const s = hardwareSpots(j, g.L);
  const span = g.L.lMax - g.L.lMin;
  const end = Math.min(...s.map((x) => Math.min(x, span - x)));
  if (end < MIN_END - 1e-6) out.push(`A ${what} is only ${len(end, unit)} from the end (keep ${len(MIN_END, unit)} or more)`);
  for (let i = 1; i < s.length; i++) {
    if (s[i] - s[i - 1] < MIN_GAP - 1e-6) { out.push(`${what[0].toUpperCase()}${what.slice(1)}s are only ${len(s[i] - s[i - 1], unit)} apart`); break; }
  }
  return out;
}

/** Pure fit check for one joint: does it fit, and if not, why (plain words). */
export function fitCheck(j: Joint, R: FurnitureObject | undefined, M: FurnitureObject | undefined, unit: LengthUnit = 'in'): FitResult {
  if (!R || !M) return { status: 'broken', message: 'One of these parts was removed.', issues: ['One of these parts was removed.'] };
  const g = jointGeometry(j, R, M);
  if (!g) {
    const m = `${M.name} isn't touching ${R.name} anymore.`;
    return { status: 'broken', message: m, issues: [m] };
  }
  const issues: string[] = [];
  let ok = '';
  if (j.type === 'dado' || j.type === 'rabbet') {
    const kind = j.type;
    if (j.depth > g.rThick / 2 + 1e-6) issues.push(`Too deep: ${len(j.depth, unit)} is more than half of ${R.name}'s ${len(g.rThick, unit)}`);
    if (Math.abs(g.grooveWidth - g.matThick) > FIT_TOL) {
      issues.push(`${g.grooveWidth > g.matThick ? 'Loose' : 'Tight'}: the ${kind} is ${len(g.grooveWidth, unit)} wide but ${M.name} is ${len(g.matThick, unit)} thick`);
    }
    if (g.seat < j.depth - FIT_TOL) issues.push(`${M.name} sits ${len(j.depth - g.seat, unit)} short of the bottom of the ${kind}`);
    else if (g.seat > j.depth + FIT_TOL) issues.push(`${M.name} goes ${len(g.seat - j.depth, unit)} past the bottom of the ${kind}`);
    ok = `Fits: ${len(g.matThick, unit)} ${M.name} in a ${len(g.grooveWidth, unit)} ${kind}, ${len(j.depth, unit)} deep (${ratioLabel(j.depth / g.rThick)} of the board)`;
  } else if (j.type === 'pocket') {
    const sl = j.screwLength ?? DEFAULT_SCREW_LENGTH;
    const n = hardwareSpots(j, g.L).length;
    issues.push(...holeIssues(j, g, unit, 'screw'));
    if (sl > g.matThick * 0.75 + g.rThick + 1e-6) issues.push(`${len(sl, unit)} screws would poke out of ${R.name}`);
    else if (sl < g.matThick + 0.25 - 1e-6) issues.push(`${len(sl, unit)} screws are too short to hold ${len(g.matThick, unit)} stock`);
    ok = `Fits: ${n} pocket screw${n === 1 ? '' : 's'}, ${len(sl, unit)} long, in ${M.name}`;
  } else if (j.type === 'dowel') {
    const d = dowelDiameter(j), l = dowelLength(j);
    const n = hardwareSpots(j, g.L).length;
    issues.push(...holeIssues(j, g, unit, 'dowel'));
    if (d > g.matThick / 2 + 1e-6) issues.push(`${len(d, unit)} dowels are more than half of ${M.name}'s ${len(g.matThick, unit)}`);
    // Holes go up to 60% into the receiver; the rest must fit in the mating board (1/8" spare).
    const box = g.L.contact.box, a = g.L.contact.axis;
    const room = g.rThick * 0.6 + (box.max[a] - box.min[a]) - 0.125;
    if (l > room + 1e-6) issues.push(`${len(l, unit)} dowels are longer than these boards allow (${len(room, unit)} max)`);
    ok = `Fits: ${n} dowel${n === 1 ? '' : 's'}, ${len(d, unit)} × ${len(l, unit)}`;
  } else {
    const f = j.fasten ?? 'glue';
    if (f === 'none') issues.push('Nothing holds this butt joint: pick glue or screws');
    ok = `Fits: butt joint, ${BUTT_FASTEN_LABEL[f]}`;
  }
  return issues.length ? { status: 'check', message: `Check: ${issues[0]}`, issues } : { status: 'fits', message: ok, issues };
}
