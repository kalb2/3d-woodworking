import type { SyntheticEvent } from 'react';

/** pointerup + click so Capacitor WKWebView does not drop a synthesized click. */
export function fireReliableTap(event: SyntheticEvent, action: () => void) {
  event.preventDefault();
  event.stopPropagation();
  action();
}
