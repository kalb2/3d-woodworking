import type { FurnitureObject, WoodMaterial } from '../types/furniture';
import { defaultBoardOptions } from '../utils/boardGeometry';
import { PRESET_WOOD_MATERIALS } from '../utils/woodTextureGenerator';

/** Tag stored on every generated part so a re-run can find and replace it. */
export const MEDIA_WALL_TAG = 'media-wall';

export type UpperStyle = 'shelves' | 'cabinets';

export interface MediaWallInput {
  wallWidth: number;
  wallHeight: number;
  /** Diagonal, inches (16:9). */
  tvSize: number;
  baseCount?: number;
  upperStyle: UpperStyle;
  baseDepth: number;
}

export type MediaWallPart = Omit<FurnitureObject, 'id'>;

export const MEDIA_WALL_DEFAULTS: MediaWallInput = {
  wallWidth: 144,
  wallHeight: 96,
  tvSize: 65,
  upperStyle: 'shelves',
  baseDepth: 18,
};

const WALL_T = 0.5;
const PANEL_T = 0.75;
const TOE_H = 4;
const TOE_SETBACK = 3;
const MAX_BASE_TOP = 31;
const MIN_BASE_TOP = 16;
const TV_CLEARANCE = 2;
const TOP_T = 1;
const UPPER_DEPTH = 12;
const TV_CENTER = 42;
const MIN_UPPER = 6;

const r = (n: number) => Math.round(n * 1000) / 1000;

export function autoBaseCount(wallWidth: number): number {
  return Math.max(2, Math.min(12, Math.round(wallWidth / 36)));
}

/** Top of the base run (floor to top of top panel) for a TV size. */
export function baseSurfaceHeight(tvSize: number): number {
  const tv = tvDimensions(tvSize);
  return Math.max(MIN_BASE_TOP, Math.min(MAX_BASE_TOP, TV_CENTER - tv.height / 2 - TV_CLEARANCE));
}

export function tvDimensions(diagonal: number) {
  return { width: r(diagonal * 0.8716), height: r(diagonal * 0.4903) };
}

/** Clamp user input into something buildable. Pure. */
export function normalizeMediaWallInput(input: MediaWallInput): Required<MediaWallInput> {
  const wallWidth = Math.max(60, Math.min(360, input.wallWidth || MEDIA_WALL_DEFAULTS.wallWidth));
  const wallHeight = Math.max(60, Math.min(192, input.wallHeight || MEDIA_WALL_DEFAULTS.wallHeight));
  const tvSize = Math.max(24, Math.min(110, input.tvSize || MEDIA_WALL_DEFAULTS.tvSize));
  const baseDepth = Math.max(UPPER_DEPTH, Math.min(30, input.baseDepth || MEDIA_WALL_DEFAULTS.baseDepth));
  const maxCount = Math.max(1, Math.floor(wallWidth / 12));
  const baseCount = Math.max(1, Math.min(maxCount, Math.round(input.baseCount || autoBaseCount(wallWidth))));
  const upperStyle: UpperStyle = input.upperStyle === 'cabinets' ? 'cabinets' : 'shelves';
  return { wallWidth, wallHeight, tvSize, baseDepth, baseCount, upperStyle };
}

function mat(base: WoodMaterial, overrides: Partial<WoodMaterial> = {}): WoodMaterial {
  return { ...base, ...overrides };
}

function part(
  name: string,
  shape: 'cube' | 'board',
  size: { x: number; y: number; z: number },
  min: { x: number; y: number; z: number },
  material: WoodMaterial,
): MediaWallPart {
  return {
    name,
    shape,
    dimensions: { length: r(size.x), height: r(size.y), width: r(size.z) },
    position: { x: r(min.x + size.x / 2), y: r(min.y + size.y / 2), z: r(min.z + size.z / 2) },
    rotation: { x: 0, y: 0, z: 0 },
    material: { ...material },
    visible: true,
    board: shape === 'board' ? defaultBoardOptions() : undefined,
    generator: MEDIA_WALL_TAG,
  };
}

/**
 * Deterministic media wall layout. The wall's front face sits at z = 0,
 * x is centered on 0, floor is y = 0. Everything is axis-aligned boxes.
 */
export function generateMediaWall(raw: MediaWallInput): MediaWallPart[] {
  const input = normalizeMediaWallInput(raw);
  const { wallWidth: W, wallHeight: H, baseDepth: D, baseCount: n } = input;
  const left = -W / 2;
  const wallMat = mat(PRESET_WOOD_MATERIALS.custom_paint, {
    name: 'Wall (reference)',
    baseColor: '#c9ced6',
    secondaryColor: '#b8bec7',
    grainIntensity: 0,
  });
  const carcass = PRESET_WOOD_MATERIALS.birch;
  const accent = PRESET_WOOD_MATERIALS.walnut;
  const parts: MediaWallPart[] = [];

  parts.push(part('Reference wall', 'cube', { x: W, y: H, z: WALL_T }, { x: left, y: 0, z: -WALL_T }, wallMat));

  // Base run
  parts.push(part('Toe kick', 'board', { x: W, y: TOE_H, z: PANEL_T },
    { x: left, y: 0, z: D - TOE_SETBACK - PANEL_T }, carcass));
  // Base height drops so a TV centered at 42" clears the top panel.
  const tv = tvDimensions(input.tvSize);
  const baseTopTarget = TV_CENTER - tv.height / 2 - TV_CLEARANCE;
  const baseSurface = Math.max(MIN_BASE_TOP, Math.min(MAX_BASE_TOP, baseTopTarget));
  const BASE_BOX_H = baseSurface - TOE_H - TOP_T;
  const cabW = W / n;
  for (let i = 0; i < n; i++) {
    parts.push(part(`Base cabinet ${i + 1}`, 'cube', { x: cabW, y: BASE_BOX_H, z: D },
      { x: left + i * cabW, y: TOE_H, z: 0 }, carcass));
  }
  const baseTop = TOE_H + BASE_BOX_H;
  parts.push(part('Top panel', 'board', { x: W, y: TOP_T, z: D }, { x: left, y: baseTop, z: 0 }, accent));
  const upperBottom = baseTop + TOP_T;
  const upperH = H - upperBottom;

  // TV back panel: full upper height, centered, wide enough for the TV + 6" each side.
  const maxBackW = W - 2 * (PANEL_T + MIN_UPPER);
  const backW = Math.max(12, Math.min(maxBackW, tv.width + 12));
  parts.push(part(`TV back panel (TV center ${TV_CENTER}")`, 'board', { x: backW, y: upperH, z: PANEL_T },
    { x: -backW / 2, y: upperBottom, z: 0 }, accent));

  // Side panels at each end of the wall.
  parts.push(part('Side panel L', 'board', { x: PANEL_T, y: upperH, z: UPPER_DEPTH }, { x: left, y: upperBottom, z: 0 }, carcass));
  parts.push(part('Side panel R', 'board', { x: PANEL_T, y: upperH, z: UPPER_DEPTH }, { x: W / 2 - PANEL_T, y: upperBottom, z: 0 }, carcass));

  // Symmetric uppers between side panel and TV back panel.
  const span = W / 2 - PANEL_T - backW / 2;
  const sides: Array<['L' | 'R', number]> = [['L', left + PANEL_T], ['R', backW / 2]];
  if (input.upperStyle === 'shelves') {
    const count = Math.max(1, Math.round(upperH / 14) - 1);
    const pitch = upperH / (count + 1);
    for (const [side, x0] of sides) {
      for (let k = 1; k <= count; k++) {
        parts.push(part(`Shelf ${side}${k}`, 'board', { x: span, y: PANEL_T, z: UPPER_DEPTH - 0 },
          { x: x0, y: upperBottom + k * pitch - PANEL_T / 2, z: 0 }, carcass));
      }
    }
  } else {
    const stack = upperH > 48 ? 2 : 1;
    const boxH = upperH / stack;
    for (const [side, x0] of sides) {
      for (let k = 0; k < stack; k++) {
        parts.push(part(`Upper cabinet ${side}${k + 1}`, 'cube', { x: span, y: boxH, z: UPPER_DEPTH },
          { x: x0, y: upperBottom + k * boxH, z: 0 }, carcass));
      }
    }
  }
  return parts;
}
