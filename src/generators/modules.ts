/**
 * Parametric cabinet modules (base, upper, bookshelf, window bench).
 * Coordinates: x centered on 0, y up from the floor, z from the wall face
 * (z = 0) into the room. Every part is an axis-aligned Board in sheet stock
 * (plywood carcass, MDF fronts). Pure.
 */
import type { FurnitureObject, ScannedOpening, WoodMaterial } from '../types/furniture';
import { defaultBoardOptions } from '../utils/boardGeometry';
import { PRESET_WOOD_MATERIALS } from '../utils/woodTextureGenerator';
import { obstaclesFor, type Span } from './fitMediaWall';

export type ModuleId = 'base-cabinet' | 'upper-cabinet' | 'bookshelf' | 'window-bench';
export type ModulePart = Omit<FurnitureObject, 'id'>;
export type ModuleInput = Record<string, number | string>;

export interface ModuleField {
  key: string;
  label: string;
  /** 'number' fields are inches unless `count` is set. */
  kind: 'number' | 'choice';
  min?: number;
  max?: number;
  count?: boolean;
  options?: { value: string; label: string }[];
}

export interface ModuleSpec {
  id: ModuleId;
  name: string;
  description: string;
  /** Modules on the same tier line up side by side on a wall. */
  tier: 'base' | 'upper';
  defaults: ModuleInput;
  fields: ModuleField[];
}

const T = 0.75; // carcass sheet
const BACK_T = 0.25;
const FRONT_T = 0.75;
const GAP = 0.125; // reveal between fronts
const r = (n: number) => Math.round(n * 1000) / 1000;

export const MODULES: ModuleSpec[] = [
  {
    id: 'base-cabinet', name: 'Base cabinet', description: 'Floor cabinet with doors or drawers and a toe kick.', tier: 'base',
    defaults: { width: 30, height: 34.5, depth: 24, fronts: 'doors', count: 2, toeKick: 4 },
    fields: [
      { key: 'width', label: 'Width', kind: 'number', min: 9, max: 60 },
      { key: 'height', label: 'Height', kind: 'number', min: 12, max: 42 },
      { key: 'depth', label: 'Depth', kind: 'number', min: 10, max: 30 },
      { key: 'fronts', label: 'Fronts', kind: 'choice', options: [{ value: 'doors', label: 'Doors' }, { value: 'drawers', label: 'Drawers' }] },
      { key: 'count', label: 'How many', kind: 'number', count: true, min: 1, max: 6 },
      { key: 'toeKick', label: 'Toe kick', kind: 'number', min: 0, max: 6 },
    ],
  },
  {
    id: 'upper-cabinet', name: 'Wall cabinet', description: 'Upper cabinet with doors and a shelf, hung on the wall.', tier: 'upper',
    defaults: { width: 30, height: 30, depth: 12, count: 2, shelves: 1, elevation: 54 },
    fields: [
      { key: 'width', label: 'Width', kind: 'number', min: 9, max: 60 },
      { key: 'height', label: 'Height', kind: 'number', min: 12, max: 48 },
      { key: 'depth', label: 'Depth', kind: 'number', min: 6, max: 18 },
      { key: 'count', label: 'Doors', kind: 'number', count: true, min: 1, max: 4 },
      { key: 'shelves', label: 'Shelves', kind: 'number', count: true, min: 0, max: 5 },
      { key: 'elevation', label: 'Bottom above floor', kind: 'number', min: 0, max: 96 },
    ],
  },
  {
    id: 'bookshelf', name: 'Bookshelf', description: 'Open shelving unit with fixed shelves.', tier: 'base',
    defaults: { width: 36, height: 72, depth: 12, shelves: 4 },
    fields: [
      { key: 'width', label: 'Width', kind: 'number', min: 12, max: 72 },
      { key: 'height', label: 'Height', kind: 'number', min: 18, max: 108 },
      { key: 'depth', label: 'Depth', kind: 'number', min: 6, max: 24 },
      { key: 'shelves', label: 'Shelves', kind: 'number', count: true, min: 0, max: 12 },
    ],
  },
  {
    id: 'window-bench', name: 'Window bench', description: 'Seat with open cubbies; centers under a window.', tier: 'base',
    defaults: { width: 60, height: 18, depth: 18, sections: 3, toeKick: 3 },
    fields: [
      { key: 'width', label: 'Width', kind: 'number', min: 18, max: 144 },
      { key: 'height', label: 'Seat height', kind: 'number', min: 12, max: 30 },
      { key: 'depth', label: 'Depth', kind: 'number', min: 12, max: 30 },
      { key: 'sections', label: 'Cubbies', kind: 'number', count: true, min: 1, max: 8 },
      { key: 'toeKick', label: 'Toe kick', kind: 'number', min: 0, max: 6 },
    ],
  },
];

export const findModule = (id: string) => MODULES.find((m) => m.id === id);

/** Defaults filled in, numbers clamped to each field's range, counts whole. */
export function normalizeModuleInput(id: ModuleId, input: ModuleInput): ModuleInput {
  const spec = findModule(id)!;
  const out: ModuleInput = {};
  for (const f of spec.fields) {
    const raw = input[f.key] ?? spec.defaults[f.key];
    if (f.kind === 'choice') {
      out[f.key] = f.options!.some((o) => o.value === raw) ? raw : spec.defaults[f.key];
      continue;
    }
    let n = typeof raw === 'number' && Number.isFinite(raw) ? raw : Number(spec.defaults[f.key]);
    if (f.count) n = Math.round(n);
    out[f.key] = Math.max(f.min ?? 0, Math.min(f.max ?? Infinity, n));
  }
  return out;
}

const plywood = (): WoodMaterial => ({ ...PRESET_WOOD_MATERIALS.plywood });
const mdf = (): WoodMaterial => ({ ...PRESET_WOOD_MATERIALS.mdf });

/** Board from its min corner and size. */
function board(name: string, size: { x: number; y: number; z: number }, min: { x: number; y: number; z: number }, material: WoodMaterial, tag: string): ModulePart {
  return {
    name,
    shape: 'board',
    dimensions: { length: r(size.x), height: r(size.y), width: r(size.z) },
    position: { x: r(min.x + size.x / 2), y: r(min.y + size.y / 2), z: r(min.z + size.z / 2) },
    rotation: { x: 0, y: 0, z: 0 },
    material,
    visible: true,
    board: defaultBoardOptions(),
    generator: tag,
  };
}

/** Sides, bottom, top and back of a box from y0 to y1, depth D (front at z = D). */
function carcass(tag: string, W: number, y0: number, y1: number, D: number, sidesToFloor = 0): ModulePart[] {
  const L = -W / 2;
  const inner = W - 2 * T;
  return [
    board('Side L', { x: T, y: y1 - sidesToFloor, z: D }, { x: L, y: sidesToFloor, z: 0 }, plywood(), tag),
    board('Side R', { x: T, y: y1 - sidesToFloor, z: D }, { x: W / 2 - T, y: sidesToFloor, z: 0 }, plywood(), tag),
    board('Bottom', { x: inner, y: T, z: D - BACK_T }, { x: L + T, y: y0, z: BACK_T }, plywood(), tag),
    board('Top', { x: inner, y: T, z: D - BACK_T }, { x: L + T, y: y1 - T, z: BACK_T }, plywood(), tag),
    board('Back', { x: inner, y: y1 - y0, z: BACK_T }, { x: L + T, y: y0, z: 0 }, plywood(), tag),
  ];
}

/** Evenly spaced shelves between the inside faces of bottom and top. */
function shelves(tag: string, n: number, W: number, y0: number, y1: number, D: number, inset = 0.25): ModulePart[] {
  const out: ModulePart[] = [];
  const clear = y1 - y0 - 2 * T;
  for (let i = 1; i <= n; i++) {
    const y = y0 + T + (clear - n * T) * (i / (n + 1)) + (i - 1) * T;
    out.push(board(`Shelf ${i}`, { x: W - 2 * T, y: T, z: D - BACK_T - inset }, { x: -W / 2 + T, y, z: BACK_T }, plywood(), tag));
  }
  return out;
}

function doors(tag: string, n: number, W: number, y0: number, y1: number, D: number): ModulePart[] {
  const w = (W - GAP * (n + 1)) / n;
  return Array.from({ length: n }, (_, i) =>
    board(n === 1 ? 'Door' : `Door ${i + 1}`, { x: w, y: y1 - y0 - 2 * GAP, z: FRONT_T }, { x: -W / 2 + GAP + i * (w + GAP), y: y0 + GAP, z: D }, mdf(), tag));
}

function drawers(tag: string, n: number, W: number, y0: number, y1: number, D: number): ModulePart[] {
  const h = (y1 - y0 - GAP * (n + 1)) / n;
  return Array.from({ length: n }, (_, i) =>
    board(`Drawer front ${n - i}`, { x: W - 2 * GAP, y: h, z: FRONT_T }, { x: -W / 2 + GAP, y: y0 + GAP + i * (h + GAP), z: D }, mdf(), tag));
}

/** Parts for a module at the origin (wall-local). */
export function generateModule(id: ModuleId, raw: ModuleInput): ModulePart[] {
  const v = normalizeModuleInput(id, raw);
  const W = Number(v.width), H = Number(v.height), D = Number(v.depth);
  const tag = id;
  switch (id) {
    case 'base-cabinet': {
      const toe = Number(v.toeKick);
      const parts = carcass(tag, W, toe, H, D);
      if (toe > 0) parts.push(board('Toe kick', { x: W - 2 * T, y: toe, z: T }, { x: -W / 2 + T, y: 0, z: D - 3 - T }, plywood(), tag));
      const n = Number(v.count);
      parts.push(...(v.fronts === 'drawers' ? drawers(tag, n, W, toe, H, D) : doors(tag, n, W, toe, H, D)));
      return parts;
    }
    case 'upper-cabinet': {
      const y0 = Number(v.elevation), y1 = y0 + H;
      return [...carcass(tag, W, y0, y1, D, y0), ...shelves(tag, Number(v.shelves), W, y0, y1, D), ...doors(tag, Number(v.count), W, y0, y1, D)];
    }
    case 'bookshelf':
      return [...carcass(tag, W, 0, H, D), ...shelves(tag, Number(v.shelves), W, 0, H, D)];
    case 'window-bench': {
      const toe = Number(v.toeKick);
      const seatT = 1;
      const boxTop = H - seatT;
      const parts = carcass(tag, W, toe, boxTop, D).filter((p) => p.name !== 'Top');
      const n = Number(v.sections);
      const cell = (W - 2 * T - (n - 1) * T) / n;
      for (let i = 1; i < n; i++) {
        parts.push(board(`Divider ${i}`, { x: T, y: boxTop - toe - T, z: D - BACK_T }, { x: -W / 2 + T + i * cell + (i - 1) * T, y: toe + T, z: BACK_T }, plywood(), tag));
      }
      parts.push(board('Seat', { x: W, y: seatT, z: D + 1 }, { x: -W / 2, y: boxTop, z: 0 }, plywood(), tag));
      if (toe > 0) parts.push(board('Toe kick', { x: W - 2 * T, y: toe, z: T }, { x: -W / 2 + T, y: 0, z: D - 3 - T }, plywood(), tag));
      return parts;
    }
  }
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
  const parts = generateModule(id, v).map((p) => ({ ...p, position: { ...p.position, x: r(p.position.x + center!) } }));
  return { parts, center: r(center), width: r(W), input: v };
}
