/**
 * "Describe it": the compact design spec the AI returns, its JSON schema, the
 * system prompt and a strict parser. No app imports, so the Worker can bundle it.
 *
 * Two shapes:
 * - template: one of the app's parametric built-ins with a few parameters.
 * - boards: a list of boards (lumber or sheet goods), each placed by its
 *   min corner after turning, plus joints between them by index.
 * Units are inches. x runs left→right, y up from the floor, z from the back (0) to the front.
 */

export const AI_TEMPLATES = ['base-cabinet', 'upper-cabinet', 'bookshelf', 'window-bench'] as const;
export type AiTemplate = (typeof AI_TEMPLATES)[number];

/** Dimensional pine, surfaced size: thickness × width. */
export const LUMBER_STOCK = { '1x2': [0.75, 1.5], '2x2': [1.5, 1.5], '2x4': [1.5, 3.5], '2x6': [1.5, 5.5] } as const;
export type LumberStock = keyof typeof LUMBER_STOCK;
export type AiStock = LumberStock | 'sheet';
export const SHEET_MATERIALS = ['plywood', 'mdf'] as const;
export type SheetMaterial = (typeof SHEET_MATERIALS)[number];
export const SHEET_THICKNESSES = [0.25, 0.5, 0.75] as const;
export const AI_JOINTS = ['butt', 'dado', 'rabbet', 'pocket', 'dowel'] as const;
export type AiJointType = (typeof AI_JOINTS)[number];

export interface AiTemplateParams {
  width?: number;
  height?: number;
  depth?: number;
  shelves?: number;
  /** 0, 1 or 2. */
  doors?: number;
  drawers?: number;
  /** Window bench cubbies. */
  sections?: number;
  material?: string;
}

export interface AiRotation { x: number; y: number; z: number }

export interface AiBoard {
  name: string;
  stock: AiStock;
  /** Sheet goods only. */
  material?: SheetMaterial;
  /** Sheet goods only (1/4, 1/2 or 3/4). Lumber thickness comes from its stock. */
  thickness?: number;
  length: number;
  /** Sheet goods only. Lumber width comes from its stock. */
  width?: number;
  /** Min corner of the turned board. */
  x: number;
  y: number;
  z: number;
  /** Degrees, multiples of 90. Unturned: length along x, thickness up (y), width along z. */
  rotation: AiRotation;
}

export interface AiJoint { type: AiJointType; a: number; b: number }

export type AiSpec =
  | { kind: 'template'; name: string; template: AiTemplate; params: AiTemplateParams }
  | { kind: 'boards'; name: string; boards: AiBoard[]; joints: AiJoint[] };

export const MAX_PROMPT = 600;
export const MAX_BOARDS = 60;
export const MAX_JOINTS = 120;
const MAX_LEN = 240;

const num = { type: 'number' };
/** JSON schema for structured output (one flat object; strict mode off for portability). */
export const SPEC_SCHEMA = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: ['template', 'boards'] },
    name: { type: 'string', description: 'Short name, e.g. "Bookshelf"' },
    template: { type: 'string', enum: [...AI_TEMPLATES] },
    params: {
      type: 'object',
      properties: { width: num, height: num, depth: num, shelves: num, doors: num, drawers: num, sections: num, material: { type: 'string' } },
    },
    boards: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          stock: { type: 'string', enum: [...Object.keys(LUMBER_STOCK), 'sheet'] },
          material: { type: 'string', enum: [...SHEET_MATERIALS] },
          thickness: num, length: num, width: num, x: num, y: num, z: num,
          rotation: { type: 'object', properties: { x: num, y: num, z: num } },
        },
        required: ['name', 'stock', 'length', 'x', 'y', 'z'],
      },
    },
    joints: {
      type: 'array',
      items: {
        type: 'object',
        properties: { type: { type: 'string', enum: [...AI_JOINTS] }, a: num, b: num },
        required: ['type', 'a', 'b'],
      },
    },
  },
  required: ['kind', 'name'],
} as const;

export const SYSTEM_PROMPT = `You design simple woodworking furniture for The Workbench app. Reply with ONE JSON object and nothing else.
Units are inches. Axes: x left→right, y up from the floor (0), z from the back (0) toward the front.

Prefer a template when the piece is one of these (fill only the params you need):
- "base-cabinet": width 9-60, height 12-42, depth 10-30, doors 0-2, drawers 0-4, shelves 0-3
- "upper-cabinet": width 9-60, height 12-48, depth 6-18, doors 0-2, shelves 0-5
- "bookshelf": width 12-72, height 18-108, depth 6-24, shelves 0-12
- "window-bench": width 18-144, height 12-30, depth 12-30, sections (cubbies) 1-8
params.material: plywood, birch, oak, walnut, cherry or mdf.
Template reply: {"kind":"template","name":"Bookshelf","template":"bookshelf","params":{"width":36,"height":72,"depth":12,"shelves":4}}

Otherwise reply with boards: {"kind":"boards","name":"...","boards":[...],"joints":[...]}
Each board: name, stock, length, x, y, z, rotation, plus material/thickness/width for sheet goods.
- stock "1x2" (3/4 x 1 1/2), "2x2" (1 1/2 x 1 1/2), "2x4" (1 1/2 x 3 1/2), "2x6" (1 1/2 x 5 1/2): pine lumber, give only length.
- stock "sheet": material "plywood" or "mdf", thickness 0.25, 0.5 or 0.75, length and width (a panel must fit 48 x 96).
- Unturned, a board lies flat: length along x, thickness along y, width along z.
- rotation in degrees (multiples of 90): {"x":0,"y":0,"z":90} stands it up with its length vertical (legs, cabinet sides);
  {"x":90,"y":0,"z":0} stands it on edge, width vertical, length along x (aprons, backs, drawer fronts);
  {"x":0,"y":90,"z":0} turns it flat so its length runs front-to-back (z).
- x, y, z is the board's min corner (left, bottom, back) AFTER turning. Boards must touch but never overlap. The piece sits on the floor (lowest y = 0).
Joints: {"type":"butt"|"dado"|"rabbet"|"pocket"|"dowel","a":i,"b":j} by board index, only between boards that touch. Use dado for fixed shelves into sides, pocket or butt for frames.
Keep it buildable: real stock, at most ${MAX_BOARDS} boards, fractions to 1/16.
When given a current design and a change, return the whole updated design in the same JSON format, changing only what was asked.`;

/** The user message: the request, plus the current design when changing one. */
export function userMessage(prompt: string, current?: AiSpec | null): string {
  if (!current) return `Design: ${prompt}`;
  return `Current design:\n${JSON.stringify(current)}\n\nChange: ${prompt}`;
}

type Parsed = { ok: true; spec: AiSpec } | { ok: false; error: string };

const isObj = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const toNum = (v: unknown): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
};
const cleanName = (v: unknown, fallback: string) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 40) : fallback);

/** Pull a JSON object out of a model reply (bare, fenced, or with chatter around it). */
export function extractJson(text: string): unknown {
  const t = text.trim();
  try { return JSON.parse(t); } catch { /* fall through */ }
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
  if (fenced) { try { return JSON.parse(fenced[1]); } catch { /* fall through */ } }
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch { /* fall through */ } }
  throw new Error('The reply was not JSON.');
}

/**
 * Strict shape check with light coercion (numeric strings, missing rotation).
 * Geometry problems (overlaps, off-size stock) are left for the app's repair pass.
 */
export function parseSpec(raw: unknown): Parsed {
  let v = raw;
  if (typeof v === 'string') {
    try { v = extractJson(v); } catch (e) { return { ok: false, error: (e as Error).message }; }
  }
  if (!isObj(v)) return { ok: false, error: 'Expected a JSON object.' };
  if (v.kind === 'template') {
    if (typeof v.template !== 'string' || !(AI_TEMPLATES as readonly string[]).includes(v.template)) {
      return { ok: false, error: `template must be one of ${AI_TEMPLATES.join(', ')}.` };
    }
    const p = isObj(v.params) ? v.params : {};
    const params: AiTemplateParams = {};
    for (const k of ['width', 'height', 'depth', 'shelves', 'doors', 'drawers', 'sections'] as const) {
      if (p[k] === undefined || p[k] === null) continue;
      const n = toNum(p[k]);
      if (n === undefined) return { ok: false, error: `params.${k} must be a number.` };
      params[k] = n;
    }
    if (typeof p.material === 'string') params.material = p.material.toLowerCase();
    const template = v.template as AiTemplate;
    return { ok: true, spec: { kind: 'template', name: cleanName(v.name, template), template, params } };
  }
  if (v.kind !== 'boards') return { ok: false, error: 'kind must be "template" or "boards".' };
  if (!Array.isArray(v.boards) || v.boards.length === 0) return { ok: false, error: 'boards must be a non-empty array.' };
  if (v.boards.length > MAX_BOARDS) return { ok: false, error: `At most ${MAX_BOARDS} boards.` };
  const boards: AiBoard[] = [];
  for (let i = 0; i < v.boards.length; i++) {
    const b = v.boards[i];
    if (!isObj(b)) return { ok: false, error: `boards[${i}] must be an object.` };
    const stock = typeof b.stock === 'string' ? b.stock.toLowerCase().replace('×', 'x') : '';
    if (stock !== 'sheet' && !(stock in LUMBER_STOCK)) return { ok: false, error: `boards[${i}].stock must be 1x2, 2x2, 2x4, 2x6 or sheet.` };
    const length = toNum(b.length);
    if (length === undefined || length <= 0 || length > MAX_LEN) return { ok: false, error: `boards[${i}].length must be 0-${MAX_LEN}.` };
    const pos: number[] = [];
    for (const k of ['x', 'y', 'z'] as const) {
      const n = toNum(b[k]);
      if (n === undefined || Math.abs(n) > 1000) return { ok: false, error: `boards[${i}].${k} must be a number.` };
      pos.push(n);
    }
    const r = isObj(b.rotation) ? b.rotation : {};
    const rotation: AiRotation = { x: toNum(r.x) ?? 0, y: toNum(r.y) ?? 0, z: toNum(r.z) ?? 0 };
    const board: AiBoard = { name: cleanName(b.name, `Board ${i + 1}`), stock: stock as AiStock, length, x: pos[0], y: pos[1], z: pos[2], rotation };
    if (stock === 'sheet') {
      const width = toNum(b.width);
      if (width === undefined || width <= 0 || width > MAX_LEN) return { ok: false, error: `boards[${i}].width is required for sheet goods.` };
      board.width = width;
      board.material = b.material === 'mdf' ? 'mdf' : 'plywood';
      const t = toNum(b.thickness);
      board.thickness = t !== undefined && t > 0 && t <= 2 ? t : 0.75;
    }
    boards.push(board);
  }
  const joints: AiJoint[] = [];
  if (Array.isArray(v.joints)) {
    for (const j of v.joints.slice(0, MAX_JOINTS)) {
      if (!isObj(j)) continue;
      const type = typeof j.type === 'string' ? j.type.toLowerCase() : '';
      const a = toNum(j.a), b = toNum(j.b);
      // Unknown joint types and bad indices are dropped (and reported) by the repair pass.
      if (!(AI_JOINTS as readonly string[]).includes(type) || a === undefined || b === undefined) continue;
      joints.push({ type: type as AiJointType, a: Math.round(a), b: Math.round(b) });
    }
  }
  return { ok: true, spec: { kind: 'boards', name: cleanName(v.name, 'Piece'), boards, joints } };
}
