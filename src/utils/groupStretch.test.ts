import { describe, expect, it } from 'vitest';
import type { FurnitureObject } from '../types/furniture';
import { objectBox } from '../state/groupTree';
import { stretchBox, stretchObjects } from './groupStretch';

const mat = { id: 'plywood', name: 'Plywood', species: 'plywood', baseColor: '#000', secondaryColor: '#000', grainIntensity: 0, grainScale: 1, roughness: 1, metalness: 0, varnishSheen: 'matte' } as FurnitureObject['material'];
const part = (id: string, d: [number, number, number], p: [number, number, number], extra: Partial<FurnitureObject> = {}): FurnitureObject => ({
  id, name: id, shape: 'board', dimensions: { length: d[0], height: d[1], width: d[2] },
  position: { x: p[0], y: p[1], z: p[2] }, rotation: { x: 0, y: 0, z: 0 }, material: mat, ...extra,
});
// A 20×20 base (3/4" thick) with four 1 1/2" legs standing on it, all in one group.
const table = (): FurnitureObject[] => [
  part('G', [20, 30, 20], [0, 15, 0], { shape: 'group' }),
  part('base', [20, 0.75, 20], [0, 0.375, 0], { parentId: 'G' }),
  ...[[-9.25, -9.25], [9.25, -9.25], [-9.25, 9.25], [9.25, 9.25]].map(([x, z], i) =>
    part(`leg${i}`, [1.5, 29.25, 1.5], [x, 15.375, z], { parentId: 'G' })),
];
const by = (objs: FurnitureObject[], id: string) => objs.find((o) => o.id === id)!;

describe('group stretch', () => {
  it('pulling the top face up lengthens the legs; the base keeps its thickness and the bottom stays put', () => {
    const out = stretchObjects(table(), ['G'], '+y', 40);
    for (let i = 0; i < 4; i++) {
      expect(by(out, `leg${i}`).dimensions.height).toBe(39.25);
      expect(objectBox(by(out, `leg${i}`)).min.y).toBeCloseTo(0.75); // still on the base
    }
    expect(by(out, 'base')).toMatchObject({ dimensions: { height: 0.75 }, position: { y: 0.375 } });
    expect(by(out, 'G').dimensions.height).toBe(40);
    expect(by(out, 'G').position.y).toBe(20);
  });

  it('a top board rides up on the legs instead of getting thicker', () => {
    const objs = [...table(), part('top', [20, 0.75, 20], [0, 30.375, 0], { parentId: 'G' })];
    const out = stretchObjects(objs, ['G'], '+y', 40.75);
    expect(by(out, 'top')).toMatchObject({ dimensions: { height: 0.75 }, position: { y: 40.375 } });
    expect(by(out, 'leg0').dimensions.height).toBe(39.25);
  });

  it('widening keeps the legs square and moves the far ones; the base widens from the fixed side', () => {
    const out = stretchObjects(table(), ['G'], '+x', 30);
    expect(by(out, 'base').dimensions.length).toBe(30);
    expect(objectBox(by(out, 'base')).min.x).toBeCloseTo(-10);
    expect(by(out, 'leg0')).toMatchObject({ dimensions: { length: 1.5 }, position: { x: -9.25 } });
    expect(by(out, 'leg1')).toMatchObject({ dimensions: { length: 1.5 }, position: { x: 19.25 } });
  });

  it('pushing the -x face keeps the +x side fixed', () => {
    const out = stretchObjects(table(), ['G'], '-x', 16);
    expect(objectBox(by(out, 'base')).max.x).toBeCloseTo(10);
    expect(by(out, 'base').dimensions.length).toBe(16);
    expect(by(out, 'leg0').position.x).toBeCloseTo(-5.25);
    expect(by(out, 'leg1').position.x).toBeCloseTo(9.25);
  });

  it('snaps the group size to the step and stops the bottom at the floor', () => {
    expect(by(stretchObjects(table(), ['G'], '+y', 35.1, { snap: true, step: 0.25 }), 'G').dimensions.height).toBe(35);
    expect(stretchObjects(table(), ['G'], '-y', 50, { floorOn: true })).toEqual(table());
  });

  it('works through nested groups and refits them', () => {
    const objs = table().map((o) => (o.id.startsWith('leg') ? { ...o, parentId: 'L' } : o));
    objs.push(part('L', [20, 29.25, 20], [0, 15.375, 0], { shape: 'group', parentId: 'G' }));
    const out = stretchObjects(objs, ['G'], '+y', 40);
    expect(by(out, 'leg2').dimensions.height).toBe(39.25);
    expect(by(out, 'L').dimensions.height).toBeCloseTo(39.25);
    expect(by(out, 'G').dimensions.height).toBeCloseTo(40);
  });

  it('a multi-selection stretches the same way', () => {
    const objs = table().map((o) => ({ ...o, parentId: undefined })).filter((o) => o.id !== 'G');
    const out = stretchObjects(objs, ['base', 'leg0', 'leg1'], '+y', 20.75);
    expect(by(out, 'leg0').dimensions.height).toBe(20);
    expect(by(out, 'leg2').dimensions.height).toBe(29.25); // not selected
  });

  it('a turned (90°) leg stretches along its own axis', () => {
    const objs = table().map((o) => (o.id === 'leg0' ? { ...o, dimensions: { length: 29.25, height: 1.5, width: 1.5 }, rotation: { x: 0, y: 0, z: 90 } } : o));
    const out = stretchObjects(objs, ['G'], '+y', 40);
    expect(by(out, 'leg0').dimensions.length).toBe(39.25);
  });

  it('refuses rotated groups and scanned rooms', () => {
    expect(stretchBox(table().map((o) => (o.id === 'G' ? { ...o, rotation: { x: 0, y: 30, z: 0 } } : o)), ['G'])).toBeNull();
    expect(stretchBox([part('w', [100, 96, 4], [0, 48, 0], { generator: 'room-scan' })], ['w'])).toBeNull();
  });
});
