import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { defaultBoardOptions, createBoardGeometry } from './boardGeometry';
import { cutHoles, getHoles, holesUpdate, newHole } from './holes';
import type { FurnitureObject } from '../types/furniture';
import { PRESET_WOOD_MATERIALS } from './woodTextureGenerator';

const base = (shape: FurnitureObject['shape'], extra: Partial<FurnitureObject> = {}): FurnitureObject => ({
  id: 'o', name: 'o', shape, dimensions: { length: 24, height: 0.75, width: 12 }, position: { x: 0, y: 1, z: 0 },
  rotation: { x: 0, y: 0, z: 0 }, material: PRESET_WOOD_MATERIALS.birch, ...extra,
});

describe('hole defaults', () => {
  it('new boards have no holes', () => {
    expect(defaultBoardOptions().holes).toEqual([]);
  });
  it('existing holes (incl. the old default) are kept as-is', () => {
    const legacy = base('board', { board: { cornerRadius: 0.75, edge: 'roundover', holes: [{ id: 'hole_1', x: 0, z: 0, diameter: 1.5 }] } });
    expect(getHoles(legacy)).toHaveLength(1);
    const migrated = JSON.parse(JSON.stringify(legacy)) as FurnitureObject;
    expect(getHoles(migrated)[0]).toEqual({ id: 'hole_1', x: 0, z: 0, diameter: 1.5 });
  });
  it('stores holes on board.holes for boards and on holes for boxes', () => {
    const board = base('board', { board: defaultBoardOptions() });
    const cube = base('cube');
    expect(holesUpdate(board, [newHole(board)]).board!.holes).toHaveLength(1);
    expect(holesUpdate(cube, [newHole(cube)]).holes).toHaveLength(1);
  });
});

describe('cutHoles', () => {
  const d = { length: 24, height: 4, width: 12 };
  const box = () => new THREE.BoxGeometry(d.length, d.height, d.width);
  it('cuts through, blind, front, side and rectangular holes', () => {
    const plain = box().toNonIndexed().getAttribute('position').count;
    for (const h of [
      { id: 'a', x: 0, z: 0, diameter: 2 },
      { id: 'b', x: 5, z: 2, diameter: 1, depth: 1 },
      { id: 'c', x: 0, z: 0, diameter: 1, face: 'front' as const },
      { id: 'd', x: 0, z: 0, diameter: 1, face: 'side' as const, depth: 2 },
      { id: 'e', x: -6, z: 0, diameter: 3, kind: 'rect' as const, height: 1 },
    ]) {
      const out = cutHoles(box(), d, [h]);
      expect(out.getAttribute('position').count, h.id).toBeGreaterThan(plain);
    }
  });
  it('leaves boards\' simple through-holes to the outline', () => {
    const board = createBoardGeometry(d, { cornerRadius: 0, edge: 'none', holes: [{ id: 'a', x: 0, z: 0, diameter: 2 }] });
    expect(cutHoles(board, d, [{ id: 'a', x: 0, z: 0, diameter: 2 }], true)).toBe(board);
  });
});

import { clampHole, describeHole, faceFromNormal, faceTowards, hitsHole, localToHole } from './holes';
describe('hole mode helpers', () => {
  const d = { length: 24, height: 0.75, width: 12 };
  it('maps part-local face points to hole offsets', () => {
    expect(localToHole('top', { x: 3, y: 0.375, z: -2 })).toEqual({ x: 3, z: 2 });
    expect(localToHole('front', { x: 3, y: 0.1, z: 6 })).toEqual({ x: 3, z: 0.1 });
    expect(localToHole('side', { x: 12, y: 0.1, z: -4 })).toEqual({ x: -4, z: 0.1 });
  });
  it('keeps the hole inside its face', () => {
    expect(clampHole(d, { id: 'a', x: 50, z: -50, diameter: 2 })).toMatchObject({ x: 11, z: -5 });
    expect(clampHole(d, { id: 'b', x: 50, z: 0, diameter: 2, kind: 'rect', height: 4, face: 'top' })).toMatchObject({ x: 11, z: 0 });
  });
  it('picks faces from normals and camera direction', () => {
    expect(faceFromNormal({ x: 0, y: 1, z: 0 })).toBe('top');
    expect(faceFromNormal({ x: 0, y: -1, z: 0 })).toBeNull();
    expect(faceTowards({ x: 0.2, y: 0.3, z: 0.9 })).toBe('front');
  });
  it('detects taps on a hole and describes it cleanly', () => {
    const h = { id: 'a', x: 2, z: 1, diameter: 1 };
    expect(hitsHole(h, 'top', { x: 2.3, z: 1.2 })).toBe(true);
    expect(hitsHole(h, 'front', { x: 2, z: 1 })).toBe(false);
    expect(describeHole(h, 'in', 1)).toBe('Round Ø 1 in · Top');
  });
});

describe('notches', () => {
  const d = { length: 24, height: 4, width: 12 };
  const obj = { id: 'o', name: 'o', shape: 'cube' as const, dimensions: d, position: { x: 0, y: 2, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, material: PRESET_WOOD_MATERIALS.birch };
  it('defaults to 1.5 × 0.75 on an edge, through', () => {
    const n = newHole(obj, 0, 'notch', 'top');
    expect(n).toMatchObject({ kind: 'notch', diameter: 1.5, height: 0.75, edge: 'v+', x: 0, z: 5.625 });
    expect(n.depth).toBeUndefined();
    expect(describeHole(n, 'in', 1)).toBe('Notch 1.5 × 0.75 in · Back edge');
  });
  it('snaps to the nearest edge and slides along it', () => {
    const n = newHole(obj, 0, 'notch', 'top');
    expect(clampHole(d, { ...n, x: 11.9, z: 0 })).toMatchObject({ edge: 'u+', x: 11.625 });
    expect(clampHole(d, { ...n, x: 3, z: -5.9 })).toMatchObject({ edge: 'v-', x: 3, z: -5.625 });
    expect(clampHole(d, { ...n, x: 11.5, z: 5.99 })).toMatchObject({ edge: 'v+', x: 11.25 });
  });
  it('cuts an open notch (geometry changes; cutter reaches past the edge)', () => {
    const plain = new THREE.BoxGeometry(24, 4, 12).toNonIndexed().getAttribute('position').count;
    const n = newHole(obj, 0, 'notch', 'front');
    const out = cutHoles(new THREE.BoxGeometry(24, 4, 12), d, [n]);
    expect(out.getAttribute('position').count).toBeGreaterThan(plain);
    out.computeBoundingBox();
    // The top edge of the front face is opened: the box still spans full height elsewhere.
    expect(out.boundingBox!.max.y).toBeCloseTo(2);
  });
});
