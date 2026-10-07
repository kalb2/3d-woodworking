import type { Dimensions3D, FurnitureProject, ShapeType } from '../types/furniture';

export type ShapeGroup = 'Blocks' | 'Boards' | 'Rounds';

export interface ShapeCatalogEntry {
  type: Exclude<ShapeType, 'group'>;
  /** Full Add-menu and cut-list label. */
  label: string;
  /** Compact phone grid label. */
  shortLabel: string;
  group: ShapeGroup;
  hint: string;
  defaultName: string;
  dimensions: Dimensions3D;
}

/**
 * Shape type ids stay stable so saved projects load.
 * Labels are stock and primitive names, not finished furniture.
 */
export const SHAPE_CATALOG: ShapeCatalogEntry[] = [
  {
    type: 'cube',
    label: 'Box',
    shortLabel: 'Box',
    group: 'Blocks',
    hint: 'Solid rectangular block',
    defaultName: 'Box',
    dimensions: { length: 12, width: 12, height: 12 },
  },
  {
    type: 'wedge',
    label: 'Wedge',
    shortLabel: 'Wedge',
    group: 'Blocks',
    hint: 'Triangular prism',
    defaultName: 'Wedge',
    dimensions: { length: 12, width: 8, height: 6 },
  },
  {
    type: 'cushion',
    label: 'Rounded Block',
    shortLabel: 'Round block',
    group: 'Blocks',
    hint: 'Soft-edged block',
    defaultName: 'Rounded Block',
    dimensions: { length: 18, width: 18, height: 4 },
  },
  {
    type: 'board',
    label: 'Board / Plank',
    shortLabel: 'Plank',
    group: 'Boards',
    hint: 'Flat board with optional holes',
    defaultName: 'Plank',
    dimensions: { length: 24, width: 8, height: 0.75 },
  },
  {
    type: 'bevel_top',
    label: 'Beveled Board',
    shortLabel: 'Beveled',
    group: 'Boards',
    hint: 'Flat board with a beveled edge',
    defaultName: 'Beveled Board',
    dimensions: { length: 36, width: 12, height: 1.5 },
  },
  {
    type: 'cylinder',
    label: 'Cylinder / Dowel',
    shortLabel: 'Dowel',
    group: 'Rounds',
    hint: 'Round stock, short or long',
    defaultName: 'Dowel',
    dimensions: { length: 1.5, width: 1.5, height: 16 },
  },
  {
    type: 'pole',
    label: 'Round Stock',
    shortLabel: 'Round stock',
    group: 'Rounds',
    hint: 'Longer cylinder',
    defaultName: 'Round Stock',
    dimensions: { length: 2.5, width: 2.5, height: 36 },
  },
  {
    type: 'sphere',
    label: 'Sphere / Ball',
    shortLabel: 'Ball',
    group: 'Rounds',
    hint: 'Round solid',
    defaultName: 'Ball',
    dimensions: { length: 4, width: 4, height: 4 },
  },
];

export const SHAPE_GROUPS: ShapeGroup[] = ['Blocks', 'Boards', 'Rounds'];

const BY_TYPE = new Map(SHAPE_CATALOG.map((entry) => [entry.type, entry]));

export function shapeCatalogEntry(shape: string): ShapeCatalogEntry | undefined {
  return BY_TYPE.get(shape as ShapeCatalogEntry['type']);
}

export function shapeLabel(shape: string): string {
  if (shape === 'group') return 'Group';
  return shapeCatalogEntry(shape)?.label ?? shape.replaceAll('_', ' ');
}

export function nextStockName(existing: string[], base: string): string {
  if (!existing.includes(base)) return base;
  let index = 2;
  while (existing.includes(`${base} ${index}`)) index += 1;
  return `${base} ${index}`;
}

/**
 * Auto-generated furniture names from older builds.
 * Type ids are unchanged; only these exact display names are rewritten on load.
 */
const LEGACY_PART_NAMES: Record<string, string> = {
  'Table Top': 'Beveled Board',
  'Starting Cube': 'Box',
  'Front Left Leg': 'Dowel',
  'Front Right Leg': 'Dowel',
  'Back Left Leg': 'Dowel',
  'Back Right Leg': 'Dowel',
  'Leg FL': 'Dowel',
  'Leg FR': 'Dowel',
  'Leg BL': 'Dowel',
  'Leg BR': 'Dowel',
  'Chair Seat': 'Beveled Board',
  'Backrest': 'Box',
  'Left Panel': 'Box',
  'Right Panel': 'Box',
  'Bottom Shelf': 'Beveled Board',
  'Middle Shelf': 'Beveled Board',
  'Upper Shelf': 'Beveled Board',
  'Top Panel': 'Beveled Board',
  'Base Component': 'Box',
  'Cube Component': 'Box',
  'Cylinder Component': 'Dowel',
  'Sphere Component': 'Ball',
  'Wedge Component': 'Wedge',
  'Cushion Component': 'Rounded Block',
  'Bevel_top Component': 'Beveled Board',
  'Pole Component': 'Round Stock',
  'Beveled Tabletop': 'Beveled Board',
  'Round Leg / Pole': 'Dowel',
  'Sphere Knob': 'Ball',
  'Soft Cushion': 'Rounded Block',
  'Box / Panel': 'Box',
  'Board / Panel': 'Plank',
};

const LEGACY_PROJECT_NAMES: Record<string, string> = {
  'Living Room Coffee Table': 'Starter Layout',
  'Untitled Furniture': 'Untitled Project',
};

function claimName(used: Set<string>, base: string): string {
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let index = 2;
  while (used.has(`${base} ${index}`)) index += 1;
  const name = `${base} ${index}`;
  used.add(name);
  return name;
}

function migrateProject(project: FurnitureProject): FurnitureProject {
  const used = new Set<string>();
  for (const object of project.objects) {
    if (!LEGACY_PART_NAMES[object.name]) used.add(object.name);
  }

  let renamed = false;
  const objects = project.objects.map((object) => {
    const mapped = LEGACY_PART_NAMES[object.name];
    if (!mapped) return object;
    renamed = true;
    return { ...object, name: claimName(used, mapped) };
  });

  const name = LEGACY_PROJECT_NAMES[project.name] ?? project.name;
  if (!renamed && name === project.name) return project;
  return { ...project, name, objects };
}

export function migrateLegacyLabels(projects: FurnitureProject[]): FurnitureProject[] {
  return projects.map(migrateProject);
}
