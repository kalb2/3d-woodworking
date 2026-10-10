import type { FurnitureObject, PresetTemplate } from '../types/furniture';
import { defaultBoardOptions } from '../utils/boardGeometry';
import { PRESET_WOOD_MATERIALS } from '../utils/woodTextureGenerator';

const birch = PRESET_WOOD_MATERIALS.birch;
const pine = PRESET_WOOD_MATERIALS.pine;
const oak = PRESET_WOOD_MATERIALS.oak;
const walnut = PRESET_WOOD_MATERIALS.walnut;

function part(
  name: string,
  shape: FurnitureObject['shape'],
  dimensions: FurnitureObject['dimensions'],
  position: FurnitureObject['position'],
  material: FurnitureObject['material'],
): Omit<FurnitureObject, 'id'> {
  return {
    name,
    shape,
    dimensions,
    position,
    rotation: { x: 0, y: 0, z: 0 },
    material: { ...material },
    visible: true,
    board: shape === 'board' ? defaultBoardOptions() : undefined,
  };
}

/**
 * Local starter projects. No server. Dimensions are inches.
 * Names are shapes and stock, not finished furniture.
 */
export const PROJECT_TEMPLATES: PresetTemplate[] = [
  {
    id: 'starter-box',
    name: 'Starter Box',
    description: 'One solid box on the floor. Resize it into the stock you need.',
    category: 'Blocks',
    featured: true,
    author: 'The Workbench',
    objects: [
      part('Box', 'cube', { length: 12, width: 12, height: 12 }, { x: 0, y: 6, z: 0 }, birch),
    ],
  },
  {
    id: 'plank-stack',
    name: 'Board Stack',
    description: 'Three flat boards stacked with a small gap so you can grab each one.',
    category: 'Boards',
    featured: true,
    author: 'The Workbench',
    objects: [
      part('Board', 'board', { length: 24, width: 6, height: 0.75 }, { x: 0, y: 0.375, z: 0 }, pine),
      part('Board 2', 'board', { length: 24, width: 6, height: 0.75 }, { x: 0, y: 1.5, z: 0 }, pine),
      part('Board 3', 'board', { length: 20, width: 6, height: 0.75 }, { x: 0, y: 2.625, z: 0 }, oak),
    ],
  },
  {
    id: 'dowel-and-ball',
    name: 'Dowel and Ball',
    description: 'A length of round stock beside a sphere. Useful for posts, pegs, and knobs.',
    category: 'Rounds',
    featured: true,
    author: 'The Workbench',
    objects: [
      part('Dowel', 'cylinder', { length: 1.5, width: 1.5, height: 18 }, { x: -3, y: 9, z: 0 }, walnut),
      part('Ball', 'sphere', { length: 4, width: 4, height: 4 }, { x: 4, y: 2, z: 0 }, oak),
    ],
  },
  {
    id: 'sheet-and-strips',
    name: 'Sheet and Strips',
    description: 'A flat board with two narrow strips. Start a carcass, a lid, or a simple frame.',
    category: 'Boards',
    featured: true,
    author: 'The Workbench',
    objects: [
      part('Flat Board', 'cube', { length: 36, width: 18, height: 0.75 }, { x: 0, y: 0.375, z: 0 }, birch),
      part('Strip', 'cube', { length: 36, width: 1.5, height: 3.5 }, { x: 0, y: 2.5, z: -8 }, pine),
      part('Strip 2', 'cube', { length: 36, width: 1.5, height: 3.5 }, { x: 0, y: 2.5, z: 8 }, pine),
    ],
  },
  {
    id: 'open-frame',
    name: 'Open Frame',
    description: 'Four boxes butted into a rectangle. Move them apart or resize them into rails.',
    category: 'Layouts',
    featured: true,
    author: 'The Workbench',
    objects: [
      part('Long Box', 'cube', { length: 32, width: 1.5, height: 3.5 }, { x: 0, y: 1.75, z: -8 }, oak),
      part('Long Box 2', 'cube', { length: 32, width: 1.5, height: 3.5 }, { x: 0, y: 1.75, z: 8 }, oak),
      part('Short Box', 'cube', { length: 1.5, width: 16, height: 3.5 }, { x: -15.25, y: 1.75, z: 0 }, oak),
      part('Short Box 2', 'cube', { length: 1.5, width: 16, height: 3.5 }, { x: 15.25, y: 1.75, z: 0 }, oak),
    ],
  },
  {
    id: 'beveled-slab',
    name: 'Beveled Slab',
    description: 'A single beveled board on four short dowels. Stock only — rename anything you like.',
    category: 'Layouts',
    featured: false,
    author: 'The Workbench',
    objects: [
      part('Beveled Board', 'bevel_top', { length: 28, width: 16, height: 1.25 }, { x: 0, y: 8.625, z: 0 }, walnut),
      part('Dowel', 'cylinder', { length: 1.25, width: 1.25, height: 8 }, { x: -12, y: 4, z: -6 }, walnut),
      part('Dowel 2', 'cylinder', { length: 1.25, width: 1.25, height: 8 }, { x: 12, y: 4, z: -6 }, walnut),
      part('Dowel 3', 'cylinder', { length: 1.25, width: 1.25, height: 8 }, { x: -12, y: 4, z: 6 }, walnut),
      part('Dowel 4', 'cylinder', { length: 1.25, width: 1.25, height: 8 }, { x: 12, y: 4, z: 6 }, walnut),
    ],
  },
];

export function findTemplate(id: string): PresetTemplate | undefined {
  return PROJECT_TEMPLATES.find((template) => template.id === id);
}

export function featuredTemplates(): PresetTemplate[] {
  return PROJECT_TEMPLATES.filter((template) => template.featured);
}

export function instantiateTemplate(templateId: string): FurnitureObject[] | null {
  const template = findTemplate(templateId);
  if (!template) return null;
  const stamp = Date.now();
  return template.objects.map((object, index) => ({
    ...object,
    id: `obj_${stamp}_${index}_${Math.random().toString(36).slice(2, 6)}`,
    material: { ...object.material },
    dimensions: { ...object.dimensions },
    position: { ...object.position },
    rotation: { ...object.rotation },
    board: object.board
      ? {
          ...object.board,
          holes: object.board.holes.map((hole) => ({ ...hole, id: `hole_${stamp}_${index}` })),
        }
      : undefined,
  }));
}
