import { useCallback, useRef, type SyntheticEvent } from 'react';

/** A click this soon after its pointerdown may be that touch's follow-up click. */
export const GHOST_MS = 800;
let lastDown: { target: Node; at: number } | null = null;

/**
 * Taps act on pointerup, and that often closes a sheet or swaps the UI. The
 * browser still sends the same touch's click a moment later, at the same spot,
 * to whatever is underneath now (e.g. the bottom bar's Duplicate under a
 * sheet's "Add joint"). A real click lands on (or around) the element the
 * finger went down on; a click whose pointerdown started on another element,
 * or one that is gone, is that ghost: swallow it.
 */
export function isGhostClick(down: { target: Node; at: number } | null, clickTarget: Node | null, now: number): boolean {
  if (!down || !clickTarget || now - down.at > GHOST_MS) return false;
  if (!down.target.isConnected) return true;
  return !(clickTarget.contains(down.target) || down.target.contains(clickTarget));
}

export function installGhostClickGuard(win: Window = window) {
  const w = win as Window & { __wbGhostGuard?: boolean };
  if (w.__wbGhostGuard) return;
  w.__wbGhostGuard = true;
  win.addEventListener('pointerdown', (e) => {
    lastDown = e.target instanceof Node ? { target: e.target, at: performance.now() } : null;
  }, true);
  win.addEventListener('click', (e) => {
    // Only real pointer clicks (keyboard clicks have detail 0; scripted ones are untrusted).
    if (!e.isTrusted || e.detail === 0) return;
    const down = lastDown;
    lastDown = null;
    if (isGhostClick(down, e.target instanceof Node ? e.target : null, performance.now())) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    }
  }, true);
}
if (typeof window !== 'undefined') installGhostClickGuard();

/** pointerup + click so Capacitor WKWebView does not drop a synthesized click. */
export function fireReliableTap(event: SyntheticEvent, action: () => void) {
  event.preventDefault();
  event.stopPropagation();
  action();
}

/**
 * Capacitor-safe tap that runs the action once per gesture.
 * pointerup + click both attach; the second event in the pair is ignored.
 */
export function useReliableTap(action: () => void) {
  const actionRef = useRef(action);
  actionRef.current = action;
  const lastFiredAt = useRef(0);

  return useCallback((event: SyntheticEvent) => {
    fireReliableTap(event, () => {
      const now = performance.now();
      if (now - lastFiredAt.current < 400) return;
      lastFiredAt.current = now;
      actionRef.current();
    });
  }, []);
}
