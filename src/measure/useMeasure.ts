import { create } from 'zustand';
import type { MeasurePoint } from '../utils/measure';

interface MeasureState {
  active: boolean;
  a: MeasurePoint | null;
  b: MeasurePoint | null;
  /** Pinned dimension tapped in the scene (shows Delete). */
  selectedId: string | null;
  start: () => void;
  stop: () => void;
  tap: (p: MeasurePoint) => void;
  reset: () => void;
  select: (id: string | null) => void;
}

export const useMeasure = create<MeasureState>((set, get) => ({
  active: false,
  a: null,
  b: null,
  selectedId: null,
  start: () => set({ active: true, a: null, b: null, selectedId: null }),
  stop: () => set({ active: false, a: null, b: null }),
  // First tap = start point, second = end; a third tap starts a new measurement.
  tap: (p) => {
    const { a, b } = get();
    if (!a || b) set({ a: p, b: null });
    else set({ b: p });
  },
  reset: () => set({ a: null, b: null }),
  select: (id) => set({ selectedId: id }),
}));
