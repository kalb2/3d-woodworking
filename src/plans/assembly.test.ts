import { describe, expect, it } from 'vitest';
import type { FurnitureObject } from '../types/furniture';
import { assemblySteps, partRole } from './assembly';
import { pieceBox } from './geometry';
import { templateProject } from './testProjects';

const board = (name: string, pos: [number, number, number], dims: [number, number, number]): FurnitureObject => ({
  id: name, name, shape: 'board', position: { x: pos[0], y: pos[1], z: pos[2] }, rotation: { x: 0, y: 0, z: 0 },
  dimensions: { length: dims[0], height: dims[1], width: dims[2] }, material: { species: 'birch' },
} as unknown as FurnitureObject);

describe('assembly order', () => {
  it('builds a bookshelf carcass first, then shelves, back and base', () => {
    const steps = assemblySteps(templateProject('bookshelf', 'Bookshelf'));
    expect(steps.map((s) => s.title)).toEqual([
      'Carcass: sides, bottom and top', 'Dividers and fixed shelves', 'Back', 'Base and toe kick',
    ]);
    expect(steps[0].parts.map((p) => p.name)).toEqual(['Side L', 'Side R', 'Bottom', 'Top']);
    expect(steps[0].joints).toContain('Dado: Bottom into Side L and Side R');
    expect(steps[1].joints).toEqual(['Dado: Shelf 1, Shelf 2, Shelf 3 and Shelf 4 into Side L and Side R']);
    expect(steps[2].joints).toEqual(['Rabbet: Back into Side L and Side R']);
    expect(steps.map((s) => s.n)).toEqual([1, 2, 3, 4]);
  });
  it('hangs base-cabinet doors after the case and ends with hardware and loose shelves', () => {
    const steps = assemblySteps(templateProject('base-cabinet', 'Base cabinet'));
    const titles = steps.map((s) => s.title);
    expect(titles[0]).toMatch(/^Carcass/);
    expect(titles.indexOf('Back')).toBeLessThan(titles.indexOf('Doors'));
    const last = steps[steps.length - 1];
    expect(last.title).toBe('Hardware');
    expect(last.hardware!.some((h) => /Hinges/.test(h))).toBe(true);
    // The shelf has no joints: it sits on pins, so it goes in with the hardware.
    expect(last.parts.map((p) => p.name)).toContain('Shelf 1');
  });
  it('lists every part exactly once', () => {
    const p = templateProject('base-cabinet', 'Base cabinet');
    const ids = assemblySteps(p).flatMap((s) => s.parts.map((x) => x.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(p.objects.filter((o) => o.shape !== 'group').length);
  });
  it('reads roles from position when names say nothing', () => {
    const parts = [
      board('A', [-15.6, 15, 0], [0.75, 30, 12]), board('B', [15.6, 15, 0], [0.75, 30, 12]),
      board('C', [0, 0.4, 0], [30.5, 0.75, 12]), board('D', [0, 15, 0], [30.5, 0.75, 11]),
      board('E', [0, 15, -5.9], [30.5, 30, 0.25]), board('F', [0, 15, 6.2], [15, 29, 0.75]),
    ];
    const box = pieceBox(parts);
    expect(parts.map((p) => partRole(p, box))).toEqual(['side', 'side', 'bottom', 'shelf', 'back', 'door']);
  });
});
