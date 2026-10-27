import { describe, expect, it } from 'vitest';
import { feetInches, formatLen, formatLens, formatSmallLen, inchFraction } from './lengthFormat';
import { parseFraction, isPartialFraction } from '../components/ui/NumberField';
import { generateCutList } from './exportUtils';
import { jointNote } from '../joinery/joints';
import { templateSummary } from '../builtins/builtIns';
import type { FurnitureObject, FurnitureProject, Joint } from '../types/furniture';
import { PRESET_WOOD_MATERIALS } from './woodTextureGenerator';

describe('one length format', () => {
  it('inches round to the nearest 1/16 and reduce the fraction', () => {
    expect(inchFraction(23.625)).toBe('23 5/8');
    expect(inchFraction(0.75)).toBe('3/4');
    expect(inchFraction(24)).toBe('24');
    expect(inchFraction(0.748)).toBe('3/4'); // 19 mm sheet goods read as 3/4
    expect(inchFraction(11.97)).toBe('12'); // rounds up across the whole number
    expect(inchFraction(0.01)).toBe('0');
    expect(inchFraction(-1.25)).toBe('-1 1/4');
    expect(inchFraction(-0.5)).toBe('-1/2');
    expect(inchFraction(1 / 3)).toBe('5/16');
  });
  it('shows the project unit: inch mark, feet and inches, whole mm, cm to 1 mm', () => {
    expect(formatLen(23.625, 'in')).toBe('23 5/8"');
    expect(formatLen(30.5, 'ft')).toBe(`2' 6 1/2"`);
    expect(formatLen(24, 'ft')).toBe(`2'`);
    expect(feetInches(7.25)).toBe('7 1/4"');
    expect(formatLen(24, 'mm')).toBe('610 mm');
    expect(formatLen(24, 'cm')).toBe('61 cm');
    expect(formatLen(0.75, 'cm')).toBe('1.9 cm');
    expect(formatSmallLen(0.25, 'ft')).toBe('1/4"');
    expect(formatLens([30, 24, 0.75], 'in')).toBe('30" × 24" × 3/4"');
    expect(formatLens([30, 24, 0.75], 'mm')).toBe('762 × 610 × 19 mm');
  });
  it('typed fractions parse back, negatives included', () => {
    expect(parseFraction('23 5/8"')).toBe(23.625);
    expect(parseFraction('-1 1/4')).toBe(-1.25);
    expect(parseFraction('-3/8')).toBe(-0.375);
    expect(parseFraction('-2.5')).toBe(-2.5);
    expect(isPartialFraction('-1 1/')).toBe(true);
    expect(isPartialFraction('-1', false)).toBe(false);
    for (const n of [0.0625, 0.75, 23.625, 47.9375, 96]) expect(parseFraction(formatLen(n, 'in'))).toBe(n);
  });
});

const mat = { ...PRESET_WOOD_MATERIALS.plywood };
const board = (id: string, dims: [number, number, number], pos: [number, number, number]): FurnitureObject => ({
  id, name: id, shape: 'board', dimensions: { length: dims[0], height: dims[1], width: dims[2] },
  position: { x: pos[0], y: pos[1], z: pos[2] }, rotation: { x: 0, y: 0, z: 0 }, material: mat,
});

describe('every display uses the same fractions', () => {
  it('cut list: 23 5/8" × 11 1/4" × 3/4", and feet projects still list inches', () => {
    const p = (unit: FurnitureProject['unit']) => ({ id: 'p', name: 'P', unit, objects: [board('shelf', [23.625, 0.75, 11.25], [0, 0, 0])] } as unknown as FurnitureProject);
    const [a] = generateCutList(p('in'));
    expect([a.length, a.width, a.height]).toEqual(['23 5/8"', '11 1/4"', '3/4"']);
    const [b] = generateCutList(p('ft'));
    expect(b.length).toBe('23 5/8"');
    const [c] = generateCutList(p('mm'));
    expect([c.length, c.width, c.height]).toEqual(['600 mm', '286 mm', '19 mm']);
  });
  it('joint notes and template summaries show fractions with marks', () => {
    const side = board('side', [0.75, 30, 12], [-12, 15, 0]);
    const shelf = board('shelf', [23.25, 0.75, 12], [0, 12, 0]);
    const j: Joint = { id: 'j', type: 'dado', receiverId: 'side', materId: 'shelf', face: '+x', depth: 0.25 } as Joint;
    expect(jointNote(j, 'shelf', side, shelf, 'in')).toBe('into dado 1/4"');
    expect(jointNote(j, 'shelf', side, shelf, 'ft')).toBe('into dado 1/4"');
    const g = { id: 'g', name: 'Bookshelf', shape: 'group', builtIn: { id: 'b', template: 'bookshelf', input: { v: 2, width: 35.5, height: 72, depth: 11.75, shelves: 4 } } } as unknown as FurnitureObject;
    expect(templateSummary(g, 'in')).toMatch(/^35 1\/2" × 72" × 11 3\/4"/);
  });
});
