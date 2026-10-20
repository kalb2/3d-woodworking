import { create } from 'zustand';

/** Hold this long (ms) on another part to add it to the selection. */
export const LONG_PRESS_MS = 400;
/** Finger travel (px) that turns a press into an orbit instead. */
export const LONG_PRESS_SLOP = 10;

export interface PressCallbacks { onTap: () => void; onLongPress: () => void; onCancel?: () => void }

/**
 * One press: short lift = tap, hold still = long press, move = cancel (the
 * camera orbits). Timers are injectable for tests.
 */
export function createPress(x: number, y: number, cb: PressCallbacks, timers: { set: typeof setTimeout; clear: typeof clearTimeout } = { set: setTimeout, clear: clearTimeout }) {
  let state: 'down' | 'long' | 'done' = 'down';
  const timer = timers.set(() => {
    if (state !== 'down') return;
    state = 'long';
    cb.onLongPress();
  }, LONG_PRESS_MS);
  return {
    get state() { return state; },
    move(nx: number, ny: number) {
      if (state !== 'down') return;
      if (Math.hypot(nx - x, ny - y) > LONG_PRESS_SLOP) {
        state = 'done';
        timers.clear(timer);
        cb.onCancel?.();
      }
    },
    up() {
      timers.clear(timer);
      if (state === 'down') cb.onTap();
      state = 'done';
    },
    cancel() {
      timers.clear(timer);
      if (state === 'down') cb.onCancel?.();
      state = 'done';
    },
  };
}

const TIP_KEY = 'wb.tip.longPressAdd';
const seen = () => { try { return localStorage.getItem(TIP_KEY) === '1'; } catch { return false; } };

/** One-time 'long-press another part to add it' hint. */
export const useSelectTip = create<{ seen: boolean; dismiss: () => void }>((set) => ({
  seen: seen(),
  dismiss: () => {
    try { localStorage.setItem(TIP_KEY, '1'); } catch { /* private mode */ }
    set({ seen: true });
  },
}));
