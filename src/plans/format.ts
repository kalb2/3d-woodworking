import type { LengthUnit } from '../types/furniture';
import { formatSmallLen, inchFraction } from '../utils/lengthFormat';

/**
 * Lengths on the plans. Imperial projects read in inches and fractions to the
 * nearest 1/16 (shop drawings stay in inches, also for feet projects); metric
 * projects in mm or cm.
 */
export function dim(inches: number, unit: LengthUnit): string {
  return formatSmallLen(inches, unit);
}

/** A bare number for dimension lines (no inch mark on imperial: 23 5/8). */
export function dimBare(inches: number, unit: LengthUnit): string {
  if (unit === 'in' || unit === 'ft') return inchFraction(inches);
  return formatSmallLen(inches, unit);
}

/** 'W 36" × H 72" × D 12"' (overall width, height, depth). */
export function overallSize(size: { w: number; h: number; d: number }, unit: LengthUnit): string {
  return `W ${dim(size.w, unit)} × H ${dim(size.h, unit)} × D ${dim(size.d, unit)}`;
}

/** Finished part size, length (grain) first: 70 1/2" × 11 1/4" × 3/4". */
export function partSize(l: number, w: number, t: number, unit: LengthUnit): string {
  if (unit === 'mm' || unit === 'cm') return `${[l, w, t].map((v) => dimBare(v, unit).replace(` ${unit}`, '')).join(' × ')} ${unit}`;
  return [l, w, t].map((v) => dim(v, unit)).join(' × ');
}

/** 'October 27, 2026' */
export function planDate(at: Date): string {
  return at.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

/** Drawing scales a shop reads easily (paper : real). */
const SCALES = [1, 2, 3, 4, 6, 8, 10, 12, 16, 20, 24, 32, 48, 64, 96];

/**
 * Pick the largest standard scale (1:n) at which a drawing of `size` inches
 * fits in `box` points (72 pt per inch on paper). Returns points per real inch.
 */
export function niceScale(size: { w: number; h: number }, box: { w: number; h: number }): { ptPerIn: number; label: string } {
  const exact = Math.min(box.w / Math.max(size.w, 1e-6), box.h / Math.max(size.h, 1e-6));
  const n = SCALES.find((s) => 72 / s <= exact + 1e-9);
  if (!n) return { ptPerIn: exact, label: 'Not to scale' };
  return { ptPerIn: 72 / n, label: `Scale 1:${n}` };
}

/** Fit `size` inside `box` keeping aspect: the scale and the centered offset. */
export function fitRect(size: { w: number; h: number }, box: { x: number; y: number; w: number; h: number }) {
  const s = Math.min(box.w / Math.max(size.w, 1e-6), box.h / Math.max(size.h, 1e-6));
  return { scale: s, x: box.x + (box.w - size.w * s) / 2, y: box.y + (box.h - size.h * s) / 2 };
}
