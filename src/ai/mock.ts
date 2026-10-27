import { turnedBox } from './repair.ts';
import { LUMBER_STOCK, type AiBoard, type AiSpec } from './spec.ts';

/**
 * Mock mode: a fixed 3/4" plywood bookshelf (with a few small, deliberate
 * flaws so the repair notes show), and simple canned changes. No key needed.
 */
export function mockBookshelf(): AiSpec {
  const W = 30.1, H = 48, D = 11.25, T = 0.75, up = 0.5;
  const side = (name: string, x: number): AiBoard => ({ name, stock: 'sheet', material: 'plywood', thickness: T, length: H, width: D, x, y: up, z: 0.25, rotation: { x: 0, y: 0, z: 90 } });
  const flat = (name: string, y: number, x = T, len = W - 2 * T): AiBoard => ({ name, stock: 'sheet', material: 'plywood', thickness: T, length: len, width: D, x, y, z: 0.25, rotation: { x: 0, y: 0, z: 0 } });
  return {
    kind: 'boards',
    name: 'Bookshelf',
    boards: [
      side('Left side', 0),
      side('Right side', W - T),
      flat('Bottom', up + 2),
      flat('Top', up + H - T),
      flat('Shelf 1', up + 17, T - 0.125, W - 2 * T + 0.125),
      flat('Shelf 2', up + 32),
      { name: 'Back', stock: 'sheet', material: 'plywood', thickness: 0.25, length: W, width: H, x: 0, y: up, z: 0, rotation: { x: 90, y: 0, z: 0 } },
    ],
    joints: [
      { type: 'dado', a: 0, b: 2 }, { type: 'dado', a: 1, b: 2 },
      { type: 'butt', a: 0, b: 3 }, { type: 'butt', a: 1, b: 3 },
      { type: 'dado', a: 0, b: 4 }, { type: 'dado', a: 1, b: 4 },
      { type: 'dado', a: 0, b: 5 }, { type: 'dado', a: 1, b: 5 },
      { type: 'butt', a: 0, b: 6 }, { type: 'butt', a: 1, b: 6 },
    ],
  };
}

/** Canned "Change it": "N in taller/shorter/wider/narrower" and "add a door". */
export function mockChange(spec: AiSpec, instruction: string): AiSpec {
  const t = instruction.toLowerCase();
  const m = /(\d+(?:\.\d+)?)\s*(?:"|in\b|inch|inches)?\s*(taller|shorter|wider|narrower)/.exec(t);
  const n = m ? Number(m[1]) * (m[2] === 'shorter' || m[2] === 'narrower' ? -1 : 1) : 0;
  const axis = m && (m[2] === 'wider' || m[2] === 'narrower') ? 'x' : 'y';
  if (spec.kind === 'template') {
    const p = { ...spec.params };
    if (m) { if (axis === 'y') p.height = (p.height ?? 36) + n; else p.width = (p.width ?? 36) + n; }
    if (/add (a |one )?door/.test(t)) p.doors = Math.min(2, (p.doors ?? 0) + 1);
    return { ...spec, params: p };
  }
  let boards = spec.boards.map((b) => ({ ...b, rotation: { ...b.rotation } }));
  const k = axis === 'x' ? 0 : 1;
  const key = axis === 'x' ? 'x' : 'y';
  if (m && boards.length) {
    // Stretch the boards that span the piece on that axis; shift the ones past the middle.
    const boxes = boards.map((b) => turnedBox(localSize(b), b.rotation));
    const lo = Math.min(...boards.map((b) => b[key])), hi = Math.max(...boards.map((b, i) => b[key] + boxes[i].size[k]));
    const mid = (lo + hi) / 2;
    boards = boards.map((b, i) => {
      const { size, lenAxis } = boxes[i];
      if (size[k] > (hi - lo) * 0.6) {
        if (lenAxis === k) return { ...b, length: b.length + n };
        if (b.stock === 'sheet') return { ...b, width: (b.width ?? 0) + n };
      }
      return b[key] + size[k] / 2 > mid ? { ...b, [key]: b[key] + n } : b;
    });
  }
  const joints = [...spec.joints];
  if (/add (a |one )?door/.test(t) && boards.length && !boards.some((b) => /door/i.test(b.name))) {
    const boxes = boards.map((b) => turnedBox(localSize(b), b.rotation));
    const ext = (i: number) => Math.min(...boards.map((b) => [b.x, b.y, b.z][i]));
    const max = (i: number) => Math.max(...boards.map((b, j) => [b.x, b.y, b.z][i] + boxes[j].size[i]));
    const x0 = ext(0), y0 = ext(1);
    boards.push({ name: 'Door', stock: 'sheet', material: 'plywood', thickness: 0.75, length: max(0) - x0, width: max(1) - y0, x: x0, y: y0, z: max(2), rotation: { x: 90, y: 0, z: 0 } });
    joints.push({ type: 'butt', a: 0, b: boards.length - 1 });
  }
  return { ...spec, boards, joints };
}

const localSize = (b: AiBoard): [number, number, number] =>
  b.stock === 'sheet' ? [b.length, b.thickness ?? 0.75, b.width ?? 12] : [b.length, LUMBER_STOCK[b.stock][0], LUMBER_STOCK[b.stock][1]];

/** Mock reply: the bookshelf for a new piece, a canned change for an existing one. */
export const mockDescribe = (prompt: string, current: AiSpec | null): AiSpec => (current ? mockChange(current, prompt) : mockBookshelf());
