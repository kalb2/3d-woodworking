/** Moblo transform handles — iOS RGB axes, gray hub, no amber. */

export const GIZMO_AXIS = {
  x: '#FF3B30',
  y: '#34C759',
  z: '#007AFF',
} as const;

export const GIZMO_HUB_FILL = '#F3F5F8';
export const GIZMO_HUB_EDGE = '#C5CDD6';
export const GIZMO_HUB_CHEVRON = '#8A96A3';

/**
 * World-unit size of the gizmo at this camera distance.
 * Lower = larger on screen. Sized for finger grabs on iPhone.
 */
export const GIZMO_DISTANCE_REF = 64;
export const GIZMO_SCALE_MIN = 0.72;
export const GIZMO_SCALE_MAX = 6;

export const GIZMO_OUTLINE_WIDTH = 2.25;
