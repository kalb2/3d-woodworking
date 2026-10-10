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
