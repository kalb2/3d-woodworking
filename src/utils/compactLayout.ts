import { Capacitor } from '@capacitor/core';

/** Shortest side below this is treated as iPhone-class chrome. */
export const COMPACT_BREAKPOINT_PX = 768;

function shortestSide(width: number, height: number): number {
  if (!width && !height) return 0;
  if (!width) return height;
  if (!height) return width;
  return Math.min(width, height);
}

/** True on iPhone / compact native shells where stacked iPad overlays bury the canvas. */
export function isCompactChrome(): boolean {
  if (typeof window === 'undefined') return false;

  const ua = navigator.userAgent || '';
  if (/iPhone|iPod/i.test(ua)) return true;

  const viewportShort = shortestSide(window.innerWidth, window.innerHeight);
  if (viewportShort > 0 && viewportShort < COMPACT_BREAKPOINT_PX) return true;

  // WKWebView can report a desktop-sized innerWidth before / without layout.
  // screen.* stays at the device size, so native iPhone still counts as compact.
  const screenShort = shortestSide(window.screen?.width ?? 0, window.screen?.height ?? 0);
  if (isNativeShell() && screenShort > 0 && screenShort < COMPACT_BREAKPOINT_PX) {
    return true;
  }

  return false;
}

function isNativeShell(): boolean {
  try {
    if (Capacitor.isNativePlatform()) return true;
  } catch {
    // Capacitor may be unavailable during early evaluate
  }
  const injected = (window as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean };
  }).Capacitor;
  return typeof injected?.isNativePlatform === 'function' && injected.isNativePlatform();
}

export function isNativeIosShell(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios') return true;
  } catch {
    // fall through
  }
  const injected = (window as unknown as {
    Capacitor?: { getPlatform?: () => string };
  }).Capacitor;
  return injected?.getPlatform?.() === 'ios';
}
