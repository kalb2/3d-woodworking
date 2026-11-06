import type { FurnitureObject, LengthUnit } from '../types/furniture';
import { leavesOf, moveSet, objectBox } from '../state/groupTree';

/** Default drag-resize step (inches). */
export const DEFAULT_RESIZE_STEP = 0.25;
/** Steps offered in Settings. */
export const RESIZE_STEPS = [0.25, 0.5] as const;
/** A part whose bottom is within this of the floor counts as resting on it. */
export const FLOOR_REST_TOL = 0.5;

/**
 * Snap a dragged size. Inch/foot projects use the step (¼" by default);
 * metric projects snap to whole millimetres. Never below `min`.
 */
export function snapSize(inches: number, step: number, unit: LengthUnit = 'in', min = 0.25): number {
  if (!Number.isFinite(inches)) return min;
  const s = unit === 'mm' || unit === 'cm' ? 1 / 25.4 : step > 0 ? step : DEFAULT_RESIZE_STEP;
  const snapped = Math.round(inches / s) * s;
  return Math.max(min, Math.round(snapped * 10000) / 10000);
}

/** Lowest world y of a part (handles rotation). */
export const bottomOf = (o: FurnitureObject) => objectBox(o).min.y;

/**
 * Position for a part whose dimensions change, with the floor on: a part
 * resting on (or near) the floor keeps its bottom and grows upward; any part
 * that would dip below the floor is lifted so its bottom sits at y = 0.
 * Returns the y to use.
 */
export function floorSafeY(before: FurnitureObject, after: FurnitureObject): number {
  const b0 = bottomOf(before);
  let y = after.position.y;
  if (b0 <= FLOOR_REST_TOL) {
    // Keep the bottom where it was (but never below the floor).
    y += Math.max(0, b0) - bottomOf(after);
  }
  const b1 = bottomOf({ ...after, position: { ...after.position, y } });
  if (b1 < 0) y -= b1;
  return Math.round(y * 10000) / 10000;
}

/** The y that keeps a part's real lowest point (rotation included) at or above the floor. */
export function floorClampY(o: FurnitureObject): number {
  const b = bottomOf(o);
  return b < 0 ? Math.round((o.position.y - b) * 1e6) / 1e6 : o.position.y;
}

/** Clamp a vertical move so the lowest of `parts` stays at or above the floor. */
export function floorSafeDy(parts: FurnitureObject[], dy: number): number {
  if (!parts.length) return dy;
  const low = Math.min(...parts.map(bottomOf));
  return low + dy < 0 ? Math.max(dy, -low) : dy;
}

/**
 * Lift each of `ids` (a part or a whole group, moved as one) so its lowest
 * part sits at or above the floor. Used for fresh copies. Pure; returns the
 * same array when nothing moves.
 */
export function liftToFloor(objects: FurnitureObject[], ids: string[]): FurnitureObject[] {
  let out = objects;
  for (const id of ids) {
    const dy = floorSafeDy(leavesOf(out, id).filter((o) => o.generator !== 'room-scan'), 0);
    if (dy <= 1e-9) continue;
    const move = moveSet(out, id);
    out = out.map((o) => (move.has(o.id) ? { ...o, position: { ...o.position, y: Math.round((o.position.y + dy) * 1e6) / 1e6 } } : o));
  }
  return out;
}
