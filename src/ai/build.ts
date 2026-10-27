import type { FurnitureObject, Joint, ScannedRoom, WoodMaterial } from '../types/furniture';
import { placeBuiltIn } from '../builtins/builtIns';
import { normalizeModuleInput, type ModuleInput } from '../generators/modules';
import { deleteCascade, descendantIds, objectBox, refitGroups, unionBox } from '../state/groupTree';
import { defaultDepth, extendMater, groovable, pairContact } from '../joinery/joints';
import { defaultBoardOptions } from '../utils/boardGeometry';
import { PRESET_WOOD_MATERIALS } from '../utils/woodTextureGenerator';
import { repairBoards } from './repair';
import type { AiSpec, AiTemplateParams } from './spec';

/**
 * Turns a (parsed) AI spec into normal project parts under one group, after the
 * repair pass. Pure, so it is unit-tested and the store makes it one undo step.
 */

export interface AiPlaced { objects: FurnitureObject[]; joints: Joint[]; groupId: string; notes: string[] }

const r3 = (n: number) => Math.round(n * 10000) / 10000;
const GAP = 12;

/** Template params → module input, with a note for anything out of range. */
export function templateInput(spec: Extract<AiSpec, { kind: 'template' }>): { input: ModuleInput; notes: string[] } {
  const p = spec.params;
  const raw: ModuleInput = {};
  for (const k of ['width', 'height', 'depth', 'shelves', 'drawers', 'sections'] as const) if (p[k] !== undefined) raw[k] = p[k]!;
  if (p.doors !== undefined) raw.doors = p.doors <= 0 ? 'none' : p.doors >= 2 ? '2' : '1';
  if (p.material) raw.material = p.material;
  const input = normalizeModuleInput(spec.template, raw);
  const notes: string[] = [];
  for (const [k, v] of Object.entries(raw)) {
    if (k === 'doors' && p.doors !== undefined && p.doors > 2) notes.push('Used 2 doors, the most this template has.');
    else if (k === 'material' && input.material !== v) notes.push(`Used ${input.material}; ${v} isn't a choice for this template.`);
    else if (typeof v === 'number' && input[k] !== undefined && input[k] !== v) notes.push(`Set ${k} to ${input[k]}${['width', 'height', 'depth'].includes(k) ? '"' : ''} (the template's limit; asked for ${v}).`);
  }
  return { input, notes };
}

/** The design behind an AI group, kept in step with later edits in the built-in sheet. */
export function currentSpec(group: FurnitureObject): AiSpec | null {
  const spec = group.ai?.spec;
  if (!spec) return null;
  if (spec.kind !== 'template' || !group.builtIn) return spec;
  const i = group.builtIn.input;
  const params: AiTemplateParams = { ...spec.params };
  for (const k of ['width', 'height', 'depth', 'shelves', 'drawers', 'sections'] as const) if (typeof i[k] === 'number') params[k] = i[k] as number;
  if (typeof i.doors === 'string') params.doors = i.doors === 'none' ? 0 : Number(i.doors);
  if (typeof i.material === 'string') params.material = i.material;
  return { ...spec, params };
}

/** Floor point for a new piece: to the right of what's already there. */
function spot(objects: FurnitureObject[], width: number): { x: number; z: number } {
  const box = unionBox(objects.filter((o) => !o.parentId && o.visible !== false && !o.reference && o.generator !== 'room-scan').map(objectBox));
  if (!box) return { x: 0, z: 0 };
  return { x: r3(box.max.x + GAP + width / 2), z: r3((box.min.z + box.max.z) / 2) };
}

const sheetMaterial = (m: string): WoodMaterial => ({ ...(m === 'mdf' ? PRESET_WOOD_MATERIALS.mdf : PRESET_WOOD_MATERIALS.plywood) });

/**
 * Add the piece (or rebuild `replaceId` in place: same x/z, same group id, one step).
 * Returns null when nothing buildable is left.
 */
export function placeAiPiece(
  objects: FurnitureObject[],
  joints: Joint[],
  room: ScannedRoom | undefined,
  spec: AiSpec,
  prompt: string,
  opts: { replaceId?: string | null; stamp?: number; groupMaterial: WoodMaterial },
): AiPlaced | null {
  const stamp = opts.stamp ?? Date.now();
  const old = opts.replaceId ? objects.find((o) => o.id === opts.replaceId && o.shape === 'group') : undefined;
  let base = objects, baseJoints = joints, at: { x: number; z: number } | null = null;
  if (old) {
    const gone = new Set([old.id, ...descendantIds(objects, old.id)]);
    base = deleteCascade(objects, [old.id]);
    baseJoints = joints.filter((j) => !gone.has(j.receiverId) && !gone.has(j.materId));
    const b = objectBox(old);
    at = { x: r3((b.min.x + b.max.x) / 2), z: r3((b.min.z + b.max.z) / 2) };
  }
  const ai = { prompt, spec };

  if (spec.kind === 'template') {
    const { input, notes } = templateInput(spec);
    const width = Number(input.width ?? 36);
    const res = placeBuiltIn(base, room, { template: spec.template, input, at: at ?? spot(base, width) }, opts.groupMaterial, stamp, baseJoints);
    if (!res) return null;
    let groupId = res.groupId;
    let out = res.objects.map((o) => (o.id === groupId ? { ...o, name: spec.name || o.name, ai } : o));
    if (old) {
      // Keep the group id so selection and anything pointing at it carry over.
      out = out.map((o) => (o.id === groupId ? { ...o, id: old.id, parentId: old.parentId } : o.parentId === groupId ? { ...o, parentId: old.id } : o));
      groupId = old.id;
      if (old.parentId) out = refitGroups(out, [old.parentId]);
    }
    return { objects: out, joints: res.joints, groupId, notes };
  }

  const fixed = repairBoards(spec);
  if (fixed.boards.length === 0) return null;
  const xs = fixed.boards.map((b) => [b.min[0], b.min[0] + b.size[0]]).flat();
  const zs = fixed.boards.map((b) => [b.min[2], b.min[2] + b.size[2]]).flat();
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  const width = Math.max(...xs) - Math.min(...xs);
  const target = at ?? spot(base, width);
  const id = old ? old.id.replace(/^grp_/, '') : `ai_${stamp}_${Math.random().toString(36).slice(2, 6)}`;
  const groupId = old?.id ?? `grp_${id}`;
  const parts: FurnitureObject[] = fixed.boards.map((b, i) => {
    const sheet = b.stock === 'sheet';
    return {
      id: `${id}_p${i}`,
      name: b.name,
      shape: sheet ? 'board' : 'cube',
      dimensions: { length: b.size[0], height: b.size[1], width: b.size[2] },
      position: { x: r3(b.min[0] + b.size[0] / 2 - cx + target.x), y: r3(b.min[1] + b.size[1] / 2), z: r3(b.min[2] + b.size[2] / 2 - cz + target.z) },
      rotation: { x: 0, y: 0, z: 0 },
      material: sheet ? sheetMaterial(b.material) : { ...PRESET_WOOD_MATERIALS.pine },
      visible: true,
      parentId: groupId,
      ...(sheet ? { board: defaultBoardOptions() } : {}),
    };
  });

  // Joints through the app's own contact rules; grooves need a face that can take one.
  const notes = [...fixed.notes];
  const made: Joint[] = [];
  let butted = 0;
  fixed.joints.forEach((j, k) => {
    const pc = pairContact(parts[j.a], parts[j.b]);
    if (!pc) return;
    let type = j.type;
    if ((type === 'dado' || type === 'rabbet') && !groovable(pc.receiver, pc.face)) { type = 'butt'; butted++; }
    const depth = defaultDepth(pc.receiver, pc.face);
    let extended = 0;
    if (type === 'dado' || type === 'rabbet') {
      const i = parts.indexOf(pc.mater);
      const grown = extendMater(pc.receiver, pc.mater, pc.face, depth);
      parts[i] = { ...pc.mater, ...grown };
      extended = depth;
    }
    made.push({ id: `jt_${id}_${k}`, type, receiverId: pc.receiver.id, materId: pc.mater.id, face: pc.face, depth, extended });
  });
  if (butted) notes.push(`Used butt joints for ${butted} ${butted === 1 ? 'joint' : 'joints'} that can't take a groove there.`);

  const box = unionBox(parts.map(objectBox))!;
  const group: FurnitureObject = {
    id: groupId,
    name: old?.name && old.ai ? spec.name || old.name : spec.name || 'Piece',
    shape: 'group',
    dimensions: { length: r3(box.max.x - box.min.x), height: r3(box.max.y - box.min.y), width: r3(box.max.z - box.min.z) },
    position: { x: r3((box.min.x + box.max.x) / 2), y: r3((box.min.y + box.max.y) / 2), z: r3((box.min.z + box.max.z) / 2) },
    rotation: { x: 0, y: 0, z: 0 },
    material: opts.groupMaterial,
    visible: true,
    generator: 'ai',
    ai,
    ...(old?.parentId ? { parentId: old.parentId } : {}),
  };
  const all = [...base, ...parts, group];
  return { objects: old?.parentId ? refitGroups(all, [old.parentId]) : all, joints: [...baseJoints, ...made], groupId, notes };
}
