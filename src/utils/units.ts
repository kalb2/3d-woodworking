import type { LengthUnit } from '../types/furniture';

/**
 * Longest length a size field will store: 30 ft. That covers a media wall and
 * a long room, and rejects a typo like 99999". Callers can pass a tighter max.
 */
export const MAX_PART_INCHES = 360;

/** Multiply stored inches by this to show the project unit. */
export function unitScale(unit: LengthUnit): number {
  if (unit === 'cm') return 2.54;
  if (unit === 'mm') return 25.4;
  if (unit === 'ft') return 1 / 12;
  return 1;
}

export const UNIT_CHOICES: { id: LengthUnit; label: string }[] = [
  { id: 'mm', label: 'mm' },
  { id: 'cm', label: 'cm' },
  { id: 'in', label: 'inch' },
  { id: 'ft', label: 'feet' },
];
