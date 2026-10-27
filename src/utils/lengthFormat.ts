import type { LengthUnit } from '../types/furniture';

/**
 * One way to show a length everywhere (fields, readouts, tags, tape measure, cut list).
 * Imperial projects show inches to the nearest 1/16 as a fraction (23 5/8"), feet
 * projects show feet and inches (2' 6 1/2"), metric shows whole mm or cm to 1 mm.
 */

/** 23.625 → '23 5/8', 0.75 → '3/4', 24 → '24', -1.25 → '-1 1/4' (nearest 1/16). */
export function inchFraction(inches: number): string {
  if (!Number.isFinite(inches)) return '0';
  const sixteenths = Math.round(Math.abs(inches) * 16);
  if (sixteenths === 0) return '0';
  const sign = inches < 0 ? '-' : '';
  const whole = Math.floor(sixteenths / 16);
  let num = sixteenths % 16, den = 16;
  while (num && num % 2 === 0) { num /= 2; den /= 2; }
  const frac = num ? `${num}/${den}` : '';
  return `${sign}${whole ? whole : ''}${whole && frac ? ' ' : ''}${frac || (whole ? '' : '0')}`;
}

/** 30.5 → `2' 6 1/2"`, 24 → `2'`, 7.25 → `7 1/4"` (inches to the nearest 1/16). */
export function feetInches(inches: number): string {
  const sixteenths = Math.round(Math.abs(inches) * 16);
  const sign = inches < 0 && sixteenths ? '-' : '';
  const ft = Math.floor(sixteenths / 192);
  const rest = (sixteenths - ft * 192) / 16;
  if (!ft) return `${sign}${inchFraction(rest)}"`;
  return `${sign}${ft}'${rest ? ` ${inchFraction(rest)}"` : ''}`;
}

/** Metric value as a clean number: mm whole, cm to 1 decimal (1 mm). */
export function metricNumber(inches: number, unit: 'cm' | 'mm'): string {
  const mm = Math.round(inches * 25.4);
  const v = unit === 'mm' ? mm : mm / 10;
  return String(Object.is(v, -0) ? 0 : v);
}

/** A length with its unit: 23 5/8" · 2' 6 1/2" · 60.3 cm · 603 mm. */
export function formatLen(inches: number, unit: LengthUnit): string {
  if (unit === 'mm' || unit === 'cm') return `${metricNumber(inches, unit)} ${unit}`;
  if (unit === 'ft') return feetInches(inches);
  return `${inchFraction(inches)}"`;
}

/** Like formatLen, but feet projects show plain inches (for small sizes: joint depths, holes, edges). */
export function formatSmallLen(inches: number, unit: LengthUnit): string {
  return formatLen(inches, unit === 'ft' ? 'in' : unit);
}

/** Several lengths in one unit: 30" × 24" × 3/4" (metric: 762 × 610 × 19 mm). */
export function formatLens(values: number[], unit: LengthUnit, sep = ' × '): string {
  if (unit === 'mm' || unit === 'cm') return `${values.map((v) => metricNumber(v, unit)).join(sep)} ${unit}`;
  return values.map((v) => formatSmallLen(v, unit)).join(sep);
}

/** Editable length fields work in inches (fractions) for in/ft projects, else the metric unit. */
export const fieldUnit = (u: LengthUnit): 'in' | 'cm' | 'mm' => (u === 'ft' || u === 'in' ? 'in' : u);
