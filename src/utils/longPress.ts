import { create } from 'zustand';

/** Hold this long (ms) on another part to add it to the selection. */
export const LONG_PRESS_MS = 400;
/** Finger travel (px) that turns a press into an orbit instead. */
export const LONG_PRESS_SLOP = 14;

export interface PressCallbacks { onTap: () => void; onLongPress: () => void; onCancel?: () => void }

/**
 * One press: short lift = tap, hold still = long press, move = cancel (the
 * camera orbits). Timers are injectable for tests.
 */
export function createPress(x: number, y: number, cb: PressCallbacks, timers: { set: typeof setTimeout; clear: typeof clearTimeout } = { set: setTimeout, clear: clearTimeout }, slop = LONG_PRESS_SLOP) {
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
      if (Math.hypot(nx - x, ny - y) > slop) {
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

export type PressRing = { x: number; y: number; done: boolean } | null;

export interface PartPressOptions {
  x: number;
  y: number;
  pointerId: number;
  pointerType: string;
  /** OrbitControls (needs `enabled`; `domElement` for the hand-off). */
  controls: { enabled: boolean; domElement?: HTMLElement } | null;
  orbitAllowed: () => boolean;
  /** Set while we replay the touch for the camera, so the canvas ignores it. */
  handOff: { current: boolean };
  setRing: (r: PressRing | ((prev: PressRing) => PressRing)) => void;
  onTap: () => void;
  onHold: () => void;
  timers?: { set: typeof setTimeout; clear: typeof clearTimeout };
}

/**
 * A touch on another part while something is selected. The camera is held
 * still at once (finger jitter must not orbit). Lift quickly = tap. Hold
 * ~400 ms = add/remove (camera stays still until lift). Move past the slop =
 * hand the touch to the camera from where the finger is now (no jump).
 */
export function startPartPress(o: PartPressOptions) {
  const { controls } = o;
  if (controls) controls.enabled = false;
  o.setRing({ x: o.x, y: o.y, done: false });
  let last = { x: o.x, y: o.y };
  const finish = () => {
    window.removeEventListener('pointermove', onMove, true);
    window.removeEventListener('pointerup', onUp, true);
    window.removeEventListener('pointercancel', onCancel, true);
    if (controls) controls.enabled = o.orbitAllowed();
  };
  const press = createPress(o.x, o.y, {
    onTap: () => { o.setRing(null); o.onTap(); },
    onLongPress: () => {
      o.onHold();
      o.setRing({ x: o.x, y: o.y, done: true });
      (o.timers?.set ?? setTimeout)(() => o.setRing((r) => (r?.done ? null : r)), 260);
    },
    onCancel: () => {
      o.setRing(null);
      finish();
      if (!controls?.domElement || !o.orbitAllowed()) return;
      controls.enabled = true;
      o.handOff.current = true;
      try {
        const init = { pointerId: o.pointerId, pointerType: o.pointerType, isPrimary: true, bubbles: true, cancelable: true, clientX: last.x, clientY: last.y, button: 0, buttons: 1 };
        // Drop whatever the camera may have seen at the first touch, then start it fresh here.
        controls.domElement.ownerDocument.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
        controls.domElement.dispatchEvent(new PointerEvent('pointerdown', init));
      } catch {
        /* no PointerEvent constructor: this gesture just doesn't orbit */
      } finally {
        o.handOff.current = false;
      }
    },
  }, o.timers);
  // Capture phase on window: we see moves and the lift before the camera does.
  const onMove = (e: PointerEvent) => {
    if (e.pointerId !== o.pointerId) return;
    last = { x: e.clientX, y: e.clientY };
    press.move(e.clientX, e.clientY);
  };
  const onUp = (e: PointerEvent) => {
    if (o.handOff.current || e.pointerId !== o.pointerId) return;
    press.up();
    o.setRing((r) => (r?.done ? r : null));
    finish();
  };
  const onCancel = (e: PointerEvent) => {
    if (e.pointerId !== o.pointerId) return;
    press.cancel();
    o.setRing(null);
    finish();
  };
  window.addEventListener('pointermove', onMove, true);
  window.addEventListener('pointerup', onUp, true);
  window.addEventListener('pointercancel', onCancel, true);
  return press;
}
