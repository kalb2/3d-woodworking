/** Moblo transform handles — iOS RGB axes, gray hub, no amber. */

export const GIZMO_AXIS = {
  x: '#FF3B30',
  y: '#34C759',
  z: '#007AFF',
} as const;

export const GIZMO_HUB_FILL = '#D8DEE6';
export const GIZMO_HUB_EDGE = '#8E99A6';
export const GIZMO_HUB_CHEVRON = '#6E7B8A';

/**
 * World-unit size of the gizmo at this camera distance.
 * Lower = larger on screen. Sized for finger grabs on iPhone.
 */
export const GIZMO_DISTANCE_REF = 56;
export const GIZMO_SCALE_MIN = 0.75;
export const GIZMO_SCALE_MAX = 6;

export const GIZMO_OUTLINE_WIDTH = 2.25;
