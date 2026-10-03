/**
 * Moblo axis paint — sampled from the Move / Rotate / Resize reference shots.
 * Light-mode iOS system RGB (handles render unlit so these hexes hit the screen).
 */
export const GIZMO_AXIS = {
  x: '#FF3B30',
  y: '#34C759',
  z: '#007AFF',
} as const;

export const GIZMO_HUB_FILL = '#F3F5F8';
export const GIZMO_HUB_EDGE = '#C5CDD6';
export const GIZMO_HUB_CHEVRON = '#8A96A3';

/**
 * Screen-size compensation for grip *meshes only*.
 * Positions stay on the part bounds — never scale the whole gizmo from the origin.
 * Cap is tight so handles stay tappable without swallowing the wood.
 */
export const GIZMO_DISTANCE_REF = 70;
export const GIZMO_SCALE_MIN = 0.85;
export const GIZMO_SCALE_MAX = 1.35;

export const GIZMO_OUTLINE_WIDTH = 2.25;

export function boundRingTube(radius: number) {
  return THREE_CLAMP(radius * 0.012, 0.08, 0.2);
}

function THREE_CLAMP(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
