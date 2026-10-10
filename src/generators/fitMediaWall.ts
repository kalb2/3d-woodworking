import type { ScannedOpening } from '../types/furniture';
import { baseSurfaceHeight, generateMediaWall, normalizeMediaWallInput, type MediaWallInput, type MediaWallPart } from './mediaWall';

/** An opening as an axis-aligned rectangle in wall-local coords (x from wall center, y from floor). */
export interface Obstacle { x0: number; x1: number; y0: number; y1: number; kind: ScannedOpening['kind'] }
export interface Span { x0: number; x1: number }

const MIN_PIECE = 3;
const r = (n: number) => Math.round(n * 1000) / 1000;

export function obstaclesFor(wallWidth: number, openings: ScannedOpening[]): Obstacle[] {
  return openings.map((o) => {
    const x0 = -wallWidth / 2 + o.offsetX;
    // Openings near the floor block everything below them too (door-like).
    const y0 = o.kind === 'door' || o.bottom < 6 ? 0 : o.bottom;
    return { x0, x1: x0 + o.width, y0, y1: o.bottom + o.height, kind: o.kind };
  });
}

/**
 * Horizontal spans of the wall where a base run fits: doors block their width,
 * windows block only when their sill is lower than the base run top.
 */
export function freeSpans(wallWidth: number, openings: ScannedOpening[], baseTop: number): Span[] {
  const blocks = obstaclesFor(wallWidth, openings)
    .filter((o) => o.y0 < baseTop)
    .map((o) => ({ x0: Math.max(-wallWidth / 2, o.x0), x1: Math.min(wallWidth / 2, o.x1) }))
    .filter((b) => b.x1 > b.x0)
    .sort((a, b) => a.x0 - b.x0);
  const spans: Span[] = [];
  let cursor = -wallWidth / 2;
  for (const b of blocks) {
    if (b.x0 > cursor) spans.push({ x0: r(cursor), x1: r(b.x0) });
    cursor = Math.max(cursor, b.x1);
  }
  if (cursor < wallWidth / 2) spans.push({ x0: r(cursor), x1: r(wallWidth / 2) });
  return spans.filter((s) => s.x1 - s.x0 >= 1);
}

export function largestSpan(spans: Span[]): Span | null {
  return spans.reduce<Span | null>((best, s) => (!best || s.x1 - s.x0 > best.x1 - best.x0 ? s : best), null);
}

function overlaps(p: MediaWallPart, o: Obstacle): boolean {
  const hx = p.dimensions.length / 2, hy = p.dimensions.height / 2;
  const eps = 0.01;
  return p.position.x - hx < o.x1 - eps && p.position.x + hx > o.x0 + eps
    && p.position.y - hy < o.y1 - eps && p.position.y + hy > o.y0 + eps;
}

/** Split a part horizontally around an obstacle; drop slivers. */
function clip(p: MediaWallPart, o: Obstacle): MediaWallPart[] {
  const hx = p.dimensions.length / 2;
  const left = p.position.x - hx, right = p.position.x + hx;
  const out: MediaWallPart[] = [];
  const piece = (a: number, b: number, suffix: string) => {
    if (b - a < MIN_PIECE) return;
    out.push({ ...p, name: `${p.name}${suffix}`, dimensions: { ...p.dimensions, length: r(b - a) }, position: { ...p.position, x: r((a + b) / 2) } });
  };
  piece(left, Math.min(right, o.x0), '');
  piece(Math.max(left, o.x1), right, left < o.x0 ? ' (b)' : '');
  return out;
}

export interface FitResult {
  /** Parts in wall-local coords (x from wall center, y from floor, z from the wall face into the room). */
  parts: MediaWallPart[];
  span: Span | null;
  center: number;
  width: number;
}

export interface FitOptions {
  /** Desired width; clamped to the span. Defaults to the full span. */
  width?: number;
  /** Desired wall-local center; defaults to the span center. */
  center?: number;
}

/**
 * Fit a media wall to a scanned wall: largest free span by default, no part
 * overlapping any opening (pieces are split around windows/doors). Pure.
 */
export function fitMediaWall(input: MediaWallInput, wall: { width: number; height: number; openings: ScannedOpening[] }, opts: FitOptions = {}): FitResult {
  const baseTop = baseSurfaceHeight(normalizeMediaWallInput(input).tvSize);
  const spans = freeSpans(wall.width, wall.openings, baseTop);
  const span = opts.center !== undefined
    ? spans.find((s) => opts.center! >= s.x0 && opts.center! <= s.x1) ?? largestSpan(spans)
    : largestSpan(spans);
  const spanW = span ? span.x1 - span.x0 : wall.width;
  const width = Math.max(1, Math.min(spanW, opts.width ?? spanW));
  let center = opts.center ?? (span ? (span.x0 + span.x1) / 2 : 0);
  if (span) center = Math.max(span.x0 + width / 2, Math.min(span.x1 - width / 2, center));
  const norm = normalizeMediaWallInput({ ...input, wallWidth: width, wallHeight: Math.min(input.wallHeight, wall.height) });
  let parts = generateMediaWall({ ...input, wallWidth: norm.wallWidth, wallHeight: norm.wallHeight })
    .filter((p) => !p.reference)
    .map((p) => ({ ...p, position: { ...p.position, x: r(p.position.x + center) } }));
  for (const o of obstaclesFor(wall.width, wall.openings)) {
    parts = parts.flatMap((p) => (overlaps(p, o) ? clip(p, o) : [p]));
  }
  return { parts, span, center: r(center), width: r(norm.wallWidth) };
}

export { overlaps as partOverlapsObstacle };
