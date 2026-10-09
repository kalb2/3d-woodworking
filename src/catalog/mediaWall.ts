import type {
  Dimensions3D,
  FurnitureObject,
  MediaWallParams,
  Position3D,
  WoodMaterial,
} from '../types/furniture';
import { PRESET_WOOD_MATERIALS } from '../utils/woodTextureGenerator';

/**
 * Simplified media-wall proof of concept.
 *
 * The full LiDAR spec also handles windows, doors, fireplaces, outlets, and
 * scribe gaps. This pass only centers a TV, spreads equal base cabinets across
 * the wall, and mirrors the uppers. Every part is a normal cube the editor
 * already knows how to move, resize, and list in the cut list.
 *
 * Scene units are inches. X runs along the wall, Y is up from the floor, and
 * Z is depth toward the camera. Positions are object centers.
 */

export const MEDIA_WALL_LIMITS = {
  wallWidth: [24, 360] as const,
  wallHeight: [48, 240] as const,
  tvSize: [43, 98] as const,
  baseCount: [1, 8] as const,
  baseDepth: [12, 24] as const,
};

export const MEDIA_WALL_DEFAULTS: MediaWallParams = {
  wallWidth: 144,
  wallHeight: 96,
  tvSize: 65,
  baseCount: 5,
  uppers: 'shelves',
  baseDepth: 18,
};

const WALL_THICKNESS = 0.5;
const SIDE_THICKNESS = 0.75;
const PANEL = 0.75;
const BASE_TOP = 30;
const TOE_HEIGHT = 4;
const TOE_SETBACK = 3;
const COUNTER_THICKNESS = 0.75;
const UPPER_DEPTH = 12;
const TV_ZONE_PAD = 12;
const TV_CENTER = 42;
const MIN_BAY = 6;
const SHELF_GAP_TARGET = 12;

const plywood = PRESET_WOOD_MATERIALS.plywood;

const wallFinish: WoodMaterial = {
  ...PRESET_WOOD_MATERIALS.custom_paint,
  name: 'Wall reference',
  baseColor: '#d7dee8',
  secondaryColor: '#c3ceda',
  grainIntensity: 0.05,
  roughness: 0.92,
  metalness: 0,
  varnishSheen: 'matte',
};

export interface GeneratedPart {
  name: string;
  shape: 'cube';
  dimensions: Dimensions3D;
  position: Position3D;
  rotation: { x: 0; y: 0; z: 0 };
  material: WoodMaterial;
  locked?: boolean;
  visible: true;
  generator: 'media-wall';
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function normalizeMediaWallParams(input: MediaWallParams): MediaWallParams {
  const [minWidth, maxWidth] = MEDIA_WALL_LIMITS.wallWidth;
  const [minHeight, maxHeight] = MEDIA_WALL_LIMITS.wallHeight;
  const [minTv, maxTv] = MEDIA_WALL_LIMITS.tvSize;
  const [minCount, maxCount] = MEDIA_WALL_LIMITS.baseCount;
  const [minDepth, maxDepth] = MEDIA_WALL_LIMITS.baseDepth;
  return {
    wallWidth: clamp(input.wallWidth, minWidth, maxWidth),
    wallHeight: clamp(input.wallHeight, minHeight, maxHeight),
    tvSize: clamp(input.tvSize, minTv, maxTv),
    baseCount: Math.round(clamp(input.baseCount, minCount, maxCount)),
    uppers: input.uppers === 'cabinets' ? 'cabinets' : 'shelves',
    baseDepth: clamp(input.baseDepth, minDepth, maxDepth),
  };
}

/** Cabinet count whose width lands nearest 30 in, preferring the 24–36 in band. */
export function suggestBaseCabinetCount(wallWidth: number): number {
  const width = clamp(wallWidth, MEDIA_WALL_LIMITS.wallWidth[0], MEDIA_WALL_LIMITS.wallWidth[1]);
  const inner = width - SIDE_THICKNESS * 2;
  let best = 1;
  let bestScore = Infinity;
  for (let count = MEDIA_WALL_LIMITS.baseCount[0]; count <= MEDIA_WALL_LIMITS.baseCount[1]; count += 1) {
    const each = inner / count;
    let score = Math.abs(each - 30);
    if (each < 24) score += 50 + (24 - each);
    if (each > 36) score += 50 + (each - 36);
    if (score < bestScore) {
      bestScore = score;
      best = count;
    }
  }
  return best;
}

function numbered(base: string, index: number): string {
  return index === 1 ? base : `${base} ${index}`;
}

function part(
  name: string,
  length: number,
  width: number,
  height: number,
  x: number,
  y: number,
  z: number,
  material: WoodMaterial,
  locked = false,
): GeneratedPart {
  return {
    name,
    shape: 'cube',
    dimensions: { length, width, height },
    position: { x, y, z },
    rotation: { x: 0, y: 0, z: 0 },
    material: { ...material },
    ...(locked ? { locked: true } : {}),
    visible: true,
    generator: 'media-wall',
  };
}

function shelfCenters(bottom: number, top: number): number[] {
  const opening = top - bottom;
  if (opening <= PANEL + 1) return [];
  let gaps = Math.max(2, Math.round(opening / SHELF_GAP_TARGET));
  let spacing = opening / gaps;
  while (gaps > 2 && spacing < 10) {
    gaps -= 1;
    spacing = opening / gaps;
  }
  while (spacing > 14 && opening / (gaps + 1) >= PANEL + 8) {
    gaps += 1;
    spacing = opening / gaps;
  }
  if (spacing <= PANEL + 0.5) return [];
  const centers: number[] = [];
  for (let index = 1; index < gaps; index += 1) centers.push(bottom + spacing * index);
  return centers;
}

/**
 * Parts for one media wall. Deterministic: the same parameters always return
 * the same names, sizes, and centers. Nothing here is zero, overlapping, or
 * outside the wall.
 */
export function generateMediaWall(input: MediaWallParams): GeneratedPart[] {
  const params = normalizeMediaWallParams(input);
  const { wallWidth, wallHeight, tvSize, baseCount, uppers, baseDepth } = params;
  const parts: GeneratedPart[] = [];

  const baseBack = -baseDepth / 2;
  const wallFront = baseBack;
  const wallCenterZ = wallFront - WALL_THICKNESS / 2;
  const counterTop = BASE_TOP + COUNTER_THICKNESS;
  const innerLeft = -wallWidth / 2 + SIDE_THICKNESS;
  const innerRight = wallWidth / 2 - SIDE_THICKNESS;
  const innerWidth = innerRight - innerLeft;
  const cabWidth = innerWidth / baseCount;

  parts.push(part(
    'Wall',
    wallWidth,
    WALL_THICKNESS,
    wallHeight,
    0,
    wallHeight / 2,
    wallCenterZ,
    wallFinish,
    true,
  ));

  const toeDepth = baseDepth - TOE_SETBACK;
  const toeCenterZ = baseBack + toeDepth / 2;
  for (let index = 0; index < baseCount; index += 1) {
    const x = innerLeft + cabWidth * (index + 0.5);
    const label = index + 1;
    parts.push(part(
      numbered('Base cabinet', label),
      cabWidth,
      baseDepth,
      BASE_TOP - TOE_HEIGHT,
      x,
      TOE_HEIGHT + (BASE_TOP - TOE_HEIGHT) / 2,
      0,
      plywood,
    ));
    parts.push(part(
      numbered('Toe kick', label),
      cabWidth,
      toeDepth,
      TOE_HEIGHT,
      x,
      TOE_HEIGHT / 2,
      toeCenterZ,
      plywood,
    ));
  }

  parts.push(part(
    'Countertop',
    innerWidth,
    baseDepth,
    COUNTER_THICKNESS,
    0,
    BASE_TOP + COUNTER_THICKNESS / 2,
    0,
    plywood,
  ));

  parts.push(part(
    'Side panel',
    SIDE_THICKNESS,
    baseDepth,
    wallHeight,
    -wallWidth / 2 + SIDE_THICKNESS / 2,
    wallHeight / 2,
    0,
    plywood,
  ));
  parts.push(part(
    'Side panel 2',
    SIDE_THICKNESS,
    baseDepth,
    wallHeight,
    wallWidth / 2 - SIDE_THICKNESS / 2,
    wallHeight / 2,
    0,
    plywood,
  ));

  let tvWidth = (tvSize * 87) / 100;
  let tvHeight = tvWidth * (9 / 16);
  const opening = wallHeight - counterTop;
  const scale = Math.min(1, innerWidth / tvWidth, opening / tvHeight);
  tvWidth *= scale;
  tvHeight *= scale;
  const halfTv = tvHeight / 2;
  const tvCenterY = clamp(TV_CENTER, counterTop + halfTv, wallHeight - halfTv);
  const backerDepth = 0.5;
  parts.push(part(
    'TV backer',
    tvWidth,
    backerDepth,
    tvHeight,
    0,
    tvCenterY,
    wallFront + backerDepth / 2,
    plywood,
  ));

  const zoneWidth = Math.min(tvWidth + TV_ZONE_PAD, innerWidth);
  const bay = (innerWidth - zoneWidth) / 2;
  if (bay >= MIN_BAY) {
    const upperDepth = Math.min(UPPER_DEPTH, baseDepth);
    const upperZ = wallFront + upperDepth / 2;
    const leftX = innerLeft + bay / 2;
    const rightX = innerRight - bay / 2;
    if (uppers === 'cabinets') {
      parts.push(part(
        'Upper cabinet',
        bay,
        upperDepth,
        opening,
        leftX,
        counterTop + opening / 2,
        upperZ,
        plywood,
      ));
      parts.push(part(
        'Upper cabinet 2',
        bay,
        upperDepth,
        opening,
        rightX,
        counterTop + opening / 2,
        upperZ,
        plywood,
      ));
    } else {
      const centers = shelfCenters(counterTop, wallHeight);
      let shelfIndex = 1;
      for (const y of centers) {
        parts.push(part(
          numbered('Shelf', shelfIndex),
          bay,
          upperDepth,
          PANEL,
          leftX,
          y,
          upperZ,
          plywood,
        ));
        shelfIndex += 1;
        parts.push(part(
          numbered('Shelf', shelfIndex),
          bay,
          upperDepth,
          PANEL,
          rightX,
          y,
          upperZ,
          plywood,
        ));
        shelfIndex += 1;
      }
    }
  }

  return parts;
}

function enclosure(parts: GeneratedPart[]): { dimensions: Dimensions3D; position: Position3D } {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const item of parts) {
    minX = Math.min(minX, item.position.x - item.dimensions.length / 2);
    maxX = Math.max(maxX, item.position.x + item.dimensions.length / 2);
    minY = Math.min(minY, item.position.y - item.dimensions.height / 2);
    maxY = Math.max(maxY, item.position.y + item.dimensions.height / 2);
    minZ = Math.min(minZ, item.position.z - item.dimensions.width / 2);
    maxZ = Math.max(maxZ, item.position.z + item.dimensions.width / 2);
  }
  return {
    dimensions: {
      length: Math.max(maxX - minX, 0.5),
      height: Math.max(maxY - minY, 0.5),
      width: Math.max(maxZ - minZ, 0.5),
    },
    position: {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
      z: (minZ + maxZ) / 2,
    },
  };
}

/** Group plus members, using the same id/parent shape as Insert layout and Group. */
export function buildMediaWallObjects(
  input: MediaWallParams,
  allocateId: (role: string, index: number) => string,
): FurnitureObject[] {
  const params = normalizeMediaWallParams(input);
  const parts = generateMediaWall(params);
  const groupId = allocateId('grp', 0);
  const box = enclosure(parts);
  const members: FurnitureObject[] = parts.map((item, index) => ({
    ...item,
    id: allocateId('part', index),
    parentId: groupId,
    material: { ...item.material },
    dimensions: { ...item.dimensions },
    position: { ...item.position },
    rotation: { ...item.rotation },
  }));
  const group: FurnitureObject = {
    id: groupId,
    name: 'Media wall',
    shape: 'group',
    dimensions: box.dimensions,
    position: box.position,
    rotation: { x: 0, y: 0, z: 0 },
    material: { ...PRESET_WOOD_MATERIALS.birch },
    visible: true,
    generator: 'media-wall',
    mediaWall: params,
  };
  return [...members, group];
}

/** Drop a previous generated media wall, then append the new one. */
export function replaceMediaWall(existing: FurnitureObject[], next: FurnitureObject[]): FurnitureObject[] {
  const groupIds = new Set(
    existing
      .filter((object) => object.generator === 'media-wall' && object.shape === 'group')
      .map((object) => object.id),
  );
  const kept = existing.filter((object) => {
    if (object.generator === 'media-wall') return false;
    if (object.parentId && groupIds.has(object.parentId)) return false;
    return true;
  });
  return [...kept, ...next];
}

export function projectHasMediaWall(objects: { generator?: FurnitureObject['generator'] }[]): boolean {
  return objects.some((object) => object.generator === 'media-wall');
}
