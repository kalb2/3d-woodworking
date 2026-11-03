import React, { useEffect } from 'react';
import { Redo2, Undo2 } from 'lucide-react';
import { useProjectStore } from '../../state/useProjectStore';
import { useReliableTap } from '../../utils/reliableTap';

/**
 * Undo / redo pair in a fixed bottom-left spot. Only the available buttons
 * show (no dimmed ghost buttons). When only Redo is available an empty,
 * invisible slot holds Undo's place so Redo never slides under a finger that
 * was tapping Undo; the whole pair is hidden when there is nothing to undo or redo.
 */
export const UndoRedoButtons: React.FC<{ placement: 'phone' | 'ipad' | 'inline' }> = ({ placement }) => {
  const canUndo = useProjectStore((s) => s.historyIndex > 0);
  const canRedo = useProjectStore((s) => s.historyIndex < s.historyStack.length - 1);
  const undoTap = useReliableTap(() => useProjectStore.getState().undo());
  const redoTap = useReliableTap(() => useProjectStore.getState().redo());
  if (!canUndo && !canRedo) return null;
  return (
    <div className={`undo-redo-pair is-${placement}`} data-testid="undo-redo">
      {canUndo ? (
        <button type="button" className="undo-redo-btn"
          onClick={undoTap} onPointerUp={undoTap} title="Undo" aria-label="Undo" data-testid="undo-btn">
          <Undo2 size={18} />
        </button>
      ) : (
        <span className="undo-redo-slot" aria-hidden="true" data-testid="undo-slot" />
      )}
      {canRedo && (
        <button type="button" className="undo-redo-btn"
          onClick={redoTap} onPointerUp={redoTap} title="Redo" aria-label="Redo" data-testid="redo-btn">
          <Redo2 size={18} />
        </button>
      )}
    </div>
  );
};

/** Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z (hardware keyboard), ignored while typing in a field. */
export function useUndoShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      e.preventDefault();
      const store = useProjectStore.getState();
      if (e.shiftKey) store.redo();
      else store.undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
