import { create } from 'zustand';
import type { BuiltInTemplateId } from '../types/furniture';

export type BuiltInStep = 'wall' | 'template' | 'form';

interface FocusRequest { x: number; y: number; z: number; radius: number; nonce: number }

interface BuiltInFlowState {
  mode: null | 'add' | 'list';
  step: BuiltInStep;
  wallId: string | null;
  template: BuiltInTemplateId | null;
  /** Group id of the built-in being edited. */
  editGroupId: string | null;
  /** Scanned wall tapped in the scene (contextual action bar). */
  focusWallId: string | null;
  /** The add flow started from a tapped wall (Back closes instead of showing the wall list). */
  fromWall: boolean;
  focus: FocusRequest | null;
  startAdd: (hasRoom: boolean) => void;
  startEdit: (groupId: string, template: BuiltInTemplateId, wallId?: string) => void;
  openList: () => void;
  close: () => void;
  chooseWall: (wallId: string | null) => void;
  chooseTemplate: (id: BuiltInTemplateId) => void;
  back: () => void;
  focusWall: (wallId: string | null) => void;
  startAddForWall: (wallId: string) => void;
  requestFocus: (target: { x: number; y: number; z: number }, radius: number) => void;
}

export const useBuiltInFlow = create<BuiltInFlowState>((set, get) => ({
  mode: null,
  step: 'template',
  wallId: null,
  template: null,
  editGroupId: null,
  focusWallId: null,
  fromWall: false,
  focus: null,
  startAdd: (hasRoom) => set({ mode: 'add', step: hasRoom ? 'wall' : 'template', wallId: null, template: null, editGroupId: null, fromWall: false, focusWallId: null }),
  startAddForWall: (wallId) => set({ mode: 'add', step: 'template', wallId, template: null, editGroupId: null, fromWall: true, focusWallId: null }),
  startEdit: (groupId, template, wallId) => set({ mode: 'add', step: 'form', wallId: wallId ?? null, template, editGroupId: groupId, fromWall: false }),
  openList: () => set({ mode: 'list', focusWallId: null }),
  close: () => set({ mode: null, editGroupId: null, fromWall: false }),
  chooseWall: (wallId) => set({ wallId, step: 'template', mode: 'add' }),
  chooseTemplate: (id) => set({ template: id, step: 'form' }),
  back: () => {
    const { step, editGroupId, fromWall } = get();
    if (editGroupId || step === 'wall' || (step === 'template' && fromWall)) return set({ mode: null, editGroupId: null, fromWall: false });
    if (step === 'form') return set({ step: 'template' });
    set({ step: 'wall' });
  },
  focusWall: (wallId) => set({ focusWallId: wallId }),
  requestFocus: (target, radius) => set({ focus: { ...target, radius, nonce: Date.now() } }),
}));
