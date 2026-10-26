import { describe, expect, it } from 'vitest';
import type { FurnitureObject, FurnitureProject } from '../types/furniture';
import { cutListByMaterial, generateCutList } from './exportUtils';
import { PRESET_WOOD_MATERIALS } from './woodTextureGenerator';

const part = (id: string, dims: [number, number, number], extra: Partial<FurnitureObject> = {}): FurnitureObject => ({
  id, name: id, shape: 'board', dimensions: { length: dims[0], height: dims[1], width: dims[2] }, position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
  material: { ...PRESET_WOOD_MATERIALS.plywood }, ...extra,
});
const project = (objects: FurnitureObject[], unit: FurnitureProject['unit'] = 'in') => ({ id: 'p', name: 'P', unit, objects } as unknown as FurnitureProject);

describe('cut list', () => {
  it('merges identical boards regardless of orientation; keeps 3/4" exact; parts in nested groups count', () => {
    const items = generateCutList(project([
      part('G', [10, 10, 10], { shape: 'group' }),
      part('H', [10, 10, 10], { shape: 'group', parentId: 'G' }),
      part('side L', [0.75, 30, 24], { parentId: 'H' }),
      part('side R', [24, 0.75, 30], { parentId: 'G' }),
      part('door', [15, 30, 0.75], { material: { ...PRESET_WOOD_MATERIALS.mdf } }),
      part('legacy', [15, 30, 0.75], { material: { ...PRESET_WOOD_MATERIALS.mdf }, visible: undefined }),
      part('hidden', [5, 5, 5], { visible: false }),
      part('wall', [100, 96, 4], { generator: 'room-scan' }),
    ]));
    expect(items).toHaveLength(2);
    const sides = items.find((i) => i.material === 'Plywood')!;
    expect(sides.quantity).toBe(2);
    expect([sides.length, sides.width, sides.height]).toEqual(['30"', '24"', '3/4"']);
    expect(items.find((i) => i.material === 'MDF')!.quantity).toBe(2);
    expect(cutListByMaterial(items).map((g) => g.material)).toEqual(['MDF', 'Plywood']);
  });

  it('shows sizes in the project unit', () => {
    const [it0] = generateCutList(project([part('a', [24, 0.75, 12])], 'mm'));
    expect([it0.length, it0.width, it0.height]).toEqual(['610 mm', '305 mm', '19 mm']);
  });
});
