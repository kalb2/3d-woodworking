import { describe, expect, it, vi } from 'vitest';
import {
  BOARDS_INSTRUCTIONS, PLAN_INSTRUCTIONS, compactCurrent, fromBoards, fromPlan, onDeviceGenerate, rotationToTurn, turnToRotation,
  type OnDeviceBridge,
} from './onDevice';
import { mockBookshelf } from './mock';
import { repairBoards } from './repair';
import type { AiSpec } from './spec';

const plan = (o: Record<string, unknown>) => ({ json: JSON.stringify(o) });
const params = { width: 36, height: 72, depth: 0, shelves: 4, doors: -1, drawers: -1, sections: -1, material: 'default' };
const tableBoards = {
  name: 'Side table',
  boards: [
    { name: 'Leg', stock: '2x2', length: 19.25, width: 0, thickness: 0, x: 0, y: 0, z: 0, turn: 'upright' },
    { name: 'Top', stock: 'sheet', length: 18, width: 18, thickness: 0.75, x: 0, y: 19.25, z: 0, turn: 'flat' },
  ],
  joints: [{ type: 'butt', a: 0, b: 1 }],
};
const bridge = (over: Partial<OnDeviceBridge> = {}): OnDeviceBridge => ({
  status: vi.fn(async () => ({ available: true })),
  plan: vi.fn(async () => plan({ kind: 'template', name: 'Bookshelf', template: 'bookshelf', params })),
  boards: vi.fn(async () => ({ json: JSON.stringify(tableBoards) })),
  ...over,
});

describe('on-device mapping', () => {
  it('turns sentinels into omitted params', () => {
    expect(fromPlan({ kind: 'template', name: 'Bookshelf', template: 'bookshelf', params })).toEqual({
      kind: 'template', name: 'Bookshelf', template: 'bookshelf', params: { width: 36, height: 72, shelves: 4 },
    });
    expect(fromPlan({ kind: 'template', name: 'X', template: 'bookshelf', params: { ...params, material: 'oak', doors: 2 } }))
      .toMatchObject({ params: { material: 'oak', doors: 2 } });
  });

  it('asks for boards when no template fits', () => {
    expect(fromPlan({ kind: 'boards', name: 'Table', template: 'bookshelf', params })).toBe('boards');
    expect(fromPlan({ kind: 'template', name: 'Odd', template: 'chair', params })).toBe('boards');
    expect(() => fromPlan('nope')).toThrow();
  });

  it('maps named turns to rotations and back', () => {
    expect(turnToRotation('upright')).toEqual({ x: 0, y: 0, z: 90 });
    expect(turnToRotation('edge')).toEqual({ x: 90, y: 0, z: 0 });
    expect(turnToRotation('deep')).toEqual({ x: 0, y: 90, z: 0 });
    expect(turnToRotation('sideways')).toEqual({ x: 0, y: 0, z: 0 });
    expect(rotationToTurn({ x: 0, y: 0, z: -270 })).toBe('upright');
    expect(rotationToTurn({ x: 90, y: 0, z: 90 })).toBeNull();
  });

  it('builds a boards spec that the repair pass accepts', () => {
    const spec = fromBoards(tableBoards);
    expect(spec.kind).toBe('boards');
    if (spec.kind !== 'boards') return;
    expect(spec.boards[0]).toMatchObject({ stock: '2x2', rotation: { x: 0, y: 0, z: 90 } });
    expect(spec.boards[0].width).toBeUndefined();
    expect(spec.boards[1]).toMatchObject({ stock: 'sheet', material: 'plywood', width: 18, thickness: 0.75 });
    expect(repairBoards(spec).boards).toHaveLength(2);
  });

  it('compacts the current design, or refuses turns it can\'t name', () => {
    const shelf = mockBookshelf();
    const c = compactCurrent(shelf);
    expect(c).toContain('"turn":"upright"');
    expect(c).not.toContain('rotation');
    const odd: AiSpec = { kind: 'boards', name: 'Odd', boards: [{ name: 'A', stock: '2x4', length: 10, x: 0, y: 0, z: 0, rotation: { x: 90, y: 0, z: 90 } }], joints: [] };
    expect(compactCurrent(odd)).toBeNull();
  });
});

describe('onDeviceGenerate', () => {
  it('uses the short plan step for a template', async () => {
    const b = bridge();
    const spec = await onDeviceGenerate('a bookshelf', null, b);
    expect(spec).toMatchObject({ kind: 'template', template: 'bookshelf' });
    expect(b.plan).toHaveBeenCalledWith(expect.objectContaining({ instructions: PLAN_INSTRUCTIONS, prompt: 'Design: a bookshelf' }));
    expect(b.boards).not.toHaveBeenCalled();
  });

  it('falls to the boards step when no template fits', async () => {
    const b = bridge({ plan: vi.fn(async () => plan({ kind: 'boards', name: 'Table', template: 'bookshelf', params })) });
    const spec = await onDeviceGenerate('a side table', null, b);
    expect(spec).toMatchObject({ kind: 'boards', name: 'Side table' });
    expect(b.boards).toHaveBeenCalledWith(expect.objectContaining({ instructions: BOARDS_INSTRUCTIONS }));
  });

  it('sends a boards design straight to the boards step for a change', async () => {
    const b = bridge();
    await onDeviceGenerate('make it taller', mockBookshelf(), b);
    expect(b.plan).not.toHaveBeenCalled();
    expect((b.boards as ReturnType<typeof vi.fn>).mock.calls[0][0].prompt).toMatch(/^Current design: .*\nChange: make it taller/s);
  });

  it('reports native errors by code, and too-big designs as context', async () => {
    const b = bridge({ plan: vi.fn(async () => { throw Object.assign(new Error('declined'), { code: 'guardrail' }); }) });
    await expect(onDeviceGenerate('x', null, b)).rejects.toMatchObject({ code: 'guardrail' });
    const big: AiSpec = { kind: 'boards', name: 'Big', joints: [],
      boards: Array.from({ length: 40 }, (_, i) => ({ name: `Board number ${i}`, stock: '2x4' as const, length: 30, x: i * 2, y: 0, z: 0, rotation: { x: 0, y: 0, z: 0 } })) };
    await expect(onDeviceGenerate('x', big, bridge())).rejects.toMatchObject({ code: 'context' });
    const junk = bridge({ plan: vi.fn(async () => ({ json: 'not json' })) });
    await expect(onDeviceGenerate('x', null, junk)).rejects.toMatchObject({ code: 'bad_json' });
  });
});
