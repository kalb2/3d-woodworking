import { describe, expect, it } from 'vitest';
import { inch, repairBoards, touching, turnedBox } from './repair';
import type { AiBoard, AiSpec } from './spec';

type Boards = Extract<AiSpec, { kind: 'boards' }>;
const spec = (boards: AiBoard[], joints: Boards['joints'] = []): Boards => ({ kind: 'boards', name: 'T', boards, joints });
const r0 = { x: 0, y: 0, z: 0 };
const sheet = (name: string, o: Partial<AiBoard>): AiBoard => ({ name, stock: 'sheet', material: 'plywood', thickness: 0.75, length: 24, width: 12, x: 0, y: 0, z: 0, rotation: r0, ...o });

describe('turnedBox', () => {
  it('maps length/thickness/width through 90° turns', () => {
    expect(turnedBox([30, 0.75, 12], r0)).toEqual({ size: [30, 0.75, 12], lenAxis: 0 });
    expect(turnedBox([30, 0.75, 12], { x: 0, y: 0, z: 90 })).toEqual({ size: [0.75, 30, 12], lenAxis: 1 });
    expect(turnedBox([30, 0.25, 48], { x: 90, y: 0, z: 0 })).toEqual({ size: [30, 48, 0.25], lenAxis: 0 });
    expect(turnedBox([30, 1.5, 3.5], { x: 0, y: 90, z: 0 })).toEqual({ size: [3.5, 1.5, 30], lenAxis: 2 });
  });
});

describe('repairBoards', () => {
  it('leaves a clean design alone (no notes)', () => {
    const r = repairBoards(spec([sheet('A', {}), sheet('B', { y: 0.75 })], [{ type: 'butt', a: 0, b: 1 }]));
    expect(r.notes).toEqual([]);
    expect(r.joints).toEqual([{ type: 'butt', a: 0, b: 1 }]);
  });

  it('uses real stock sizes: lumber section from its name, sheet thickness to 1/4, 1/2, 3/4', () => {
    const r = repairBoards(spec([
      { name: 'Rail', stock: '2x4', length: 30, x: 0, y: 0, z: 0, rotation: r0 },
      sheet('Panel', { thickness: 0.7, y: 1.5 }),
    ]));
    expect(r.boards[0].size).toEqual([30, 1.5, 3.5]);
    expect(r.boards[1].size[1]).toBe(0.75);
    expect(r.notes).toContain('Used real sheet thickness (1/4, 1/2 or 3/4") for Panel.');
  });

  it('snaps to 1/16", squares turns and caps lumber at 12 ft', () => {
    const r = repairBoards(spec([{ name: 'Beam', stock: '2x6', length: 150.03, x: 0.01, y: 0, z: 0, rotation: { x: 0, y: 0, z: 88 } }]));
    expect(r.boards[0].size).toEqual([1.5, 144, 5.5]);
    expect(r.boards[0].min[0]).toBe(0);
    expect(r.notes).toEqual(['Squared up 1 turned board to 90°.', 'Cut Beam to 12 ft, the longest lumber stock.', 'Rounded sizes and positions to 1/16".']);
  });

  it('trims a board whose end runs into another', () => {
    const side = sheet('Side', { length: 30, rotation: { x: 0, y: 0, z: 90 } });
    const shelf = sheet('Shelf', { x: 0.5, y: 10, length: 20 });
    const r = repairBoards(spec([side, shelf]));
    expect(r.boards[1].min[0]).toBe(0.75);
    expect(r.boards[1].size[0]).toBe(19.75);
    expect(r.notes).toContain('Trimmed 1/4" off Shelf so it no longer runs into Side.');
    expect(touching(r.boards[0], r.boards[1])).toBe(true);
  });

  it('moves a board out along the shallowest overlap when trimming does not apply', () => {
    const r = repairBoards(spec([sheet('Base', {}), sheet('Lid', { y: 0.5 })]));
    expect(r.boards[1].min[1]).toBe(0.75);
    expect(r.notes).toContain('Moved Lid by 1/4" so it no longer overlaps Base.');
  });

  it('sets the piece on the floor', () => {
    const up = repairBoards(spec([sheet('A', { y: 3 })]));
    expect(up.boards[0].min[1]).toBe(0);
    expect(up.notes).toContain('Set it on the floor (it was 3" up).');
    const down = repairBoards(spec([sheet('A', { y: -1.5 })]));
    expect(down.notes).toContain('Set it on the floor (it went 1 1/2" below).');
  });

  it('drops boards not attached to the piece and remaps joints', () => {
    const r = repairBoards(spec([
      sheet('Floating', { y: 20 }), sheet('Base', {}), sheet('Top', { y: 0.75 }),
    ], [{ type: 'dado', a: 1, b: 2 }, { type: 'butt', a: 0, b: 2 }]));
    expect(r.boards.map((b) => b.name)).toEqual(['Base', 'Top']);
    expect(r.joints).toEqual([{ type: 'dado', a: 0, b: 1 }]);
    expect(r.notes).toContain('Removed 1 floating board: Floating.');
    expect(r.notes).toContain('Skipped 1 joint between boards that don\'t touch.');
  });

  it('skips joints between boards that do not touch, bad indices and duplicates', () => {
    const r = repairBoards(spec([sheet('A', {}), sheet('B', { z: 30 }), sheet('C', { x: 24 })],
      [{ type: 'butt', a: 0, b: 1 }, { type: 'butt', a: 0, b: 9 }, { type: 'butt', a: 2, b: 2 }, { type: 'pocket', a: 0, b: 2 }, { type: 'butt', a: 2, b: 0 }]));
    expect(r.joints).toEqual([{ type: 'pocket', a: 0, b: 2 }]);
    expect(r.notes).toContain('Skipped 3 joints between boards that don\'t touch.');
  });

  it('is deterministic', () => {
    const s = spec([sheet('A', { x: 0.03, y: 1 }), sheet('B', { y: 1.5 }), sheet('C', { y: 40 })], [{ type: 'butt', a: 0, b: 1 }]);
    expect(repairBoards(s)).toEqual(repairBoards(s));
  });

  it('formats fractions', () => {
    expect([inch(0.125), inch(1.5), inch(2), inch(0)]).toEqual(['1/8"', '1 1/2"', '2"', '0"']);
  });
});
