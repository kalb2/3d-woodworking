import React, { useEffect, useState } from 'react';
import {
  Box,
  Camera,
  Check,
  Copy,
  FileCode,
  FileSpreadsheet,
  FolderOpen,
  Home,
  Layers,
  Menu,
  Ellipsis,
  Group,
  Move,
  Pencil,
  Plus,
  RotateCw,
  Ruler,
  Scaling,
  Ungroup,
  Settings,
  Share2,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { useAppStore } from '../../state/useAppStore';
import { useProjectStore } from '../../state/useProjectStore';
import { fireReliableTap, useReliableTap } from '../../utils/reliableTap';
import { copyProjectToClipboard, exportCutListCSV, exportProjectJSON } from '../../utils/exportUtils';
import { OverlayDismissButton, PhoneSheetGrab } from './OverlayChrome';
import { WorkshopSettings } from './WorkshopSettings';
import { PHONE_FLOATING_SHEET_STYLE } from './phoneSheet';
import { MoveFloorRow, ResizeSizeRow, RotateAngleRow } from './SizeBar';

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
    const order = ['in', 'cm', 'mm', 'ft'] as const;
    const next = order[(order.indexOf(unit as typeof order[number]) + 1) % order.length] ?? 'in';
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
  onNewProject: () => void;
}

export const PhoneMenuSheet: React.FC<PhoneMenuSheetProps> = ({
  onOpenProjectModal,
  onOpenCutList,
  onNewProject,
}) => {
  const { overlays, openOverlay, setOverlayOpen } = useAppStore();
  const { activeProjectId, projects, setGizmoMode } = useProjectStore();
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
      className="project-overlay project-overlay-menu phone-floating-sheet"
      data-testid="overlay-menu"
      style={PHONE_FLOATING_SHEET_STYLE}
    >
      <PhoneSheetGrab />
      <div className="phone-sheet-header">
        <span className="phone-sheet-title">Project</span>
        <OverlayDismissButton onDismiss={close} />
      </div>
      <div className="phone-sheet-body">
        <PhoneTapButton
          className="phone-sheet-row"
          data-testid="tool-settings"
          onTap={() => { close(); openOverlay('settings', true); }}
        >
          <Settings size={18} />
          <span>Settings</span>
        </PhoneTapButton>
        <PhoneTapButton
          className="phone-sheet-row"
          data-testid="overlay-launch-shapes"
          onTap={() => { close(); openOverlay('sidebar', true); }}
        >
          <Box size={18} />
          <span>Parts</span>
        </PhoneTapButton>
        <PhoneTapButton
          className="phone-sheet-row"
          data-testid="overlay-launch-properties"
          onTap={() => { close(); openOverlay('inspector', true); }}
        >
          <SlidersHorizontal size={18} />
          <span>Properties</span>
        </PhoneTapButton>
        <PhoneTapButton
          className="phone-sheet-row"
          data-testid="tool-dims"
          onTap={() => { close(); setGizmoMode('move'); }}
        >
          <Ruler size={18} />
          <span>Measure</span>
        </PhoneTapButton>
        <PhoneTapButton
          className="phone-sheet-row"
          onTap={() => { close(); onOpenProjectModal(); }}
        >
          <FolderOpen size={18} />
          <span>Switch project</span>
        </PhoneTapButton>
        <PhoneTapButton
          className="phone-sheet-row"
          data-testid="menu-new-project"
          onTap={() => {
            close();
            onNewProject();
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

export const PhoneBottomSheet: React.FC<PhoneCanvasDockProps & { children?: React.ReactNode }> = ({
  hasSelection,
  children,
}) => {
  const { overlays, openOverlay } = useAppStore();
  const {
    projects,
    activeProjectId,
    selectedObjectId,
    selectedObjectIds,
    editingGroupId,
    activeGizmoMode,
    setGizmoMode,
    groupSelected,
    ungroup,
    enterGroup,
    exitGroup,
    duplicateObject,
    deleteObject,
  } = useProjectStore();
  const [partMenuOpen, setPartMenuOpen] = useState(false);

  const currentProject = projects.find((p) => p.id === activeProjectId);
  const selectedObject = currentProject?.objects.find((object) => object.id === selectedObjectId);
  const contentOpen = overlays.sidebar || overlays.inspector || overlays.materials || overlays.settings;
  const groupId = selectedObject?.shape === 'group' ? selectedObject.id : editingGroupId;

  useEffect(() => {
    setPartMenuOpen(false);
  }, [selectedObjectId]);

  return (
    <div
      className={`phone-tool-sheet${contentOpen ? ' is-expanded' : ''}`}
      data-testid="phone-canvas-dock"
    >
      <div className="phone-tool-sheet-handle" aria-hidden="true" />
      {contentOpen && (
        <div className="phone-tool-sheet-body" data-testid="phone-tool-sheet-body">
          {children}
          <WorkshopSettings />
        </div>
      )}
      {hasSelection && selectedObject && (
        <div className="phone-selected-part" data-testid="selected-part-chip">
          <span className="phone-selected-part-name" title={selectedObject.name}>
            {selectedObject.name}
          </span>
          <PhoneTapButton
            className="phone-selected-part-delete"
            onTap={() => deleteObject(selectedObject.id)}
            aria-label={`Delete ${selectedObject.name}`}
            title="Delete part"
            data-testid="selected-part-delete"
          >
            <Trash2 size={15} strokeWidth={1.8} />
            <span>Delete</span>
          </PhoneTapButton>
          <PhoneTapButton
            className={`phone-selected-part-more${partMenuOpen ? ' is-open' : ''}`}
            onTap={() => setPartMenuOpen((open) => !open)}
            aria-label="Part actions"
            aria-expanded={partMenuOpen}
            title="Part actions"
            data-testid="selected-part-menu"
          >
            <Ellipsis size={18} strokeWidth={1.8} />
          </PhoneTapButton>
          {partMenuOpen && (
            <div className="phone-selected-part-menu" role="menu" data-testid="selected-part-menu-list">
              <PhoneTapButton
                className="phone-sheet-row"
                onTap={() => {
                  duplicateObject(selectedObject.id);
                  setPartMenuOpen(false);
                }}
                data-testid="selected-part-menu-duplicate"
              >
                <Copy size={16} />
                <span>Duplicate</span>
              </PhoneTapButton>
              <PhoneTapButton
                className="phone-sheet-row is-danger"
                onTap={() => {
                  deleteObject(selectedObject.id);
                  setPartMenuOpen(false);
                }}
                data-testid="selected-part-menu-delete"
              >
                <Trash2 size={16} />
                <span>Delete</span>
              </PhoneTapButton>
            </div>
          )}
        </div>
      )}
      <nav className="phone-transform-bar" data-testid="transform-menu" aria-label="Move, resize, and rotate">
        <DockItem
          label="Move"
          testId="overlay-launch-tools"
          icon={<Move size={22} strokeWidth={1.8} />}
          active={activeGizmoMode === 'move'}
          showLabel
          onTap={() => setGizmoMode('move')}
        />
        <DockItem
          label="Resize"
          testId="tool-resize"
          icon={<Scaling size={22} strokeWidth={1.8} />}
          active={activeGizmoMode === 'resize'}
          showLabel
          onTap={() => setGizmoMode('resize')}
        />
        <DockItem
          label="Rotate"
          testId="tool-rotate"
          icon={<RotateCw size={22} strokeWidth={1.8} />}
          active={activeGizmoMode === 'rotate'}
          showLabel
          onTap={() => setGizmoMode('rotate')}
        />
        <DockItem
          label="Duplicate"
          testId="toolbar-duplicate"
          icon={<Copy size={22} strokeWidth={1.8} />}
          active={false}
          disabled={!selectedObject}
          showLabel
          className="is-duplicate"
          onTap={() => {
            if (selectedObject) duplicateObject(selectedObject.id);
          }}
        />
        <DockItem
          label="Delete"
          testId="toolbar-delete"
          icon={<Trash2 size={22} strokeWidth={1.8} />}
          active={false}
          disabled={!selectedObject}
          showLabel
          className="is-delete"
          onTap={() => {
            if (selectedObject) deleteObject(selectedObject.id);
          }}
        />
        <DockItem
          label="Add"
          testId="toolbar-add"
          icon={<Plus size={22} strokeWidth={1.8} />}
          active={false}
          showLabel
          onTap={() => openOverlay('sidebar')}
        />
        {selectedObjectIds.length >= 2 && (
          <DockItem
            label="Group"
            testId="transform-group"
            icon={<Group size={22} strokeWidth={1.8} />}
            active={false}
            onTap={() => groupSelected()}
          />
        )}
        {groupId && selectedObject?.shape === 'group' && !editingGroupId && (
          <>
            <DockItem
              label="Edit"
              testId="transform-edit-group"
              icon={<Pencil size={22} strokeWidth={1.8} />}
              active={false}
              onTap={() => enterGroup(groupId)}
            />
            <DockItem
              label="Ungroup"
              testId="transform-ungroup"
              icon={<Ungroup size={22} strokeWidth={1.8} />}
              active={false}
              onTap={() => ungroup(groupId)}
            />
          </>
        )}
        {editingGroupId && (
          <DockItem
            label="Done"
            testId="transform-done-group"
            icon={<Check size={22} strokeWidth={1.8} />}
            active
            onTap={() => exitGroup()}
          />
        )}
      </nav>
      <MoveFloorRow />
      <ResizeSizeRow />
      <RotateAngleRow />
    </div>
  );
};

/** @deprecated use PhoneBottomSheet — kept so existing imports keep type-checking during the rename */
export const PhoneCanvasDock = PhoneBottomSheet;

const DockItem: React.FC<{
  label: string;
  testId: string;
  icon: React.ReactNode;
  active: boolean;
  disabled?: boolean;
  compact?: boolean;
  showLabel?: boolean;
  className?: string;
  onTap: () => void;
}> = ({ label, testId, icon, active, disabled, compact, showLabel, className, onTap }) => (
  <PhoneTapButton
    className={`phone-dock-item${compact ? ' is-compact' : ''}${showLabel ? ' has-caption' : ''}${active ? ' is-active' : ''}${className ? ` ${className}` : ''}`}
    disabled={disabled}
    onTap={onTap}
    aria-label={disabled ? `${label} (select a part)` : label}
    aria-pressed={active}
    title={disabled ? 'Select a part first' : label}
    data-testid={testId}
  >
    {icon}
    <span>{label}</span>
  </PhoneTapButton>
);
