import React, { useState } from 'react';
import {
  Box,
  Camera,
  Check,
  Copy,
  FileCode,
  FileSpreadsheet,
  FolderOpen,
  Grid,
  Home,
  Layers,
  Magnet,
  Menu,
  Move,
  Palette,
  Plus,
  Redo,
  RotateCw,
  Scaling,
  Share2,
  SlidersHorizontal,
  Trash2,
  Undo,
} from 'lucide-react';
import { useAppStore } from '../../state/useAppStore';
import { useProjectStore } from '../../state/useProjectStore';
import { fireReliableTap, useReliableTap } from '../../utils/reliableTap';
import { copyProjectToClipboard, exportCutListCSV, exportProjectJSON } from '../../utils/exportUtils';
import { OverlayDismissButton, PhoneSheetGrab } from './OverlayChrome';
import { PHONE_SHEET_STYLE } from './phoneSheet';

interface PhoneTapButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  onTap: () => void;
}

const PhoneTapButton: React.FC<PhoneTapButtonProps> = ({ onTap, type = 'button', ...props }) => {
  const handler = useReliableTap(onTap);
  return <button type={type} {...props} onClick={handler} onPointerUp={handler} />;
};

export const PhoneCanvasHeader: React.FC = () => {
  const { setView, openOverlay } = useAppStore();
  const { projects, activeProjectId, setUnit } = useProjectStore();
  const currentProject = projects.find((p) => p.id === activeProjectId);
  const unit = currentProject?.unit ?? 'in';

  const cycleUnit = () => {
    const next = unit === 'in' ? 'cm' : unit === 'cm' ? 'mm' : 'in';
    setUnit(next);
  };

  return (
    <header className="editor-header phone-canvas-header" data-testid="phone-canvas-header">
      <button
        type="button"
        className="phone-header-icon-btn"
        onClick={(event) => fireReliableTap(event, () => setView('home'))}
        onPointerUp={(event) => fireReliableTap(event, () => setView('home'))}
        title="Back to Projects Home"
        aria-label="Back to Projects Home"
        data-testid="nav-home"
      >
        <Home size={20} />
      </button>

      <div className="phone-header-title-pill" data-testid="phone-project-title">
        <span className="phone-header-project-name">
          {currentProject?.name || 'My Project'}
        </span>
        <span className="phone-header-sep" aria-hidden="true">/</span>
        <PhoneTapButton
          className="phone-header-unit"
          onTap={cycleUnit}
          aria-label={`Units: ${unit}. Tap to change`}
          title="Change units"
          data-testid="phone-project-units"
        >
          {unit}
        </PhoneTapButton>
      </div>

      <PhoneTapButton
        className="phone-header-icon-btn"
        onTap={() => openOverlay('menu', true)}
        title="Project menu"
        aria-label="Project menu"
        data-testid="canvas-menu"
      >
        <Menu size={20} />
      </PhoneTapButton>
    </header>
  );
};

interface PhoneMenuSheetProps {
  onOpenProjectModal: () => void;
  onOpenCutList: () => void;
}

export const PhoneMenuSheet: React.FC<PhoneMenuSheetProps> = ({
  onOpenProjectModal,
  onOpenCutList,
}) => {
  const { overlays, setOverlayOpen } = useAppStore();
  const { projects, activeProjectId, createProject } = useProjectStore();
  const currentProject = projects.find((p) => p.id === activeProjectId);
  const [copiedNotification, setCopiedNotification] = useState(false);

  if (!overlays.menu) return null;

  const close = () => setOverlayOpen('menu', false);

  const handleCapturePNG = () => {
    const canvas = document.querySelector('canvas');
    if (canvas) {
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `${currentProject?.name.toLowerCase().replace(/\s+/g, '_') || 'furniture'}_render.png`;
      a.click();
    }
    close();
  };

  const handleCopyJSON = async () => {
    if (!currentProject) return;
    const ok = await copyProjectToClipboard(currentProject);
    if (ok) {
      setCopiedNotification(true);
      setTimeout(() => {
        setCopiedNotification(false);
        close();
      }, 1200);
    }
  };

  return (
    <div
      className="glass-panel project-overlay project-overlay-menu phone-bottom-sheet"
      data-testid="overlay-menu"
      style={PHONE_SHEET_STYLE}
    >
      <PhoneSheetGrab />
      <div className="phone-sheet-header">
        <span className="phone-sheet-title">Project</span>
        <OverlayDismissButton onDismiss={close} />
      </div>
      <div className="phone-sheet-body">
        <PhoneTapButton
          className="phone-sheet-row"
          onTap={() => { close(); onOpenProjectModal(); }}
        >
          <FolderOpen size={18} />
          <span>Switch project</span>
        </PhoneTapButton>
        <PhoneTapButton
          className="phone-sheet-row"
          onTap={() => {
            createProject(`Project ${projects.length + 1}`);
            close();
          }}
        >
          <Plus size={18} />
          <span>New project</span>
        </PhoneTapButton>
        <PhoneTapButton
          className="phone-sheet-row"
          onTap={() => { close(); onOpenCutList(); }}
        >
          <Layers size={18} />
          <span>Cut list</span>
        </PhoneTapButton>
        <PhoneTapButton
          className="phone-sheet-row"
          onTap={() => {
            if (currentProject) exportCutListCSV(currentProject);
            close();
          }}
        >
          <FileSpreadsheet size={18} />
          <span>Export CSV cut list</span>
        </PhoneTapButton>
        <PhoneTapButton className="phone-sheet-row" onTap={handleCapturePNG}>
          <Camera size={18} />
          <span>Snapshot image (PNG)</span>
        </PhoneTapButton>
        <PhoneTapButton
          className="phone-sheet-row"
          onTap={() => {
            if (currentProject) exportProjectJSON(currentProject);
            close();
          }}
        >
          <FileCode size={18} />
          <span>Export project (.json)</span>
        </PhoneTapButton>
        <PhoneTapButton
          className="phone-sheet-row"
          onTap={() => { void handleCopyJSON(); }}
        >
          {copiedNotification ? <Check size={18} /> : <Share2 size={18} />}
          <span>{copiedNotification ? 'Copied to clipboard' : 'Copy JSON blueprint'}</span>
        </PhoneTapButton>
      </div>
    </div>
  );
};

interface PhoneCanvasDockProps {
  hasSelection: boolean;
}

export const PhoneCanvasDock: React.FC<PhoneCanvasDockProps> = ({ hasSelection }) => {
  const { overlays, openOverlay, setOverlayOpen } = useAppStore();

  const items: Array<{
    id: 'sidebar' | 'tools' | 'inspector' | 'materials';
    label: string;
    testId: string;
    icon: React.ReactNode;
    disabled?: boolean;
  }> = [
    { id: 'sidebar', label: 'Parts', testId: 'overlay-launch-shapes', icon: <Box size={20} /> },
    { id: 'tools', label: 'Tools', testId: 'overlay-launch-tools', icon: <Move size={20} /> },
    {
      id: 'inspector',
      label: 'Properties',
      testId: 'overlay-launch-properties',
      icon: <SlidersHorizontal size={20} />,
      disabled: !hasSelection,
    },
    {
      id: 'materials',
      label: 'Finish',
      testId: 'overlay-launch-finish',
      icon: <Palette size={20} />,
      disabled: !hasSelection,
    },
  ];

  return (
    <nav className="phone-canvas-dock" data-testid="phone-canvas-dock" aria-label="Canvas tools">
      {items.map((item) => (
        <DockItem
          key={item.id}
          label={item.label}
          testId={item.testId}
          icon={item.icon}
          active={overlays[item.id]}
          disabled={item.disabled}
          onTap={() => {
            if (item.disabled) return;
            if (overlays[item.id]) {
              setOverlayOpen(item.id, false);
              return;
            }
            openOverlay(item.id, true);
          }}
        />
      ))}
    </nav>
  );
};

const DockItem: React.FC<{
  label: string;
  testId: string;
  icon: React.ReactNode;
  active: boolean;
  disabled?: boolean;
  onTap: () => void;
}> = ({ label, testId, icon, active, disabled, onTap }) => (
  <PhoneTapButton
    className={`phone-dock-item${active ? ' is-active' : ''}`}
    disabled={disabled}
    onTap={onTap}
    aria-label={disabled ? `${label} (select a part)` : `Open ${label}`}
    aria-pressed={active}
    title={disabled ? 'Select a part first' : label}
    data-testid={testId}
  >
    {icon}
    <span>{label}</span>
  </PhoneTapButton>
);

export const PhoneToolsSheet: React.FC = () => {
  const { overlays, setOverlayOpen } = useAppStore();
  const {
    projects,
    activeProjectId,
    selectedObjectId,
    activeGizmoMode,
    setGizmoMode,
    historyIndex,
    historyStack,
    undo,
    redo,
    toggleFloor,
    updateSnapSettings,
    duplicateObject,
    deleteObject,
  } = useProjectStore();

  const currentProject = projects.find((p) => p.id === activeProjectId);
  if (!overlays.tools) return null;

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < historyStack.length - 1;
  const hasSelection = Boolean(selectedObjectId);

  return (
    <div
      className="glass-panel project-overlay project-overlay-tools phone-bottom-sheet"
      data-testid="overlay-tools"
      style={PHONE_SHEET_STYLE}
    >
      <PhoneSheetGrab />
      <div className="phone-sheet-header">
        <span className="phone-sheet-title">Tools</span>
        <OverlayDismissButton onDismiss={() => setOverlayOpen('tools', false)} />
      </div>
      <div className="phone-sheet-body">
        <div className="phone-tool-group-label">Move / copy / rotate</div>
        <div className="phone-tool-grid">
          <PhoneTapButton
            className={`phone-tool-chip${activeGizmoMode === 'move' ? ' is-active' : ''}`}
            onTap={() => setGizmoMode('move')}
          >
            <Move size={18} />
            <span>Move</span>
          </PhoneTapButton>
          <PhoneTapButton
            className={`phone-tool-chip${activeGizmoMode === 'resize' ? ' is-active' : ''}`}
            onTap={() => setGizmoMode('resize')}
          >
            <Scaling size={18} />
            <span>Resize</span>
          </PhoneTapButton>
          <PhoneTapButton
            className={`phone-tool-chip${activeGizmoMode === 'rotate' ? ' is-active' : ''}`}
            onTap={() => setGizmoMode('rotate')}
          >
            <RotateCw size={18} />
            <span>Rotate</span>
          </PhoneTapButton>
          <PhoneTapButton
            className="phone-tool-chip"
            disabled={!hasSelection}
            onTap={() => { if (selectedObjectId) duplicateObject(selectedObjectId); }}
          >
            <Copy size={18} />
            <span>Copy</span>
          </PhoneTapButton>
          <PhoneTapButton
            className="phone-tool-chip is-danger"
            disabled={!hasSelection}
            onTap={() => { if (selectedObjectId) deleteObject(selectedObjectId); }}
          >
            <Trash2 size={18} />
            <span>Delete</span>
          </PhoneTapButton>
        </div>

        <div className="phone-tool-group-label">Settings</div>
        <div className="phone-tool-grid">
          <PhoneTapButton
            className={`phone-tool-chip${currentProject?.snapSettings.enabled ? ' is-active' : ''}`}
            onTap={() => {
              if (currentProject) {
                updateSnapSettings({ enabled: !currentProject.snapSettings.enabled });
              }
            }}
          >
            <Magnet size={18} />
            <span>Magnet</span>
          </PhoneTapButton>
          <PhoneTapButton
            className={`phone-tool-chip${currentProject?.showFloor ? ' is-active' : ''}`}
            onTap={toggleFloor}
          >
            <Grid size={18} />
            <span>Floor</span>
          </PhoneTapButton>
          <PhoneTapButton className="phone-tool-chip" disabled={!canUndo} onTap={undo}>
            <Undo size={18} />
            <span>Undo</span>
          </PhoneTapButton>
          <PhoneTapButton className="phone-tool-chip" disabled={!canRedo} onTap={redo}>
            <Redo size={18} />
            <span>Redo</span>
          </PhoneTapButton>
        </div>
      </div>
    </div>
  );
};
