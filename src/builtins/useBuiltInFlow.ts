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
  /** Waiting for a tap on a scanned wall in the scene. */
  picking: boolean;
  focus: FocusRequest | null;
  startAdd: (hasRoom: boolean) => void;
  startEdit: (groupId: string, template: BuiltInTemplateId, wallId?: string) => void;
  openList: () => void;
  close: () => void;
  chooseWall: (wallId: string | null) => void;
  chooseTemplate: (id: BuiltInTemplateId) => void;
  back: () => void;
  setPicking: (picking: boolean) => void;
  requestFocus: (target: { x: number; y: number; z: number }, radius: number) => void;
}

export const useBuiltInFlow = create<BuiltInFlowState>((set, get) => ({
  mode: null,
  step: 'template',
  wallId: null,
  template: null,
  editGroupId: null,
  picking: false,
  focus: null,
  startAdd: (hasRoom) => set({ mode: 'add', step: hasRoom ? 'wall' : 'template', wallId: null, template: null, editGroupId: null, picking: false }),
  startEdit: (groupId, template, wallId) => set({ mode: 'add', step: 'form', wallId: wallId ?? null, template, editGroupId: groupId, picking: false }),
  openList: () => set({ mode: 'list', picking: false }),
  close: () => set({ mode: null, picking: false, editGroupId: null }),
  chooseWall: (wallId) => set({ wallId, step: 'template', picking: false, mode: 'add' }),
  chooseTemplate: (id) => set({ template: id, step: 'form' }),
  back: () => {
    const { step, editGroupId } = get();
    if (editGroupId || step === 'wall') return set({ mode: null, editGroupId: null });
    if (step === 'form') return set({ step: 'template' });
    set({ step: 'wall' });
  },
  setPicking: (picking) => set({ picking }),
  requestFocus: (target, radius) => set({ focus: { ...target, radius, nonce: Date.now() } }),
}));
