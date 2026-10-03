import type { LengthUnit } from '../types/furniture';

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
