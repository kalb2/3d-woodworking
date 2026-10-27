/**
 * Parametric cabinet modules (base, upper, bookshelf, window bench).
 * Coordinates: x centered on 0, y up from the floor, z from the wall face
 * (z = 0) into the room. Every part is an axis-aligned Board in sheet stock,
 * joined like a real carcass: fixed shelves, tops and bottoms in dados or
 * rabbets in the sides, a 1/4" back in a rabbet, face frames pocket-screwed,
 * adjustable shelves on shelf pins. Pure.
 */
import type { BoardHole, FurnitureObject, Joint, JointType, ScannedOpening, WoodMaterial, WoodSpecies } from '../types/furniture';
import { defaultBoardOptions } from '../utils/boardGeometry';
import { PRESET_WOOD_MATERIALS } from '../utils/woodTextureGenerator';
import { obstaclesFor, type Span } from './fitMediaWall';

export type ModuleId = 'base-cabinet' | 'upper-cabinet' | 'bookshelf' | 'window-bench';
export type ModulePart = Omit<FurnitureObject, 'id'>;
export type ModuleInput = Record<string, number | string>;

export interface ModuleField {
  key: string;
  label: string;
  /** 'number' fields are inches unless `count` is set (whole numbers, shown as a stepper). */
  kind: 'number' | 'choice';
  min?: number;
  max?: number;
  count?: boolean;
  options?: { value: string; label: string }[];
  /** Shown under "More options" (progressive disclosure). */
  advanced?: boolean;
  /** Only shown when this returns true for the current values. */
  show?: (values: ModuleInput) => boolean;
}

export interface ModuleSpec {
  id: ModuleId;
  name: string;
  description: string;
  /** Modules on the same tier line up side by side on a wall. */
  tier: 'base' | 'upper';
  defaults: ModuleInput;
  fields: ModuleField[];
  /** Overall size params, for group resize (world x / y / z of an unturned group). */
  size: { x: string; y: string; z: string };
}

/** A joint between two generated parts, by index into the part list. */
export interface ModuleJoint {
  type: JointType;
  receiver: number;
  mater: number;
  face: Joint['face'];
  depth: number;
  extended: number;
  count?: number;
  fasten?: Joint['fasten'];
}

export interface ModuleBuild { parts: ModulePart[]; joints: ModuleJoint[] }

/** Input format version written by the setup sheet (older saves get the old look for new options). */
export const MODULE_INPUT_VERSION = 2;
const BACK_T = 0.25;
const GAP = 0.125; // reveal between fronts
const STILE = 1.5;
const PIN_D = 0.25;
const PIN_PITCH = 1.25;
const r = (n: number) => Math.round(n * 10000) / 10000;
const r16 = (n: number) => Math.max(0.0625, Math.round(n * 16) / 16);

export const MODULE_MATERIALS: { value: WoodSpecies; label: string }[] = [
  { value: 'plywood', label: 'Plywood' },
  { value: 'birch', label: 'Birch' },
  { value: 'oak', label: 'Oak' },
  { value: 'walnut', label: 'Walnut' },
  { value: 'cherry', label: 'Cherry' },
  { value: 'mdf', label: 'MDF (paint)' },
];

const F = {
  width: (min: number, max: number): ModuleField => ({ key: 'width', label: 'Width', kind: 'number', min, max }),
  height: (min: number, max: number, label = 'Height'): ModuleField => ({ key: 'height', label, kind: 'number', min, max }),
  depth: (min: number, max: number): ModuleField => ({ key: 'depth', label: 'Depth', kind: 'number', min, max }),
  doors: (): ModuleField => ({ key: 'doors', label: 'Doors', kind: 'choice', options: [{ value: 'none', label: 'None' }, { value: '1', label: '1 door' }, { value: '2', label: '2 doors' }] }),
  shelves: (max: number): ModuleField => ({ key: 'shelves', label: 'Shelves', kind: 'number', count: true, min: 0, max }),
  toeKick: (): ModuleField => ({ key: 'toeKick', label: 'Toe kick', kind: 'number', min: 0, max: 6, advanced: true }),
  thickness: (): ModuleField => ({ key: 'thickness', label: 'Board thickness', kind: 'number', min: 0.5, max: 1.5, advanced: true }),
  material: (): ModuleField => ({ key: 'material', label: 'Material', kind: 'choice', options: MODULE_MATERIALS, advanced: true }),
  shelfStyle: (): ModuleField => ({ key: 'shelfStyle', label: 'Shelves are', kind: 'choice', options: [{ value: 'adjustable', label: 'Adjustable (pins)' }, { value: 'fixed', label: 'Fixed (dados)' }], advanced: true }),
  back: (): ModuleField => ({ key: 'back', label: 'Back', kind: 'choice', options: [{ value: 'rabbet', label: '1/4" back' }, { value: 'none', label: 'No back' }], advanced: true }),
  faceFrame: (): ModuleField => ({ key: 'faceFrame', label: 'Front', kind: 'choice', options: [{ value: 'none', label: 'Frameless' }, { value: 'yes', label: 'Face frame' }], advanced: true }),
};

const COMMON = { thickness: 0.75, material: 'plywood', back: 'rabbet' };

export const MODULES: ModuleSpec[] = [
  {
    id: 'base-cabinet', name: 'Base cabinet', description: 'Floor cabinet with doors, drawers, shelves and a toe kick.', tier: 'base',
    defaults: { width: 30, height: 34.5, depth: 24, doors: '2', drawers: 0, shelves: 1, toeKick: 4, shelfStyle: 'adjustable', faceFrame: 'none', ...COMMON },
    size: { x: 'width', y: 'height', z: 'depth' },
    fields: [F.width(9, 60), F.height(12, 42), F.depth(10, 30), F.doors(),
      { key: 'drawers', label: 'Drawers', kind: 'number', count: true, min: 0, max: 4 }, F.shelves(3),
      F.toeKick(), F.thickness(), F.material(), F.shelfStyle(), F.back(), F.faceFrame()],
  },
  {
    id: 'upper-cabinet', name: 'Upper cabinet', description: 'Wall cabinet with doors and shelves, hung on the wall.', tier: 'upper',
    defaults: { width: 30, height: 30, depth: 12, doors: '2', shelves: 2, elevation: 54, shelfStyle: 'adjustable', faceFrame: 'none', ...COMMON },
    size: { x: 'width', y: 'height', z: 'depth' },
    fields: [F.width(9, 60), F.height(12, 48), F.depth(6, 18), F.doors(), F.shelves(5),
      { key: 'elevation', label: 'Bottom above floor', kind: 'number', min: 0, max: 96 },
      F.thickness(), F.material(), F.shelfStyle(), F.back(), F.faceFrame()],
  },
  {
    id: 'bookshelf', name: 'Bookshelf', description: 'Open shelving unit; fixed or adjustable shelves.', tier: 'base',
    defaults: { width: 36, height: 72, depth: 12, shelves: 4, toeKick: 3, shelfStyle: 'fixed', faceFrame: 'none', ...COMMON },
    size: { x: 'width', y: 'height', z: 'depth' },
    fields: [F.width(12, 72), F.height(18, 108), F.depth(6, 24), F.shelves(12),
      F.toeKick(), F.thickness(), F.material(), F.shelfStyle(), F.back(), F.faceFrame()],
  },
  {
    id: 'window-bench', name: 'Window bench', description: 'Seat with open cubbies; centers under a window.', tier: 'base',
    defaults: { width: 60, height: 18, depth: 18, sections: 3, toeKick: 3, ...COMMON },
    size: { x: 'width', y: 'height', z: 'depth' },
    fields: [F.width(18, 144), F.height(12, 30, 'Seat height'), F.depth(12, 30),
      { key: 'sections', label: 'Cubbies', kind: 'number', count: true, min: 1, max: 8 },
      F.toeKick(), F.thickness(), F.material(), F.back()],
  },
];

/** Values for options added in v2, used for saves made before them (so they rebuild unchanged). */
const LEGACY: Partial<Record<ModuleId, ModuleInput>> = {
  'base-cabinet': { shelves: 0, shelfStyle: 'fixed', material: 'plywood' },
  'upper-cabinet': { shelfStyle: 'fixed' },
  bookshelf: { toeKick: 0 },
};

export const findModule = (id: string) => MODULES.find((m) => m.id === id);

/** Old base/upper inputs used fronts + count. */
function migrate(id: ModuleId, raw: ModuleInput): ModuleInput {
  if (raw.doors !== undefined || raw.count === undefined) return raw;
  const n = Number(raw.count);
  if (id === 'base-cabinet' && raw.fronts === 'drawers') return { ...raw, doors: 'none', drawers: n };
  if (id === 'base-cabinet' || id === 'upper-cabinet') return { ...raw, doors: n >= 2 ? '2' : '1' };
  return raw;
}

/** Defaults filled in, numbers clamped to each field's range, counts whole. */
export function normalizeModuleInput(id: ModuleId, input: ModuleInput): ModuleInput {
  const spec = findModule(id)!;
  const raw = migrate(id, input);
  const defaults = raw.v === MODULE_INPUT_VERSION || raw.v === undefined && Object.keys(raw).length === 0 ? spec.defaults : { ...spec.defaults, ...(LEGACY[id] ?? {}) };
  const out: ModuleInput = { v: MODULE_INPUT_VERSION };
  for (const f of spec.fields) {
    const val = raw[f.key] ?? defaults[f.key];
    if (f.kind === 'choice') {
      out[f.key] = f.options!.some((o) => o.value === val) ? val : defaults[f.key];
      continue;
    }
    let n = typeof val === 'number' && Number.isFinite(val) ? val : Number(val);
    if (!Number.isFinite(n)) n = Number(defaults[f.key]);
    if (f.count) n = Math.round(n);
    out[f.key] = Math.max(f.min ?? 0, Math.min(f.max ?? Infinity, n));
  }
  return out;
}

const materialOf = (species: string): WoodMaterial => ({ ...(PRESET_WOOD_MATERIALS[species as WoodSpecies] ?? PRESET_WOOD_MATERIALS.plywood) });

/** Collects boards and the joints between them. */
class Builder {
  parts: ModulePart[] = [];
  joints: ModuleJoint[] = [];
  readonly tag: string;
  readonly T: number;
  readonly species: string;
  constructor(tag: string, T: number, species: string) { this.tag = tag; this.T = T; this.species = species; }
  get dado() { return r16(this.T / 3); }
  get rabbet() { return r16(this.T / 2); }
  /** Board from its min corner and size; `flip` turns it 180° so its local +x faces -x (right-hand parts). */
  board(name: string, size: { x: number; y: number; z: number }, min: { x: number; y: number; z: number }, opts: { species?: string; flip?: boolean; holes?: BoardHole[] } = {}): number {
    this.parts.push({
      name,
      shape: 'board',
      dimensions: { length: r(size.x), height: r(size.y), width: r(size.z) },
      position: { x: r(min.x + size.x / 2), y: r(min.y + size.y / 2), z: r(min.z + size.z / 2) },
      rotation: { x: 0, y: opts.flip ? 180 : 0, z: 0 },
      material: materialOf(opts.species ?? this.species),
      visible: true,
      board: { ...defaultBoardOptions(), holes: opts.holes ?? [] },
      generator: this.tag,
    });
    return this.parts.length - 1;
  }
  joint(type: JointType, receiver: number, mater: number, face: Joint['face'], depth = 0, extended = 0, extra: Partial<ModuleJoint> = {}) {
    this.joints.push({ type, receiver, mater, face, depth: r(depth), extended: r(extended), ...extra });
  }
}

interface Box { W: number; D: number; y0: number; y1: number; sidesFrom: number; top: boolean; back: boolean }
interface Carcass { L: number; R: number; bottom: number; top?: number; zf: number; inner: number }

/**
 * Two sides (right one turned so both inside faces are local +x), a bottom and
 * a top housed in the sides (rabbet at an edge, else dado), and a 1/4" back
 * in a rabbet. The panels are lengthened into their grooves.
 */
function carcass(b: Builder, c: Box): Carcass {
  const { T } = b;
  const { W, D, y0, y1, sidesFrom } = c;
  const L = b.board('Side L', { x: T, y: y1 - sidesFrom, z: D }, { x: -W / 2, y: sidesFrom, z: 0 });
  const R = b.board('Side R', { x: T, y: y1 - sidesFrom, z: D }, { x: W / 2 - T, y: sidesFrom, z: 0 }, { flip: true });
  const zf = c.back ? BACK_T : 0;
  const inner = W - 2 * T;
  const housed = (name: string, y: number, atEdge: boolean) => {
    const g = atEdge ? b.rabbet : b.dado;
    const i = b.board(name, { x: inner + 2 * g, y: T, z: D - zf }, { x: -W / 2 + T - g, y, z: zf });
    for (const s of [L, R]) b.joint(atEdge ? 'rabbet' : 'dado', s, i, '+x', g, g);
    return i;
  };
  const bottom = housed('Bottom', y0, Math.abs(y0 - sidesFrom) < 1e-6);
  const top = c.top ? housed('Top', y1 - T, true) : undefined;
  if (c.back) {
    const g = b.rabbet;
    const back = b.board('Back', { x: inner + 2 * g, y: y1 - y0, z: BACK_T }, { x: -W / 2 + T - g, y: y0, z: 0 }, { species: b.species === 'mdf' ? 'mdf' : 'plywood' });
    for (const s of [L, R]) b.joint('rabbet', s, back, '+x', g, g);
  }
  return { L, R, bottom, top, zf, inner };
}

/** Bottom faces (y) of n shelves spaced evenly in the clear between a and b. */
function shelfLevels(n: number, a: number, bTop: number, T: number): number[] {
  const clear = bTop - a;
  return Array.from({ length: n }, (_, k) => { const i = k + 1; return a + (clear - n * T) * (i / (n + 1)) + (i - 1) * T; });
}

/** Shelf-pin holes on a side's inside face (local +x = 'side' face) around each shelf level. */
function pinHoles(b: Builder, c: Carcass, D: number, side: number, levels: number[], lo: number, hi: number): BoardHole[] {
  const p = b.parts[side];
  const flip = p.rotation.y === 180;
  const zc = p.position.z, yc = p.position.y;
  const cols = [c.zf + 1.5, D - 1.5];
  const out: BoardHole[] = [];
  const depth = r(Math.min(0.375, b.T * 0.6));
  for (const y of levels) for (const dy of [-PIN_PITCH, 0, PIN_PITCH]) {
    const yy = y + dy;
    if (yy < lo + 0.5 || yy > hi - 0.5) continue;
    for (const z of cols) {
      out.push({ id: `pin_${out.length}`, face: 'side', kind: 'round', diameter: PIN_D, depth, x: r((flip ? -1 : 1) * (z - zc)), z: r(yy - yc) });
    }
  }
  return out;
}

/** Shelves between the inside faces a (top of the bottom) and bTop (underside of the top). */
function shelves(b: Builder, c: Carcass, n: number, W: number, D: number, a: number, bTop: number, style: string, inset = 0.25) {
  if (n <= 0) return;
  const { T } = b;
  const levels = shelfLevels(n, a, bTop, T);
  const depth = D - c.zf - inset;
  if (style === 'adjustable') {
    levels.forEach((y, k) => b.board(`Shelf ${k + 1}`, { x: c.inner - 0.0625, y: T, z: depth }, { x: -W / 2 + T + 0.03125, y, z: c.zf }));
    for (const s of [c.L, c.R]) {
      const holes = pinHoles(b, c, D, s, levels, a, bTop);
      b.parts[s] = { ...b.parts[s], board: { ...b.parts[s].board!, holes: [...b.parts[s].board!.holes, ...holes] } };
    }
    return;
  }
  const g = b.dado;
  levels.forEach((y, k) => {
    const i = b.board(`Shelf ${k + 1}`, { x: c.inner + 2 * g, y: T, z: depth }, { x: -W / 2 + T - g, y, z: c.zf });
    for (const s of [c.L, c.R]) b.joint('dado', s, i, '+x', g, g);
  });
}

/** Stiles and rails in front of the carcass; rails pocket-screwed into the stiles. `rails` = y of each rail's bottom. */
function faceFrame(b: Builder, W: number, D: number, y0: number, y1: number, rails: number[]) {
  const { T } = b;
  const L = b.board('Stile L', { x: STILE, y: y1 - y0, z: T }, { x: -W / 2, y: y0, z: D });
  const R = b.board('Stile R', { x: STILE, y: y1 - y0, z: T }, { x: W / 2 - STILE, y: y0, z: D }, { flip: true });
  rails.forEach((y, k) => {
    const name = k === 0 ? 'Rail bottom' : k === rails.length - 1 ? 'Rail top' : `Rail ${k}`;
    const i = b.board(name, { x: W - 2 * STILE, y: STILE, z: T }, { x: -W / 2 + STILE, y, z: D });
    for (const s of [L, R]) b.joint('pocket', s, i, '+x', 0, 0, { count: 2 });
  });
}

/** Slab doors over y0..y1 (full overlay). */
function doors(b: Builder, n: number, W: number, y0: number, y1: number, z: number) {
  if (n <= 0) return;
  const w = (W - GAP * (n + 1)) / n;
  for (let i = 0; i < n; i++) b.board(n === 1 ? 'Door' : `Door ${i + 1}`, { x: w, y: y1 - y0 - 2 * GAP, z: b.T }, { x: -W / 2 + GAP + i * (w + GAP), y: y0 + GAP, z });
}

/** Drawer slide length that fits the inside depth (whole even inches, 10–28). */
export const slideLength = (insideDepth: number) => Math.max(10, Math.min(28, Math.floor((insideDepth - 1) / 2) * 2));

/** A drawer: slab front plus a 1/2" box (bottom in dados) on side-mount slides. */
function drawer(b: Builder, k: number, W: number, D: number, zf: number, y0: number, h: number, zFront: number) {
  const { T } = b;
  b.board(`Drawer front ${k}`, { x: W - 2 * GAP, y: h, z: T }, { x: -W / 2 + GAP, y: y0, z: zFront });
  const s = 0.5, bt = 0.25, gd = 0.25;
  const bw = W - 2 * T - 1; // 1/2" slide clearance each side
  const len = slideLength(D - zf);
  const bh = Math.max(2, h - 1.5);
  const by = y0 + 0.75;
  const bz = D - len;
  const x0 = -bw / 2;
  const sl = b.board(`Drawer ${k} side L`, { x: s, y: bh, z: len }, { x: x0, y: by, z: bz }, { species: 'birch' });
  const sr = b.board(`Drawer ${k} side R`, { x: s, y: bh, z: len }, { x: -x0 - s, y: by, z: bz }, { species: 'birch', flip: true });
  const fr = b.board(`Drawer ${k} front`, { x: bw - 2 * s, y: bh, z: s }, { x: x0 + s, y: by, z: D - s }, { species: 'birch' });
  const bk = b.board(`Drawer ${k} back`, { x: bw - 2 * s, y: bh, z: s }, { x: x0 + s, y: by, z: bz }, { species: 'birch' });
  const bo = b.board(`Drawer ${k} bottom`, { x: bw - 2 * s + 2 * gd, y: bt, z: len - 2 * s }, { x: x0 + s - gd, y: by + 0.5, z: bz + s }, { species: 'plywood' });
  for (const side of [sl, sr]) {
    b.joint('butt', side, fr, '+x', 0, 0, { fasten: 'glue-screws' });
    b.joint('butt', side, bk, '+x', 0, 0, { fasten: 'glue-screws' });
    b.joint('dado', side, bo, '+x', gd, gd);
  }
}

/** Parts and joints for a module at the origin (wall-local). */
export function buildModule(id: ModuleId, raw: ModuleInput): ModuleBuild {
  const v = normalizeModuleInput(id, raw);
  const W = Number(v.width), H = Number(v.height), D = Number(v.depth);
  const T = Number(v.thickness);
  const b = new Builder(id, T, String(v.material));
  const back = v.back !== 'none';
  const framed = v.faceFrame === 'yes';
  const zFront = D + (framed ? T : 0);
  switch (id) {
    case 'base-cabinet': {
      const toe = Number(v.toeKick);
      const c = carcass(b, { W, D, y0: toe, y1: H, sidesFrom: 0, top: true, back });
      if (toe > 0) b.board('Toe kick', { x: W - 2 * T, y: toe, z: T }, { x: -W / 2 + T, y: 0, z: D - 3 - T });
      const nDoors = v.doors === 'none' ? 0 : Number(v.doors);
      const nDrawers = Number(v.drawers);
      const faceH = H - toe;
      // Drawers stack from the top: 6 1/2" each over doors, or share the whole front.
      const slot = nDoors > 0 ? Math.min(6.5, faceH / (2 * Math.max(1, nDrawers))) : faceH / Math.max(1, nDrawers);
      const zone = nDrawers * slot;
      const splitY = H - zone;
      let shelfTop = H - T;
      if (nDrawers > 0 && nDoors > 0) {
        // Fixed divider under the drawers.
        const g = b.dado;
        const i = b.board('Divider', { x: c.inner + 2 * g, y: T, z: D - c.zf }, { x: -W / 2 + T - g, y: splitY - T, z: c.zf });
        for (const s of [c.L, c.R]) b.joint('dado', s, i, '+x', g, g);
        shelfTop = splitY - T;
      }
      if (nDoors > 0 || nDrawers === 0) shelves(b, c, Number(v.shelves), W, D, toe + T, shelfTop, String(v.shelfStyle));
      for (let k = 0; k < nDrawers; k++) {
        const top = H - k * slot;
        drawer(b, k + 1, W, D, c.zf, top - slot + GAP, slot - 2 * GAP, zFront);
      }
      if (nDoors > 0) doors(b, nDoors, W, toe, nDrawers > 0 ? splitY : H, zFront);
      if (framed) {
        const rails = [toe, ...Array.from({ length: nDrawers }, (_, k) => H - (k + 1) * slot - STILE / 2).filter((y) => y > toe + STILE), H - STILE];
        faceFrame(b, W, D, toe, H, [...new Set(rails.map(r))].sort((p, q) => p - q));
      }
      break;
    }
    case 'upper-cabinet': {
      const y0 = Number(v.elevation), y1 = y0 + H;
      const c = carcass(b, { W, D, y0, y1, sidesFrom: y0, top: true, back });
      shelves(b, c, Number(v.shelves), W, D, y0 + T, y1 - T, String(v.shelfStyle));
      const n = v.doors === 'none' ? 0 : Number(v.doors);
      doors(b, n, W, y0, y1, zFront);
      if (framed) faceFrame(b, W, D, y0, y1, [y0, y1 - STILE]);
      break;
    }
    case 'bookshelf': {
      const toe = Number(v.toeKick);
      const c = carcass(b, { W, D, y0: toe, y1: H, sidesFrom: 0, top: true, back });
      if (toe > 0) b.board('Toe kick', { x: W - 2 * T, y: toe, z: T }, { x: -W / 2 + T, y: 0, z: D - T - 0.25 });
      shelves(b, c, Number(v.shelves), W, D, toe + T, H - T, String(v.shelfStyle));
      if (framed) faceFrame(b, W, D, toe, H, [toe, H - STILE]);
      break;
    }
    case 'window-bench': {
      const toe = Number(v.toeKick);
      const seatT = Math.max(1, T);
      const boxTop = H - seatT;
      const c = carcass(b, { W, D, y0: toe, y1: boxTop, sidesFrom: 0, top: false, back });
      const n = Number(v.sections);
      const cell = (c.inner - (n - 1) * T) / n;
      const g = b.dado;
      const dividers: number[] = [];
      for (let i = 1; i < n; i++) {
        const d = b.board(`Divider ${i}`, { x: T, y: boxTop - toe - T + g, z: D - c.zf }, { x: -W / 2 + T + i * cell + (i - 1) * T, y: toe + T - g, z: c.zf });
        b.joint('dado', c.bottom, d, '+y', g, g);
        dividers.push(d);
      }
      const seat = b.board('Seat', { x: W, y: seatT, z: D + 1 }, { x: -W / 2, y: boxTop, z: 0 });
      for (const s of [c.L, c.R]) b.joint('pocket', seat, s, '-y', 0, 0, { count: 3 });
      for (const d of dividers) b.joint('pocket', seat, d, '-y', 0, 0, { count: 2 });
      if (toe > 0) b.board('Toe kick', { x: W - 2 * T, y: toe, z: T }, { x: -W / 2 + T, y: 0, z: D - 3 - T });
      break;
    }
  }
  return { parts: b.parts, joints: b.joints };
}

/** Parts only (older callers). */
export function generateModule(id: ModuleId, raw: ModuleInput): ModulePart[] {
  return buildModule(id, raw).parts;
}

export interface ModuleHardware { name: string; quantity: number }

/** Hardware a module needs beyond its joints: hinges, slides, shelf pins, pulls. */
export function moduleHardware(id: ModuleId, raw: ModuleInput): ModuleHardware[] {
  const v = normalizeModuleInput(id, raw);
  const out: ModuleHardware[] = [];
  const nDoors = v.doors === undefined || v.doors === 'none' ? 0 : Number(v.doors);
  const nDrawers = id === 'base-cabinet' ? Number(v.drawers) : 0;
  if (nDoors > 0) {
    const doorH = Number(v.height) - (id === 'base-cabinet' ? Number(v.toeKick) : 0);
    const per = doorH > 60 ? 4 : doorH > 40 ? 3 : 2;
    out.push({ name: 'Hinges (concealed)', quantity: nDoors * per });
  }
  if (nDrawers > 0) out.push({ name: `Drawer slides ${slideLength(Number(v.depth) - (v.back === 'none' ? 0 : BACK_T))}" (pairs)`, quantity: nDrawers });
  if (nDoors + nDrawers > 0) out.push({ name: 'Pulls / knobs', quantity: nDoors + nDrawers });
  const pinned = v.shelfStyle === 'adjustable' && Number(v.shelves) > 0 && !(id === 'base-cabinet' && nDoors === 0 && nDrawers > 0);
  if (pinned) out.push({ name: 'Shelf pins 1/4"', quantity: Number(v.shelves) * 4 });
  return out;
}

/** Vertical range a module occupies (for opening checks). */
function moduleYRange(id: ModuleId, v: ModuleInput): [number, number] {
  if (id === 'upper-cabinet') return [Number(v.elevation), Number(v.elevation) + Number(v.height)];
  return [0, Number(v.height)];
}

/** Clear stretches of a wall for a y range: any opening overlapping it blocks its width. */
export function clearSpans(wall: { width: number; openings: ScannedOpening[] }, y0: number, y1: number): Span[] {
  const blocks = obstaclesFor(wall.width, wall.openings)
    .filter((o) => o.y0 < y1 && o.y1 > y0)
    .map((o) => ({ x0: Math.max(-wall.width / 2, o.x0), x1: Math.min(wall.width / 2, o.x1) }))
    .sort((a, b) => a.x0 - b.x0);
  const out: Span[] = [];
  let cur = -wall.width / 2;
  for (const b of blocks) {
    if (b.x0 > cur) out.push({ x0: r(cur), x1: r(b.x0) });
    cur = Math.max(cur, b.x1);
  }
  if (cur < wall.width / 2) out.push({ x0: r(cur), x1: r(wall.width / 2) });
  return out.filter((s) => s.x1 - s.x0 >= 1);
}

export interface ModuleFitOptions {
  /** Keep this wall-local center (editing an existing module). */
  center?: number;
  /** Same-tier modules already on this wall: wall-local [x0, x1]. */
  occupied?: Span[];
}

/**
 * Fit a module to a scanned wall. New modules pack side by side after the
 * same-tier modules already on the wall (left to right, skipping openings);
 * a window bench centers under the widest window it fits below. Width is
 * clamped to the clear stretch. Pure.
 */
export function fitModule(id: ModuleId, raw: ModuleInput, wall: { width: number; height: number; openings: ScannedOpening[] }, opts: ModuleFitOptions = {}) {
  let v = normalizeModuleInput(id, raw);
  const [y0, y1] = moduleYRange(id, v);
  const spans = clearSpans(wall, y0, Math.min(y1, wall.height));
  let W = Number(v.width);
  let center: number | undefined = opts.center;

  if (center === undefined && id === 'window-bench') {
    const win = obstaclesFor(wall.width, wall.openings).filter((o) => o.kind === 'window' && o.y0 >= y1).sort((a, b) => (b.x1 - b.x0) - (a.x1 - a.x0))[0];
    if (win) {
      const c = (win.x0 + win.x1) / 2;
      const span = spans.find((s) => c >= s.x0 && c <= s.x1);
      if (span) center = c;
    }
  }
  if (center === undefined) {
    const occ = [...(opts.occupied ?? [])].sort((a, b) => a.x0 - b.x0);
    const candidates = spans.flatMap((s) => [s.x0, ...occ.map((o) => o.x1).filter((x) => x >= s.x0 && x < s.x1)]).sort((a, b) => a - b);
    const free = (x0: number) => spans.some((s) => x0 >= s.x0 - 1e-6 && x0 + W <= s.x1 + 1e-6) && !occ.some((o) => x0 < o.x1 - 1e-6 && x0 + W > o.x0 + 1e-6);
    const x0 = candidates.find(free);
    if (x0 !== undefined) center = x0 + W / 2;
  }
  const span = (center !== undefined ? spans.find((s) => center! >= s.x0 && center! <= s.x1) : undefined)
    ?? spans.reduce<Span | null>((b, s) => (!b || s.x1 - s.x0 > b.x1 - b.x0 ? s : b), null);
  if (span) {
    W = Math.min(W, span.x1 - span.x0);
    center = Math.max(span.x0 + W / 2, Math.min(span.x1 - W / 2, center ?? span.x0 + W / 2));
  } else {
    W = Math.min(W, wall.width);
    center = 0;
  }
  // Tall units never poke above the ceiling.
  if (id !== 'upper-cabinet' && Number(v.height) > wall.height) v = { ...v, height: wall.height };
  if (id === 'upper-cabinet' && y1 > wall.height) v = { ...v, elevation: Math.max(0, wall.height - Number(v.height)) };
  v = normalizeModuleInput(id, { ...v, width: W });
  W = Number(v.width);
  const built = buildModule(id, v);
  const parts = built.parts.map((p) => ({ ...p, position: { ...p.position, x: r(p.position.x + center!) } }));
  return { parts, joints: built.joints, center: r(center), width: r(W), input: v };
}
