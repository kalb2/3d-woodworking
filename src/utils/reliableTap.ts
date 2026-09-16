import { useCallback, useRef, type SyntheticEvent } from 'react';

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
