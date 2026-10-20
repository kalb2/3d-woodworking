import React, { useEffect, useState } from 'react';
import {
  Camera,
  FileCode,
  FileSpreadsheet,
  Layers,
  Lock,
  LockOpen,
  BookmarkPlus,
  ScanLine,
  Tv,
  List,
  Pencil,
  Settings,
  Share2,
  SlidersHorizontal,
  BoxSelect,
  SquareDashed,
  Ruler,
  TextCursorInput,
  Link2,
} from 'lucide-react';
import { jointsOf } from '../../joinery/joints';
import { useJoinFlow } from '../../joinery/useJoinFlow';
import { useAppStore } from '../../state/useAppStore';
import { useProjectStore } from '../../state/useProjectStore';
import { copyProjectToClipboard, exportCutListCSV, exportProjectJSON } from '../../utils/exportUtils';
import { useReliableTap } from '../../utils/reliableTap';
import { useBuiltInFlow } from '../../builtins/useBuiltInFlow';
import { useMeasure } from '../../measure/useMeasure';
import { isWallScanSupported, scanWalls } from '../../native/wallScan';
import { roomFromScan } from '../../generators/roomScan';
import { partsFromSelection, useUserTemplates } from '../../templates/userTemplates';

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
    renameProject,
  } = useProjectStore();
  const currentProject = projects.find((project) => project.id === activeProjectId);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(currentProject?.name ?? '');
  const [copied, setCopied] = useState(false);

  const parts = useReliableTap(() => {
    setSidebarPanel('scene');
    openOverlay('sidebar');
  });
  const cutList = useReliableTap(() => {
    onClose();
    onOpenCutList();
  });
  const settings = useReliableTap(() => openOverlay('settings', true));
  const [canScan, setCanScan] = useState(false);
  const [scanning, setScanning] = useState(false);
  useEffect(() => {
    let alive = true;
    void isWallScanSupported().then((ok) => { if (alive) setCanScan(ok); });
    return () => { alive = false; };
  }, []);
  const scanRoom = useReliableTap(() => {
    if (scanning) return;
    const proj = useProjectStore.getState().projects.find((p) => p.id === useProjectStore.getState().activeProjectId);
    if (proj?.scannedRoom?.walls.length && !window.confirm('Replace scanned room? Your parts and built-ins stay.')) return;
    setScanning(true);
    onClose();
    void scanWalls()
      .then((result) => {
        const room = roomFromScan(result);
        if (!useProjectStore.getState().addScannedRoom(room)) {
          window.alert('No walls found. Try scanning again.');
          return;
        }
        useBuiltInFlow.getState().requestFrame();
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        if (!/cancel/i.test(msg)) window.alert(`Scan failed: ${msg}`);
      })
      .finally(() => setScanning(false));
  });
  const selectedObj = currentProject?.objects.find((o) => o.id === selectedObjectId);
  const canSaveTemplate = Boolean(selectedObj && selectedObj.generator !== 'room-scan' && !selectedObj.reference);
  const saveTemplate = useReliableTap(() => {
    const state = useProjectStore.getState();
    const proj = state.projects.find((p) => p.id === state.activeProjectId);
    if (!proj || !state.selectedObjectId) return;
    const sel = proj.objects.find((o) => o.id === state.selectedObjectId);
    const parts = partsFromSelection(proj.objects, state.selectedObjectId);
    if (parts.length === 0) { window.alert('Nothing to save in this selection.'); return; }
    const name = window.prompt('Save as template', sel?.name ?? 'Template');
    if (name === null) return;
    useUserTemplates.getState().save(name, parts);
    onClose();
  });
  const measure = useReliableTap(() => {
    onClose();
    useProjectStore.getState().selectObject(null);
    useMeasure.getState().start();
  });
  const selectArea = useReliableTap(() => {
    const st = useProjectStore.getState();
    if (!st.multiSelect) st.toggleMultiSelect();
    onClose();
  });
  const renameSelection = useReliableTap(() => {
    const st = useProjectStore.getState();
    const proj = st.projects.find((p) => p.id === st.activeProjectId);
    const sel = proj?.objects.find((o) => o.id === st.selectedObjectId);
    if (!sel) return;
    const name = window.prompt('Rename', sel.name)?.trim();
    if (name && name !== sel.name) st.updateObject(sel.id, { name });
    onClose();
  });
  const canRename = Boolean(selectedObj && !(selectedObj.generator === 'room-scan'));
  const squareUp = useReliableTap(() => {
    if (!window.confirm('Square up walls? Lines the room up with the grid and squares near-right corners. Built-ins on walls follow; other parts stay put.')) return;
    if (useProjectStore.getState().squareUpWalls()) useBuiltInFlow.getState().requestFrame();
    onClose();
  });
  const hasRoom = Boolean(currentProject?.scannedRoom?.walls.length);
  const roomLocked = currentProject?.roomLocked !== false;
  const toggleRoomLock = useReliableTap(() => {
    const flow = useBuiltInFlow.getState();
    useProjectStore.getState().setRoomLocked(!roomLocked, roomLocked ? flow.focusWallId : null);
    if (roomLocked && flow.focusWallId) { flow.focusWall(null); onClose(); }
  });
  // The selected built-in (or the built-in the selected part belongs to): reopen its sizes.
  const editTarget = (() => {
    let o = selectedObj;
    while (o && !o.builtIn) o = o.parentId ? currentProject?.objects.find((x) => x.id === o!.parentId) : undefined;
    return o?.builtIn ? o : undefined;
  })();
  const editTemplate = useReliableTap(() => {
    if (!editTarget?.builtIn) return;
    onClose();
    useBuiltInFlow.getState().startEdit(editTarget.id, editTarget.builtIn.template, editTarget.builtIn.wallId);
  });
  const hasBuiltIns = Boolean(currentProject?.objects.some((o) => o.shape === 'group' && o.builtIn));
  const builtIns = useReliableTap(() => {
    onClose();
    useBuiltInFlow.getState().openList();
  });
  const jointCount = jointsOf(currentProject, selectedObjectId).length;
  const joints = useReliableTap(() => {
    if (!selectedObjectId) return;
    onClose();
    useJoinFlow.getState().list(selectedObjectId);
  });
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
      {editTarget && (
        <button type="button" className="phone-sheet-row" data-testid="menu-edit-template" onClick={editTemplate} onPointerUp={editTemplate}>
          <SlidersHorizontal size={18} />
          <span>Edit template</span>
        </button>
      )}
      {hasBuiltIns && (
        <button type="button" className="phone-sheet-row" data-testid="menu-builtins" onClick={builtIns} onPointerUp={builtIns}>
          <Tv size={18} />
          <span>Built-ins</span>
        </button>
      )}
      <ViewStyleRow />
      <button type="button" className="phone-sheet-row" data-testid="menu-measure" onClick={measure} onPointerUp={measure}>
        <Ruler size={18} />
        <span>Measure</span>
      </button>
      <button type="button" className="phone-sheet-row" data-testid="menu-select-area" onClick={selectArea} onPointerUp={selectArea}>
        <BoxSelect size={18} />
        {/* With a part selected this keeps it and lets you tap more parts to add them. */}
        <span>{selectedObjectId ? 'Select more' : 'Select area'}</span>
      </button>
      {canRename && (
        <button type="button" className="phone-sheet-row" data-testid="menu-rename-selection" onClick={renameSelection} onPointerUp={renameSelection}>
          <TextCursorInput size={18} />
          <span>Rename {selectedObj?.shape === 'group' ? 'group' : 'part'}</span>
        </button>
      )}
      {canSaveTemplate && (
        <button type="button" className="phone-sheet-row" data-testid="menu-save-template" onClick={saveTemplate} onPointerUp={saveTemplate}>
          <BookmarkPlus size={18} />
          <span>Save as template</span>
        </button>
      )}
      {canScan && (
        <button type="button" className="phone-sheet-row" data-testid="menu-scan-room" disabled={scanning} onClick={scanRoom} onPointerUp={scanRoom}>
          <ScanLine size={18} />
          <span>{scanning ? 'Scanning…' : 'Scan room'}</span>
        </button>
      )}
      {hasRoom && (
        <button type="button" className="phone-sheet-row" role="switch" aria-checked={roomLocked} data-testid="menu-lock-walls"
          onClick={toggleRoomLock} onPointerUp={toggleRoomLock} style={{ justifyContent: 'space-between' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {roomLocked ? <Lock size={18} /> : <LockOpen size={18} />}
            <span>Lock scanned walls</span>
          </span>
          <span className={`menu-switch${roomLocked ? ' is-on' : ''}`} aria-hidden="true"><span /></span>
        </button>
      )}
      {hasRoom && (
        <button type="button" className="phone-sheet-row" data-testid="menu-square-walls" onClick={squareUp} onPointerUp={squareUp}>
          <SquareDashed size={18} />
          <span>Square up walls</span>
        </button>
      )}
      <button type="button" className="phone-sheet-row" data-testid="tool-settings" onClick={settings} onPointerUp={settings}>
        <Settings size={18} />
        <span>Settings</span>
      </button>
      {jointCount > 0 && (
        <button type="button" className="phone-sheet-row" data-testid="menu-joints" onClick={joints} onPointerUp={joints}>
          <Link2 size={18} />
          <span>Joints ({jointCount})</span>
        </button>
      )}
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
    </div>
  );
};

/** ••• › Style: Clean (flat colors + outlines) / Realistic (grain + shadows). */
const ViewStyleRow: React.FC = () => {
  const style = useAppStore((s) => s.preferences.viewStyle ?? 'realistic');
  const update = useAppStore((s) => s.updatePreferences);
  const clean = useReliableTap(() => update({ viewStyle: 'clean' }));
  const real = useReliableTap(() => update({ viewStyle: 'realistic' }));
  return (
    <div className="phone-sheet-row view-style-row" data-testid="menu-view-style" role="group" aria-label="Style">
      <span>Style</span>
      <span className="view-style-seg">
        <button type="button" className={style === 'clean' ? 'is-on' : ''} data-testid="style-clean" aria-pressed={style === 'clean'} onClick={clean} onPointerUp={clean}>Clean</button>
        <button type="button" className={style === 'realistic' ? 'is-on' : ''} data-testid="style-realistic" aria-pressed={style === 'realistic'} onClick={real} onPointerUp={real}>Realistic</button>
      </span>
    </div>
  );
};
