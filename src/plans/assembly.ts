import type { FurnitureObject, FurnitureProject, Joint } from '../types/furniture';
import { JOINT_LABEL, hardwareCount } from '../joinery/joints';
import { projectHardware } from '../utils/exportUtils';
import { pieceBox, planParts, solidPoints } from './geometry';

export type Role =
  | 'leg' | 'apron' | 'side' | 'bottom' | 'top' | 'divider' | 'shelf' | 'back'
  | 'kick' | 'face-frame' | 'drawer' | 'drawer-front' | 'door' | 'other';

const NAME_HINTS: Array<[RegExp, Role]> = [
  [/^drawer\s*front/i, 'drawer-front'],
  [/drawer/i, 'drawer'],
  [/door/i, 'door'],
  [/stile|\brail\b|face\s*frame/i, 'face-frame'],
  [/kick|plinth/i, 'kick'],
  [/\blegs?\b/i, 'leg'],
  [/apron|stretcher|skirt/i, 'apron'],
  [/divider|partition|upright|mullion/i, 'divider'],
  [/shelf|shelves/i, 'shelf'],
  [/\bback\b/i, 'back'],
  [/\bbottom\b/i, 'bottom'],
  [/\btop\b/i, 'top'],
  [/\bsides?\b|\bends?\b/i, 'side'],
];

type Box = ReturnType<typeof pieceBox>;

/** What a part does in the piece: from its name first, else from its shape and where it sits. */
export function partRole(o: FurnitureObject, box: Box): Role {
  for (const [re, role] of NAME_HINTS) if (re.test(o.name)) return role;
  const pts = solidPoints(o);
  const lo = { x: Math.min(...pts.map((p) => p.x)), y: Math.min(...pts.map((p) => p.y)), z: Math.min(...pts.map((p) => p.z)) };
  const hi = { x: Math.max(...pts.map((p) => p.x)), y: Math.max(...pts.map((p) => p.y)), z: Math.max(...pts.map((p) => p.z)) };
  const ext = { x: hi.x - lo.x, y: hi.y - lo.y, z: hi.z - lo.z };
  const axes = ['x', 'y', 'z'] as const;
  const sorted = [...axes].sort((a, b) => ext[b] - ext[a]);
  const [long, mid, thin] = sorted;
  const tol = 1;
  // Sticks: long and narrow both ways.
  if (ext[mid] <= 4 && ext[long] >= 3 * ext[mid]) return long === 'y' ? 'leg' : 'apron';
  if (thin === 'y') {
    if (lo.y <= box.min.y + Math.max(tol, box.size.h * 0.15)) return 'bottom';
    if (hi.y >= box.max.y - tol) return 'top';
    return 'shelf';
  }
  if (thin === 'x') return lo.x <= box.min.x + tol || hi.x >= box.max.x - tol ? 'side' : 'divider';
  if (lo.z <= box.min.z + tol) return 'back';
  if (hi.z >= box.max.z - tol) {
    if (ext.y <= 8 && lo.y <= box.min.y + 8) return 'kick';
    if (Math.min(ext.x, ext.y) <= 3) return 'face-frame';
    return 'door';
  }
  if (ext.y <= 8 && lo.y <= box.min.y + 8) return 'kick';
  return 'other';
}

export interface StepPart { id: string; name: string; no?: number }
export interface Step {
  n: number;
  title: string;
  hint: string;
  parts: StepPart[];
  /** 'Dado: Shelf 1 into Side L' (repeats merged with ×n). */
  joints: string[];
  /** Hardware to fit in this step. */
  hardware?: string[];
}

type Stage = { key: string; roles: Role[]; title: (names: Set<Role>) => string; hint: string };

const STAGES: Stage[] = [
  {
    key: 'frame', roles: ['side', 'bottom', 'leg', 'apron'],
    title: (r) => (r.has('leg') || r.has('apron')) && !r.has('side') ? 'Frame: legs and aprons' : r.has('top') ? 'Carcass: sides, bottom and top' : 'Carcass: sides and bottom',
    hint: 'Dry-fit first. Glue and clamp, then check for square: the diagonals should match.',
  },
  { key: 'inner', roles: ['divider', 'shelf'], title: () => 'Dividers and fixed shelves', hint: 'Slide each one into its joint while the glue is wet; keep the fronts flush.' },
  { key: 'top', roles: ['top'], title: () => 'Top', hint: 'Fit the top and fasten it down.' },
  { key: 'back', roles: ['back'], title: () => 'Back', hint: 'Square the case, then fasten the back into its rabbets. It holds the case square.' },
  { key: 'base', roles: ['kick'], title: () => 'Base and toe kick', hint: 'Attach the base so the case sits level.' },
  { key: 'face', roles: ['face-frame'], title: () => 'Face frame', hint: 'Assemble the frame flat, then glue it to the case front.' },
  { key: 'drawers', roles: ['drawer'], title: () => 'Drawer boxes', hint: 'Build each box: sides to front and back, bottom slid into its groove. Check for square.' },
  { key: 'fronts', roles: ['drawer-front', 'door'], title: (r) => r.has('door') && r.has('drawer-front') ? 'Doors and drawer fronts' : r.has('door') ? 'Doors' : 'Drawer fronts', hint: 'Hang the doors and attach the fronts with even gaps all round.' },
  { key: 'other', roles: ['other'], title: () => 'Remaining parts', hint: 'Fit the remaining parts.' },
];

function topAssembly(o: FurnitureObject, byId: Map<string, FurnitureObject>): string {
  let top: FurnitureObject | undefined;
  let cur = o.parentId ? byId.get(o.parentId) : undefined;
  for (let g = 0; cur && g < 64; g++) { top = cur; cur = cur.parentId ? byId.get(cur.parentId) : undefined; }
  return top?.id ?? '';
}

interface JointLine { kind: string; mater: string; receiver: string; link: string }

function jointLine(j: Joint, byId: Map<string, FurnitureObject>): JointLine | null {
  const R = byId.get(j.receiverId), M = byId.get(j.materId);
  if (!R || !M) return null;
  if (j.type === 'dado' || j.type === 'rabbet') return { kind: JOINT_LABEL[j.type], mater: M.name, receiver: R.name, link: 'into' };
  if (j.type === 'pocket') return { kind: `Pocket screws ×${hardwareCount(j, R, M)}`, mater: M.name, receiver: R.name, link: 'to' };
  if (j.type === 'dowel') return { kind: `Dowels ×${hardwareCount(j, R, M)}`, mater: M.name, receiver: R.name, link: 'to' };
  const how = j.fasten === 'screws' ? 'screwed' : j.fasten === 'glue-screws' ? 'glued and screwed' : j.fasten === 'none' ? 'dry' : 'glued';
  return { kind: `Butt (${how})`, mater: M.name, receiver: R.name, link: 'to' };
}

const and = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/**
 * Joint lines, merged so a shelf in two sides reads once: 'Dado: Shelf 1,
 * Shelf 2 and Shelf 3 into Side L and Side R'.
 */
export function jointLines(js: Joint[], byId: Map<string, FurnitureObject>): string[] {
  const perMater = new Map<string, { l: JointLine; receivers: string[] }>();
  for (const j of js) {
    const l = jointLine(j, byId);
    if (!l) continue;
    const k = `${l.kind}|${l.link}|${l.mater}`;
    const cur = perMater.get(k);
    if (cur) { if (!cur.receivers.includes(l.receiver)) cur.receivers.push(l.receiver); } else perMater.set(k, { l, receivers: [l.receiver] });
  }
  const perTarget = new Map<string, { l: JointLine; maters: string[]; receivers: string[] }>();
  for (const { l, receivers } of perMater.values()) {
    const k = `${l.kind}|${l.link}|${receivers.join('|')}`;
    const cur = perTarget.get(k);
    if (cur) { if (!cur.maters.includes(l.mater)) cur.maters.push(l.mater); } else perTarget.set(k, { l, maters: [l.mater], receivers });
  }
  return [...perTarget.values()].map(({ l, maters, receivers }) => `${l.kind}: ${and(maters)} ${l.link} ${and(receivers)}`);
}

/**
 * A suggested build order: per assembly, the carcass (sides and bottom, or
 * legs and aprons) first, then dividers and shelves, top, back, base, face
 * frame, drawers, doors and fronts, and hardware last. Each step lists its
 * parts and the joints that close when those parts go in (a joint belongs to
 * the step where its later part arrives). Heuristic: it reads part names and
 * positions, so it's a starting point, not a rule.
 */
export function assemblySteps(project: FurnitureProject, numbers?: Map<string, number>): Step[] {
  const parts = planParts(project);
  const byId = new Map(project.objects.map((o) => [o.id, o]));
  const joints = (project.joints ?? []).filter((j) => byId.has(j.receiverId) && byId.has(j.materId));
  const asm = new Map<string, FurnitureObject[]>();
  for (const p of parts) {
    const k = topAssembly(p, byId);
    asm.set(k, [...(asm.get(k) ?? []), p]);
  }
  const assemblies = [...asm].sort((a, b) => b[1].length - a[1].length);
  const multi = assemblies.filter(([, ps]) => ps.length > 1).length > 1;
  const steps: Step[] = [];
  const placedAt = new Map<string, number>();
  const adjustable: StepPart[] = [];
  for (const [gid, ps] of assemblies) {
    const box = pieceBox(ps);
    const roles = new Map(ps.map((p) => [p.id, partRole(p, box)]));
    const jointed = (id: string) => joints.some((j) => j.receiverId === id || j.materId === id);
    // A top joined to the sides goes on with them; a loose shelf sits on pins.
    for (const p of ps) {
      const r = roles.get(p.id)!;
      if (r === 'top' && joints.some((j) => (j.receiverId === p.id || j.materId === p.id) && ['side', 'leg', 'apron'].includes(roles.get(j.receiverId === p.id ? j.materId : j.receiverId) ?? 'other'))) roles.set(p.id, 'side');
      if (r === 'shelf' && !jointed(p.id) && ps.length > 2) { roles.set(p.id, 'other'); adjustable.push({ id: p.id, name: p.name, no: numbers?.get(p.id) }); }
    }
    const adjustableIds = new Set(adjustable.map((a) => a.id));
    const prefix = multi && gid ? `${byId.get(gid)?.name ?? 'Assembly'}: ` : '';
    for (const st of STAGES) {
      const mine = ps.filter((p) => st.roles.includes(roles.get(p.id)!) && !adjustableIds.has(p.id));
      if (!mine.length) continue;
      const n = steps.length + 1;
      for (const p of mine) placedAt.set(p.id, n);
      const roleSet = new Set(mine.map((p) => partRole(p, box)));
      const closing = joints.filter((j) => {
        const a = placedAt.get(j.receiverId), b = placedAt.get(j.materId);
        return a !== undefined && b !== undefined && Math.max(a, b) === n;
      });
      steps.push({
        n, title: `${prefix}${st.title(roleSet)}`, hint: st.hint,
        parts: mine.map((p) => ({ id: p.id, name: p.name, no: numbers?.get(p.id) })),
        joints: jointLines(closing, byId),
      });
    }
  }
  const hardware = projectHardware(project).map((h) => `${h.name} ×${h.quantity}`);
  if (hardware.length || adjustable.length) {
    steps.push({
      n: steps.length + 1, title: 'Hardware', hint: adjustable.length ? 'Install the hardware, then set the adjustable shelves on their pins.' : 'Install the hardware.',
      parts: adjustable, joints: [], hardware,
    });
  }
  return steps;
}
