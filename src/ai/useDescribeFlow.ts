import { create } from 'zustand';

/** Describe it sheet: closed, describing a new piece, or changing an AI-made group. */
interface DescribeFlow {
  open: boolean;
  /** Group being changed ("Change it"); null for a new piece. */
  targetId: string | null;
  openNew: () => void;
  openChange: (groupId: string) => void;
  close: () => void;
}

export const useDescribeFlow = create<DescribeFlow>((set) => ({
  open: false,
  targetId: null,
  openNew: () => set({ open: true, targetId: null }),
  openChange: (groupId) => set({ open: true, targetId: groupId }),
  close: () => set({ open: false, targetId: null }),
}));
