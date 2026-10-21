import { create } from 'zustand';
import type { MeasurePoint } from '../utils/measure';

const TIP_KEY = 'workbench.measureTipSeen';
const tipSeen = () => { try { return localStorage.getItem(TIP_KEY) === '1'; } catch { return false; } };

interface MeasureState {
  active: boolean;
  a: MeasurePoint | null;
  b: MeasurePoint | null;
  /** Snap under the finger while touching (placed on lift). */
  hover: MeasurePoint | null;
  /** Pinned dimension tapped in the scene (shows Delete). */
  selectedId: string | null;
  showTip: boolean;
  /** Touch aiming: the finger and the aim point above it (client px), so the finger doesn't hide the point. */
  aim: { fx: number; fy: number; x: number; y: number } | null;
  setAim: (a: MeasureState['aim']) => void;
  start: () => void;
  stop: () => void;
  setHover: (p: MeasurePoint | null) => void;
  /** Place a point: first = from, second = to; after a result, starts over. */
  place: (p: MeasurePoint) => void;
  reset: () => void;
  select: (id: string | null) => void;
  dismissTip: () => void;
}

export const useMeasure = create<MeasureState>((set, get) => ({
  active: false,
  a: null,
  b: null,
  hover: null,
  selectedId: null,
  showTip: false,
  aim: null,
  setAim: (aim) => set({ aim }),
  start: () => set({ active: true, a: null, b: null, hover: null, aim: null, selectedId: null, showTip: !tipSeen() }),
  stop: () => set({ active: false, a: null, b: null, hover: null, aim: null }),
  setHover: (p) => set({ hover: p }),
  place: (p) => {
    const { a, b } = get();
    if (!a || b) set({ a: p, b: null, hover: null, aim: null });
    else set({ b: p, hover: null, aim: null });
  },
  reset: () => set({ a: null, b: null, hover: null, aim: null }),
  select: (id) => set({ selectedId: id }),
  dismissTip: () => {
    try { localStorage.setItem(TIP_KEY, '1'); } catch { /* private mode */ }
    set({ showTip: false });
  },
}));
