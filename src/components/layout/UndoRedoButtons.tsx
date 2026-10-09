import React, { useEffect } from 'react';
import { Redo2, Undo2 } from 'lucide-react';
import { useProjectStore } from '../../state/useProjectStore';
import { useReliableTap } from '../../utils/reliableTap';

/** Undo / redo pills for the top bar; each shows only when it can act. */
export const UndoRedoButtons: React.FC<{ className: string; size?: number }> = ({ className, size = 18 }) => {
  const canUndo = useProjectStore((s) => s.historyIndex > 0);
  const canRedo = useProjectStore((s) => s.historyIndex < s.historyStack.length - 1);
  const undoTap = useReliableTap(() => useProjectStore.getState().undo());
  const redoTap = useReliableTap(() => useProjectStore.getState().redo());
  return (
    <>
      {canUndo && (
        <button type="button" className={className} onClick={undoTap} onPointerUp={undoTap} title="Undo" aria-label="Undo" data-testid="topbar-undo">
          <Undo2 size={size} />
        </button>
      )}
      {canRedo && (
        <button type="button" className={className} onClick={redoTap} onPointerUp={redoTap} title="Redo" aria-label="Redo" data-testid="topbar-redo">
          <Redo2 size={size} />
        </button>
      )}
    </>
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
