import { AI_TEMPLATES, parseSpec, type AiRotation, type AiSpec, type AiTemplateParams } from './spec';

/**
 * "Describe it" on Apple's on-device model (Foundation Models, iOS 26+).
 * The native plugin only runs guided generation with the shapes in
 * ios/App/App/OnDeviceAIPlugin.swift; prompts and the mapping to the app's
 * spec live here so they're testable. The on-device context is small, so:
 * a short plan step first (template + params), and a board list only when
 * no template fits, with sentinels instead of optionals and named turns.
 */

export type OnDeviceReason = 'device_not_eligible' | 'apple_intelligence_off' | 'model_not_ready' | 'os_too_old' | 'unavailable' | 'not_ios';
export interface OnDeviceStatus { available: boolean; reason?: OnDeviceReason }
export interface OnDeviceCall { instructions: string; prompt: string; maxTokens?: number }
export interface OnDeviceBridge {
  status(): Promise<OnDeviceStatus>;
  plan(o: OnDeviceCall): Promise<{ json: string }>;
  boards(o: OnDeviceCall): Promise<{ json: string }>;
}

export const ON_DEVICE_REASON_TEXT: Record<OnDeviceReason, string> = {
  device_not_eligible: 'This device can\'t run Apple Intelligence.',
  apple_intelligence_off: 'Apple Intelligence is off (Settings → Apple Intelligence & Siri).',
  model_not_ready: 'Apple Intelligence is still getting its model ready.',
  os_too_old: 'Apple Intelligence needs iOS 26 or later.',
  unavailable: 'Apple Intelligence isn\'t available right now.',
  not_ios: 'Apple Intelligence works in the iPhone and iPad app.',
};

/** Native error codes (see OnDeviceDesigner.describe) plus the ones raised here. */
export type OnDeviceErrorCode = 'unavailable' | 'context' | 'guardrail' | 'refused' | 'locale' | 'busy' | 'bad_json' | 'timeout' | 'unsupported' | 'failed';

export class OnDeviceError extends Error {
  readonly code: OnDeviceErrorCode;
  constructor(code: OnDeviceErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export const PLAN_INSTRUCTIONS = `You plan simple woodworking furniture. Units are inches; 1 foot = 12 inches.
Use kind "template" when one fits:
bookshelf: width 12-72, height 18-108, depth 6-24, shelves 0-12
base-cabinet (floor cabinet): width 9-60, height 12-42, depth 10-30, doors 0-2, drawers 0-4, shelves 0-3
upper-cabinet (wall cabinet): width 9-60, height 12-48, depth 6-18, doors 0-2, shelves 0-5
window-bench (bench seat with cubbies): width 18-144, height 12-30, depth 12-30, sections 1-8
Otherwise use kind "boards" (tables, desks, stools, boxes, frames, crates, planters).
Fill only what the user gave: 0 for an unknown size, -1 for an unknown count, "default" material.`;

export const BOARDS_INSTRUCTIONS = `You design simple woodworking pieces as a list of boards. Units are inches.
Axes: x left to right, y up from the floor (0), z back (0) to front.
stock: 1x2 (0.75 x 1.5), 2x2 (1.5 x 1.5), 2x4 (1.5 x 3.5), 2x6 (1.5 x 5.5) pine lumber, or sheet (plywood panel: give width, thickness 0.75 or 0.5).
turn: flat = lying down, length along x, width along z (tops, shelves). upright = length vertical (legs, sides). edge = on edge, width vertical, length along x (aprons, backs). deep = lying down, length along z (side rails).
x, y, z is the board's left, bottom, back corner after turning. Boards touch but never overlap. The lowest board sits on y 0.
Joints by board index, only between touching boards: dado for shelves into sides, pocket or butt for frames.
Use few boards (at most 24).`;

export const PLAN_MAX_TOKENS = 300;
export const BOARDS_MAX_TOKENS = 1800;
/** Above this a "Change it" design won't fit the on-device context; the cloud takes it. */
export const MAX_ON_DEVICE_CURRENT_CHARS = 2400;

type Turn = 'flat' | 'upright' | 'edge' | 'deep';
const TURNS: Record<Turn, AiRotation> = {
  flat: { x: 0, y: 0, z: 0 },
  upright: { x: 0, y: 0, z: 90 },
  edge: { x: 90, y: 0, z: 0 },
  deep: { x: 0, y: 90, z: 0 },
};
const norm = (d: number) => ((Math.round(d / 90) * 90) % 360 + 360) % 360;
const sameTurn = (a: AiRotation, b: AiRotation) => norm(a.x) === norm(b.x) && norm(a.y) === norm(b.y) && norm(a.z) === norm(b.z);

export function turnToRotation(turn: unknown): AiRotation {
  return { ...(TURNS[turn as Turn] ?? TURNS.flat) };
}

/** The named turn for a rotation, or null if it's not one of the four. */
export function rotationToTurn(r: AiRotation): Turn | null {
  for (const t of Object.keys(TURNS) as Turn[]) if (sameTurn(r, TURNS[t])) return t;
  return null;
}

const isObj = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const r4 = (n: number) => Math.round(n * 1e4) / 1e4;

/** Plan output → a template spec, or 'boards' when no template fits. Throws on junk. */
export function fromPlan(raw: unknown): AiSpec | 'boards' {
  if (!isObj(raw)) throw new OnDeviceError('bad_json', 'The on-device answer couldn\'t be read.');
  if (raw.kind !== 'template' || !(AI_TEMPLATES as readonly string[]).includes(String(raw.template))) return 'boards';
  const p = isObj(raw.params) ? raw.params : {};
  const params: AiTemplateParams = {};
  for (const k of ['width', 'height', 'depth'] as const) { const n = num(p[k]); if (n !== undefined && n > 0) params[k] = r4(n); }
  for (const k of ['shelves', 'doors', 'drawers', 'sections'] as const) { const n = num(p[k]); if (n !== undefined && n >= 0) params[k] = Math.round(n); }
  if (typeof p.material === 'string' && p.material !== 'default') params.material = p.material;
  const parsed = parseSpec({ kind: 'template', name: raw.name, template: raw.template, params });
  if (!parsed.ok) throw new OnDeviceError('bad_json', parsed.error);
  return parsed.spec;
}

/** Boards output → a boards spec (the app's repair pass fixes the geometry). Throws on junk. */
export function fromBoards(raw: unknown): AiSpec {
  if (!isObj(raw) || !Array.isArray(raw.boards)) throw new OnDeviceError('bad_json', 'The on-device answer couldn\'t be read.');
  const boards = raw.boards.filter(isObj).map((b) => {
    const out: Record<string, unknown> = { name: b.name, stock: b.stock, length: b.length, x: b.x, y: b.y, z: b.z, rotation: turnToRotation(b.turn) };
    if (b.stock === 'sheet') {
      out.material = 'plywood';
      out.width = num(b.width) && Number(b.width) > 0 ? b.width : 12;
      if (num(b.thickness) && Number(b.thickness) > 0) out.thickness = b.thickness;
    }
    return out;
  });
  const parsed = parseSpec({ kind: 'boards', name: raw.name, boards, joints: Array.isArray(raw.joints) ? raw.joints : [] });
  if (!parsed.ok) throw new OnDeviceError('bad_json', parsed.error);
  return parsed.spec;
}

/** The current design in the on-device shapes, compact. Null if a board's turn can't be named. */
export function compactCurrent(spec: AiSpec): string | null {
  if (spec.kind === 'template') return JSON.stringify({ kind: 'template', name: spec.name, template: spec.template, params: spec.params });
  const boards: Record<string, unknown>[] = [];
  for (const b of spec.boards) {
    const turn = rotationToTurn(b.rotation);
    if (!turn) return null;
    const o: Record<string, unknown> = { name: b.name, stock: b.stock, length: b.length };
    if (b.stock === 'sheet') { o.width = b.width; o.thickness = b.thickness; }
    Object.assign(o, { x: b.x, y: b.y, z: b.z, turn });
    boards.push(o);
  }
  return JSON.stringify({ name: spec.name, boards, joints: spec.joints });
}

const changePrompt = (current: string, change: string) => `Current design: ${current}\nChange: ${change}\nReturn the whole updated design.`;

function asOnDeviceError(e: unknown): OnDeviceError {
  if (e instanceof OnDeviceError) return e;
  const code = (e as { code?: string })?.code;
  const known: OnDeviceErrorCode[] = ['unavailable', 'context', 'guardrail', 'refused', 'locale', 'busy', 'bad_json', 'timeout', 'failed'];
  return new OnDeviceError(known.includes(code as OnDeviceErrorCode) ? code as OnDeviceErrorCode : 'failed',
    (e as Error)?.message || 'The on-device model failed.');
}

/**
 * Two short steps: plan (template?) then, only if needed, boards. A change to a
 * boards design goes straight to the boards step with the current design.
 */
export async function onDeviceGenerate(prompt: string, current: AiSpec | null, bridge: OnDeviceBridge): Promise<AiSpec> {
  const read = (json: string) => { try { return JSON.parse(json) as unknown; } catch { throw new OnDeviceError('bad_json', 'The on-device answer couldn\'t be read.'); } };
  const boardsStep = async (text: string) => {
    const r = await bridge.boards({ instructions: BOARDS_INSTRUCTIONS, prompt: text, maxTokens: BOARDS_MAX_TOKENS });
    return fromBoards(read(r.json));
  };
  try {
    if (current?.kind === 'boards') {
      const c = compactCurrent(current);
      if (!c) throw new OnDeviceError('unsupported', 'This design uses turns the on-device model can\'t edit.');
      if (c.length > MAX_ON_DEVICE_CURRENT_CHARS) throw new OnDeviceError('context', 'This design is too big for the on-device model.');
      return await boardsStep(changePrompt(c, prompt));
    }
    const text = current ? changePrompt(compactCurrent(current)!, prompt) : `Design: ${prompt}`;
    const plan = await bridge.plan({ instructions: PLAN_INSTRUCTIONS, prompt: text, maxTokens: PLAN_MAX_TOKENS });
    const spec = fromPlan(read(plan.json));
    if (spec !== 'boards') return spec;
    return await boardsStep(current ? `Design: ${current.name}, ${prompt}` : `Design: ${prompt}`);
  } catch (e) {
    throw asOnDeviceError(e);
  }
}

