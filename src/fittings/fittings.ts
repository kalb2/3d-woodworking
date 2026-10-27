/**
 * Drawers and doors as re-openable built-in templates that fill an opening.
 * Frame: x centered on the opening, y up from its bottom, z = 0 at its front
 * plane (negative = into the cabinet). Pure.
 */
import type { BoardHole, HoleAnchor, JointType, Joint, WoodMaterial, WoodSpecies } from '../types/furniture';
import { defaultBoardOptions } from '../utils/boardGeometry';
import { PRESET_WOOD_MATERIALS } from '../utils/woodTextureGenerator';
import { formatSmallLen } from '../utils/lengthFormat';
import { MODULE_MATERIALS, type ModuleBuild, type ModuleField, type ModuleInput, type ModuleJoint, type ModulePart } from '../generators/modules';
import { doorPlan, drawerPlan, HINGE_CUP, hingeCount, hingePositions, shakerParts, type DoorMount, type SlideType } from './fittingMath';

type Input = ModuleInput;
const r = (n: number) => Math.round(n * 10000) / 10000 || 0;
const r16 = (n: number) => Math.max(0.0625, Math.round(n * 16) / 16);
const materialOf = (species: string): WoodMaterial => ({ ...(PRESET_WOOD_MATERIALS[species as WoodSpecies] ?? PRESET_WOOD_MATERIALS.plywood) });

class Parts {
  parts: ModulePart[] = [];
  joints: ModuleJoint[] = [];
  readonly tag: string;
  constructor(tag: string) { this.tag = tag; }
  board(name: string, size: { x: number; y: number; z: number }, min: { x: number; y: number; z: number }, species: string, opts: { flip?: boolean; holes?: BoardHole[] } = {}) {
    this.parts.push({
      name, shape: 'board',
      dimensions: { length: r(size.x), height: r(size.y), width: r(size.z) },
      position: { x: r(min.x + size.x / 2), y: r(min.y + size.y / 2), z: r(min.z + size.z / 2) },
      rotation: { x: 0, y: opts.flip ? 180 : 0, z: 0 },
      material: materialOf(species), visible: true,
      board: { ...defaultBoardOptions(), holes: opts.holes ?? [] },
      generator: this.tag,
    });
    return this.parts.length - 1;
  }
  joint(type: JointType, receiver: number, mater: number, face: Joint['face'], depth = 0, extended = 0, extra: Partial<ModuleJoint> = {}) {
    this.joints.push({ type, receiver, mater, face, depth: r(depth), extended: r(extended), ...extra });
  }
}

const choice = (key: string, label: string, options: [string, string][], extra: Partial<ModuleField> = {}): ModuleField =>
  ({ key, label, kind: 'choice', options: options.map(([value, l]) => ({ value, label: l })), ...extra });
const len = (key: string, label: string, min: number, max: number, extra: Partial<ModuleField> = {}): ModuleField => ({ key, label, kind: 'number', min, max, ...extra });

const isInset = (v: Input) => v.mount === 'inset';
const overlayish = (v: Input) => v.mount !== 'inset';

export const DRAWER_FIELDS: ModuleField[] = [
  len('width', 'Opening width', 6, 48), len('height', 'Opening height', 3, 72), len('depth', 'Opening depth', 8, 30),
  { key: 'count', label: 'Drawers', kind: 'number', count: true, min: 1, max: 6 },
  choice('heights', 'Heights', [['even', 'Even'], ['graduated', 'Graduated']], { show: (v) => Number(v.count) > 1 }),
  choice('mount', 'Front', [['overlay', 'Overlay'], ['inset', 'Inset']]),
  choice('slide', 'Slides', [['side', 'Side-mount'], ['under', 'Undermount']]),
  choice('box', 'Box', [['0.5', '1/2" plywood'], ['0.75', '3/4" plywood']], { advanced: true }),
  choice('bottom', 'Bottom', [['groove', '1/4" in a groove'], ['under', '1/4" screwed under']], { advanced: true, show: (v) => v.slide !== 'under' }),
  choice('joinery', 'Box corners', [['butt', 'Butt + screws'], ['rabbet', 'Rabbet'], ['dado', 'Dado']], { advanced: true }),
  len('gap', 'Gap between fronts', 0, 0.5, { advanced: true, show: overlayish }),
  len('sideT', 'Cabinet sides', 0, 1.5, { advanced: true, show: overlayish }),
  len('reveal', 'Reveal', 0, 0.25, { advanced: true, show: isInset }),
  len('frontT', 'Front thickness', 0.5, 1.25, { advanced: true }),
  { key: 'material', label: 'Front material', kind: 'choice', options: MODULE_MATERIALS, advanced: true },
];

export const DRAWER_DEFAULTS: Input = {
  width: 18, height: 6, depth: 20, count: 1, heights: 'even', mount: 'overlay', slide: 'side',
  box: '0.5', bottom: 'groove', joinery: 'butt', gap: 0.125, sideT: 0.75, reveal: 0.0625, frontT: 0.75, material: 'plywood',
};

export const DOOR_FIELDS: ModuleField[] = [
  len('width', 'Opening width', 4, 60), len('height', 'Opening height', 6, 96),
  choice('doors', 'Doors', [['1', 'Single'], ['2', 'Pair']]),
  choice('mount', 'Mount', [['full', 'Full overlay'], ['half', 'Half overlay'], ['inset', 'Inset']]),
  choice('style', 'Style', [['slab', 'Slab'], ['shaker', 'Shaker']]),
  choice('hingeSide', 'Hinged on', [['left', 'Left'], ['right', 'Right']], { show: (v) => v.doors === '1' }),
  choice('hinge', 'Hinges', [['concealed', '35 mm concealed'], ['butt', 'Butt hinges']], { advanced: true }),
  len('gap', 'Gap', 0, 0.5, { advanced: true, show: overlayish }),
  len('sideT', 'Cabinet sides', 0, 1.5, { advanced: true, show: overlayish }),
  len('reveal', 'Reveal', 0, 0.25, { advanced: true, show: isInset }),
  len('thickness', 'Door thickness', 0.5, 1.25, { advanced: true }),
  len('stile', 'Stile & rail width', 1.5, 4, { advanced: true, show: (v) => v.style === 'shaker' }),
  { key: 'material', label: 'Material', kind: 'choice', options: MODULE_MATERIALS, advanced: true },
];

export const DOOR_DEFAULTS: Input = {
  width: 15, height: 30, doors: '1', mount: 'full', style: 'slab', hingeSide: 'left', hinge: 'concealed',
  gap: 0.125, sideT: 0.75, reveal: 0.0625, thickness: 0.75, stile: 2.25, material: 'plywood',
};

/** Defaults filled in, numbers clamped, counts whole. */
export function normalizeFields(fields: ModuleField[], defaults: Input, raw: Input): Input {
  const out: Input = {};
  for (const f of fields) {
    const val = raw[f.key] ?? defaults[f.key];
    if (f.kind === 'choice') { out[f.key] = f.options!.some((o) => o.value === String(val)) ? String(val) : defaults[f.key]; continue; }
    let n = typeof val === 'number' ? val : Number(val);
    if (!Number.isFinite(n)) n = Number(defaults[f.key]);
    if (f.count) n = Math.round(n);
    out[f.key] = Math.max(f.min ?? 0, Math.min(f.max ?? Infinity, n));
  }
  return out;
}

export function normalizeDrawers(raw: Input): Input {
  const v = normalizeFields(DRAWER_FIELDS, DRAWER_DEFAULTS, raw);
  // Undermount runners need the bottom recessed 1/2" (in a groove).
  if (v.slide === 'under') v.bottom = 'groove';
  return v;
}
export const normalizeDoors = (raw: Input) => normalizeFields(DOOR_FIELDS, DOOR_DEFAULTS, raw);

export function drawerPlanOf(raw: Input) {
  const v = normalizeDrawers(raw);
  return {
    v,
    plan: drawerPlan({
      width: Number(v.width), height: Number(v.height), depth: Number(v.depth), count: Number(v.count),
      heights: v.heights as 'even' | 'graduated', mount: v.mount as 'overlay' | 'inset', slide: v.slide as SlideType,
      side: Number(v.box), frontT: Number(v.frontT), gap: Number(v.gap), reveal: Number(v.reveal), sideT: Number(v.sideT),
    }),
  };
}

/** Drawer stack: false fronts, plus a box (sides, front, back, bottom) per drawer. */
export function buildDrawers(raw: Input): ModuleBuild {
  const { v, plan } = drawerPlanOf(raw);
  const b = new Parts('drawers');
  const T = Number(v.frontT), s = Number(v.box);
  const species = String(v.material);
  const n = plan.fronts.length;
  const corner = String(v.joinery);
  const g = corner === 'butt' ? 0 : r16(s / 2);
  const setback = corner === 'dado' ? s : 0;
  const grooved = v.bottom === 'groove';
  const gd = s >= 0.75 ? 0.375 : 0.25;
  plan.fronts.forEach((f, i) => {
    const k = i + 1;
    b.board(n === 1 ? 'Drawer front' : `Drawer front ${k}`, { x: f.width, y: f.height, z: T }, { x: f.x0, y: f.y0, z: plan.boxFrontZ === 0 ? 0 : -T }, species);
    const box = plan.boxes[i];
    const bw = box.width, L = box.length;
    const zF = plan.boxFrontZ, zB = zF - L;
    const lift = grooved ? 0 : 0.25;
    const by = box.y0 + lift, bh = box.height - lift;
    const sl = b.board(`Drawer ${k} side L`, { x: s, y: bh, z: L }, { x: -bw / 2, y: by, z: zB }, 'plywood');
    const sr = b.board(`Drawer ${k} side R`, { x: s, y: bh, z: L }, { x: bw / 2 - s, y: by, z: zB }, 'plywood', { flip: true });
    const across = bw - 2 * s + 2 * g;
    const fr = b.board(`Drawer ${k} front`, { x: across, y: bh, z: s }, { x: -bw / 2 + s - g, y: by, z: zF - setback - s }, 'plywood');
    const bk = b.board(`Drawer ${k} back`, { x: across, y: bh, z: s }, { x: -bw / 2 + s - g, y: by, z: zB + setback }, 'plywood');
    for (const side of [sl, sr]) {
      for (const p of [fr, bk]) {
        if (corner === 'butt') b.joint('butt', side, p, '+x', 0, 0, { fasten: 'glue-screws' });
        else b.joint(corner as JointType, side, p, '+x', g, g);
      }
    }
    if (grooved) {
      const zIn0 = zB + setback + s, zIn1 = zF - setback - s;
      const bo = b.board(`Drawer ${k} bottom`, { x: bw - 2 * s + 2 * gd, y: 0.25, z: zIn1 - zIn0 + 2 * gd }, { x: -bw / 2 + s - gd, y: by + 0.5, z: zIn0 - gd }, 'plywood');
      b.joint('dado', sl, bo, '+x', gd, gd);
      b.joint('dado', sr, bo, '+x', gd, gd);
      b.joint('dado', fr, bo, '-z', gd, gd);
      b.joint('dado', bk, bo, '+z', gd, gd);
    } else {
      const bo = b.board(`Drawer ${k} bottom`, { x: bw, y: 0.25, z: L }, { x: -bw / 2, y: box.y0, z: zB }, 'plywood');
      for (const p of [sl, sr, fr, bk]) b.joint('butt', bo, p, '+y', 0, 0, { fasten: 'glue-screws' });
    }
  });
  return { parts: b.parts, joints: b.joints };
}

const MOUNT_LABEL: Record<DoorMount, string> = { full: 'full overlay', half: 'half overlay', inset: 'inset' };

export function doorPlanOf(raw: Input) {
  const v = normalizeDoors(raw);
  const plan = doorPlan({
    width: Number(v.width), height: Number(v.height), mount: v.mount as DoorMount, count: v.doors === '2' ? 2 : 1,
    gap: Number(v.gap), reveal: Number(v.reveal), sideT: Number(v.sideT),
  }, v.hingeSide === 'right' ? 'right' : 'left');
  return { v, plan };
}

/**
 * Cup holes on a door part's back. Parts are turned 180° so their local +z
 * (the 'front' hole face) faces into the cabinet and local +x points to world -x.
 */
export function hingeCups(partWidth: number, doorHeight: number, hinge: 'left' | 'right', yOffset = 0): BoardHole[] {
  const u = partWidth / 2 - HINGE_CUP.fromEdge;
  const x = hinge === 'left' ? u : -u;
  const ys = hingePositions(doorHeight);
  return ys.map((y, i) => {
    const z = r(y - doorHeight / 2 + yOffset);
    const vAnchor: HoleAnchor = i === 0 ? 'start' : i === ys.length - 1 ? 'end' : Math.abs(z) < 0.01 ? 'center' : z < 0 ? 'start' : 'end';
    return { id: `hinge_${i}`, face: 'front', x: r(x), z, diameter: HINGE_CUP.diameter, depth: HINGE_CUP.depth,
      anchor: { u: hinge === 'left' ? 'end' : 'start', v: vAnchor } };
  });
}

/** Door or pair: slab, or shaker (stiles, rails dowelled, 1/4" panel in grooves). */
export function buildDoors(raw: Input): ModuleBuild {
  const { v, plan } = doorPlanOf(raw);
  const b = new Parts('door');
  const T = Number(v.thickness);
  const species = String(v.material);
  const z0 = v.mount === 'inset' ? -T : 0;
  const cups = v.hinge === 'concealed';
  const n = plan.doors.length;
  plan.doors.forEach((d, i) => {
    const name = n === 1 ? 'Door' : `Door ${i + 1}`;
    if (v.style !== 'shaker') {
      b.board(name, { x: d.width, y: d.height, z: T }, { x: d.x0, y: d.y0, z: z0 }, species, { flip: true, holes: cups ? hingeCups(d.width, d.height, d.hinge) : [] });
      return;
    }
    const sp = shakerParts(d.width, d.height, Number(v.stile));
    const sw = sp.stile.width;
    const hingeL = d.hinge === 'left';
    const stileL = b.board(`${name} stile L`, { x: sw, y: d.height, z: T }, { x: d.x0, y: d.y0, z: z0 }, species,
      { flip: true, holes: cups && hingeL ? hingeCups(sw, d.height, 'left') : [] });
    const stileR = b.board(`${name} stile R`, { x: sw, y: d.height, z: T }, { x: d.x0 + d.width - sw, y: d.y0, z: z0 }, species,
      { flip: true, holes: cups && !hingeL ? hingeCups(sw, d.height, 'right') : [] });
    const railT = b.board(`${name} rail top`, { x: sp.rail.length, y: sw, z: T }, { x: d.x0 + sw, y: d.y0 + d.height - sw, z: z0 }, species, { flip: true });
    const railB = b.board(`${name} rail bottom`, { x: sp.rail.length, y: sw, z: T }, { x: d.x0 + sw, y: d.y0, z: z0 }, species, { flip: true });
    const panel = b.board(`${name} panel`, { x: sp.panel.width, y: sp.panel.height, z: sp.panel.thickness },
      { x: d.x0 + sw - sp.groove, y: d.y0 + sw - sp.groove, z: z0 + (T - sp.panel.thickness) / 2 }, species === 'mdf' ? 'mdf' : 'plywood', { flip: true });
    // Turned 180°: the left stile's inner edge is its local -x, the right one's +x.
    for (const rail of [railT, railB]) {
      b.joint('dowel', stileL, rail, '-x', 0, 0, { count: 2 });
      b.joint('dowel', stileR, rail, '+x', 0, 0, { count: 2 });
    }
    b.joint('dado', stileL, panel, '-x', sp.groove, sp.groove);
    b.joint('dado', stileR, panel, '+x', sp.groove, sp.groove);
    b.joint('dado', railT, panel, '-y', sp.groove, sp.groove);
    b.joint('dado', railB, panel, '+y', sp.groove, sp.groove);
  });
  return { parts: b.parts, joints: b.joints };
}

export interface FittingHardware { name: string; quantity: number }

export const slideName = (length: number, type: SlideType) => `Drawer slides ${length}" ${type === 'under' ? 'undermount' : 'side-mount'} (pairs)`;
export const hingeName = (mount: DoorMount, type: 'concealed' | 'butt') => (type === 'butt' ? 'Butt hinges' : `Hinges 35 mm concealed (${MOUNT_LABEL[mount]})`);

export function drawerHardware(raw: Input): FittingHardware[] {
  const { v, plan } = drawerPlanOf(raw);
  const n = plan.fronts.length;
  const out: FittingHardware[] = [];
  if (plan.slide) out.push({ name: slideName(plan.slide, v.slide as SlideType), quantity: n });
  out.push({ name: 'Pulls / knobs', quantity: n });
  return out;
}

export function doorHardware(raw: Input): FittingHardware[] {
  const { v, plan } = doorPlanOf(raw);
  const hinges = plan.doors.reduce((a, d) => a + hingeCount(d.height), 0);
  return [
    { name: hingeName(v.mount as DoorMount, v.hinge === 'butt' ? 'butt' : 'concealed'), quantity: hinges },
    { name: 'Pulls / knobs', quantity: plan.doors.length },
  ];
}

type Unit = Parameters<typeof formatSmallLen>[1];

/** One line under the setup form: what the numbers come out to. */
export function drawerNote(raw: Input, unit: Unit = 'in'): string {
  const { v, plan } = drawerPlanOf(raw);
  const f = (n: number) => formatSmallLen(n, unit);
  const b = plan.boxes[0];
  const slide = plan.slide ? `${plan.slide}" ${v.slide === 'under' ? 'undermount' : 'side-mount'} slides` : 'too shallow for 10" slides';
  const clear = v.slide === 'under' ? 'inside = opening − 42 mm, bottom recessed 1/2"' : '1/2" slide space each side';
  return `Box ${f(b.width)} wide × ${f(b.length)} deep · ${slide} · ${clear}`;
}

export function doorNote(raw: Input, unit: Unit = 'in'): string {
  const { v, plan } = doorPlanOf(raw);
  const f = (n: number) => formatSmallLen(n, unit);
  const d = plan.doors[0];
  const each = plan.doors.length > 1 ? ' each' : '';
  const hinges = `${hingeCount(d.height)} ${v.hinge === 'butt' ? 'butt hinges' : '35 mm hinges'}${each}`;
  return `Door ${f(d.width)} × ${f(d.height)}${each} · ${hinges}${v.hinge === 'butt' ? '' : ', cups 22.5 mm from the edge, 3" from the ends'}`;
}

export function drawerSummary(raw: Input, unit: Unit = 'in'): string {
  const { v, plan } = drawerPlanOf(raw);
  const f = (n: number) => formatSmallLen(n, unit);
  const n = plan.fronts.length;
  return [`${f(Number(v.width))} × ${f(Number(v.height))} × ${f(Number(v.depth))}`, `${n} ${n === 1 ? 'drawer' : 'drawers'}`, v.mount === 'inset' ? 'inset' : 'overlay',
    plan.slide ? `${plan.slide}" slides` : 'no slide fits'].join(' · ');
}

export function doorSummary(raw: Input, unit: Unit = 'in'): string {
  const { v, plan } = doorPlanOf(raw);
  const f = (n: number) => formatSmallLen(n, unit);
  return [`${f(Number(v.width))} × ${f(Number(v.height))}`, plan.doors.length === 2 ? 'pair' : 'single', MOUNT_LABEL[v.mount as DoorMount], v.style === 'shaker' ? 'shaker' : 'slab'].join(' · ');
}
