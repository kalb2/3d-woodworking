import { create } from 'zustand';

export type JoinView =
  | { kind: 'new'; a: string; b: string }
  | { kind: 'edit'; jointId: string; back?: JoinView }
  /** A part's joints, or every joint in the project when partId is missing. */
  | { kind: 'list'; partId?: string };

/** Which joinery sheet is open (none = null). */
export const useJoinFlow = create<{
  view: JoinView | null;
  start: (a: string, b: string) => void;
  edit: (jointId: string, back?: JoinView) => void;
  list: (partId?: string) => void;
  close: () => void;
}>((set) => ({
  view: null,
  start: (a, b) => set({ view: { kind: 'new', a, b } }),
  edit: (jointId, back) => set({ view: { kind: 'edit', jointId, back } }),
  list: (partId) => set({ view: { kind: 'list', partId } }),
  close: () => set({ view: null }),
}));
