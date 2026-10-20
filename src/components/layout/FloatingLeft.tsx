import React from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { useAppStore } from '../../state/useAppStore';
import { useReliableTap } from '../../utils/reliableTap';
import { UndoRedoButtons } from './UndoRedoButtons';

/**
 * Bottom-left floating cluster, mirroring the Add button at bottom-right:
 * a labeled Properties button (the selection's properties plus this project's
 * settings; tap again to close) and then Undo / Redo.
 */
export const FloatingLeft: React.FC<{ placement: 'phone' | 'ipad'; showUndo?: boolean }> = ({ placement, showUndo = true }) => {
  const open = useAppStore((s) => s.overlays.inspector);
  const toggle = useReliableTap(() => {
    const app = useAppStore.getState();
    if (app.overlays.inspector) app.setOverlayOpen('inspector', false);
    else app.openOverlay('inspector', placement === 'phone');
  });
  return (
    <div className={`fab-left is-${placement}`} data-testid="fab-left">
      <button type="button" className={`properties-fab${open ? ' is-open' : ''}`} data-testid="properties-fab"
          aria-pressed={open} aria-expanded={open} onClick={toggle} onPointerUp={toggle}>
          <SlidersHorizontal size={18} strokeWidth={2} />
          <span>Properties</span>
        </button>
      {showUndo && <UndoRedoButtons placement="inline" />}
    </div>
  );
};
