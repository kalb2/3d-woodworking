import React, { useState } from 'react';
import {
  Camera,
  FileCode,
  FileSpreadsheet,
  Layers,
  List,
  Pencil,
  Redo,
  Settings,
  Share2,
  SlidersHorizontal,
  Undo,
} from 'lucide-react';
import { useAppStore } from '../../state/useAppStore';
import { useProjectStore } from '../../state/useProjectStore';
import { copyProjectToClipboard, exportCutListCSV, exportProjectJSON } from '../../utils/exportUtils';
import { useReliableTap } from '../../utils/reliableTap';

interface EditorOverflowListProps {
  onOpenCutList: () => void;
  onShareProject: () => void;
  onClose: () => void;
}

export const EditorOverflowList: React.FC<EditorOverflowListProps> = ({
  onOpenCutList,
  onShareProject,
  onClose,
}) => {
  const { openOverlay, setSidebarPanel } = useAppStore();
  const selectedObjectId = useProjectStore((state) => state.selectedObjectId);
  const {
    activeProjectId,
    projects,
    historyIndex,
    historyStack,
    undo,
    redo,
    renameProject,
  } = useProjectStore();
  const currentProject = projects.find((project) => project.id === activeProjectId);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(currentProject?.name ?? '');
  const [copied, setCopied] = useState(false);
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < historyStack.length - 1;

  const parts = useReliableTap(() => {
    setSidebarPanel('scene');
    openOverlay('sidebar');
  });
  const cutList = useReliableTap(() => {
    onClose();
    onOpenCutList();
  });
  const settings = useReliableTap(() => openOverlay('settings', true));
  const properties = useReliableTap(() => {
    if (!useProjectStore.getState().selectedObjectId) return;
    openOverlay('inspector', true);
  });
  const share = useReliableTap(() => {
    onClose();
    onShareProject();
  });
  const csv = useReliableTap(() => {
    if (currentProject) exportCutListCSV(currentProject);
    onClose();
  });
  const snapshot = useReliableTap(() => {
    const canvas = document.querySelector('canvas');
    if (canvas) {
      const url = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = url;
      link.download = `${currentProject?.name.toLowerCase().replace(/\s+/g, '_') || 'workbench'}_render.png`;
      link.click();
    }
    onClose();
  });
  const json = useReliableTap(() => {
    if (currentProject) exportProjectJSON(currentProject);
    onClose();
  });
  const copyJson = useReliableTap(() => {
    if (!currentProject) return;
    void copyProjectToClipboard(currentProject).then((ok) => {
      if (!ok) return;
      setCopied(true);
      window.setTimeout(onClose, 700);
    });
  });
  const undoTap = useReliableTap(() => {
    if (!canUndo) return;
    undo();
    onClose();
  });
  const redoTap = useReliableTap(() => {
    if (!canRedo) return;
    redo();
    onClose();
  });

  const saveRename = () => {
    const name = draft.trim();
    if (currentProject && name) renameProject(currentProject.id, name);
    setRenaming(false);
    onClose();
  };

  return (
    <div className="editor-overflow-list">
      <button type="button" className="phone-sheet-row" data-testid="menu-parts" onClick={parts} onPointerUp={parts}>
        <List size={18} />
        <span>Parts list</span>
      </button>
      <button type="button" className="phone-sheet-row" data-testid="menu-cut-list" onClick={cutList} onPointerUp={cutList}>
        <Layers size={18} />
        <span>Cut list</span>
      </button>
      <button type="button" className="phone-sheet-row" data-testid="tool-settings" onClick={settings} onPointerUp={settings}>
        <Settings size={18} />
        <span>Settings</span>
      </button>
      <button type="button" className="phone-sheet-row" data-testid="overlay-launch-properties" disabled={!selectedObjectId} onClick={properties} onPointerUp={properties}>
        <SlidersHorizontal size={18} />
        <span>Properties</span>
      </button>
      {renaming ? (
        <form
          className="editor-overflow-rename"
          onSubmit={(event) => {
            event.preventDefault();
            saveRename();
          }}
        >
          <input
            data-testid="menu-rename-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            aria-label="Project name"
            autoFocus
          />
          <button type="submit" className="glass-button active" data-testid="menu-rename-save">
            Save
          </button>
        </form>
      ) : (
        <button
          type="button"
          className="phone-sheet-row"
          data-testid="menu-rename"
          onClick={() => {
            setDraft(currentProject?.name ?? '');
            setRenaming(true);
          }}
        >
          <Pencil size={18} />
          <span>Rename project</span>
        </button>
      )}
      <button type="button" className="phone-sheet-row" data-testid="menu-share" onClick={share} onPointerUp={share}>
        <Share2 size={18} />
        <span>Share project</span>
      </button>
      <button type="button" className="phone-sheet-row" data-testid="menu-export-csv" onClick={csv} onPointerUp={csv}>
        <FileSpreadsheet size={18} />
        <span>Export CSV cut list</span>
      </button>
      <button type="button" className="phone-sheet-row" data-testid="menu-export-png" onClick={snapshot} onPointerUp={snapshot}>
        <Camera size={18} />
        <span>Snapshot image</span>
      </button>
      <button type="button" className="phone-sheet-row" data-testid="menu-export-json" onClick={json} onPointerUp={json}>
        <FileCode size={18} />
        <span>Export project</span>
      </button>
      <button type="button" className="phone-sheet-row" data-testid="menu-copy-json" onClick={copyJson} onPointerUp={copyJson}>
        <Share2 size={18} />
        <span>{copied ? 'Copied' : 'Copy JSON'}</span>
      </button>
      <button type="button" className="phone-sheet-row" data-testid="menu-undo" disabled={!canUndo} onClick={undoTap} onPointerUp={undoTap}>
        <Undo size={18} />
        <span>Undo</span>
      </button>
      <button type="button" className="phone-sheet-row" data-testid="menu-redo" disabled={!canRedo} onClick={redoTap} onPointerUp={redoTap}>
        <Redo size={18} />
        <span>Redo</span>
      </button>
    </div>
  );
};
