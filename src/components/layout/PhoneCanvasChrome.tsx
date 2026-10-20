import React from 'react';
import { stretchBox } from '../../utils/groupStretch';
import {
  Copy,
  Ellipsis,
  Home,
  Move,
  Plus,
  RotateCw,
  Scaling,
  Trash2,
} from 'lucide-react';
import { FloatingLeft } from './FloatingLeft';
import { useAppStore } from '../../state/useAppStore';
import { useProjectStore } from '../../state/useProjectStore';
import { fireReliableTap, useReliableTap } from '../../utils/reliableTap';
import { EditorOverflowList } from './EditorOverflow';
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
  const { setView, openOverlay, overlays, setOverlayOpen } = useAppStore();
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

      <div className="phone-header-actions">
        <PhoneTapButton
          className="phone-header-icon-btn"
          onTap={() => {
            if (overlays.menu) setOverlayOpen('menu', false);
            else openOverlay('menu', true);
          }}
          title="More"
          aria-label="More"
          aria-expanded={overlays.menu}
          data-testid="editor-overflow"
        >
          <Ellipsis size={20} />
        </PhoneTapButton>
      </div>
    </header>
  );
};

interface PhoneMenuSheetProps {
  onOpenCutList: () => void;
  onShareProject: () => void;
}

export const PhoneMenuSheet: React.FC<PhoneMenuSheetProps> = ({
  onOpenCutList,
  onShareProject,
}) => {
  const { overlays, setOverlayOpen } = useAppStore();

  if (!overlays.menu) return null;

  const close = () => setOverlayOpen('menu', false);

  return (
    <div
      className="project-overlay project-overlay-menu phone-floating-sheet"
      data-testid="overlay-menu"
      style={PHONE_FLOATING_SHEET_STYLE}
    >
      <PhoneSheetGrab />
      <div className="phone-sheet-header">
        <span className="phone-sheet-title">More</span>
        <OverlayDismissButton onDismiss={close} />
      </div>
      <div className="phone-sheet-body">
        <EditorOverflowList
          onOpenCutList={onOpenCutList}
          onShareProject={onShareProject}
          onClose={close}
        />
      </div>
    </div>
  );
};

export const PhoneBottomSheet: React.FC<{ children?: React.ReactNode }> = ({
  children,
}) => {
  const { overlays, openOverlay, setSidebarPanel } = useAppStore();
  const {
    projects,
    activeProjectId,
    selectedObjectId,
    selectedObjectIds,
    activeGizmoMode,
    setGizmoMode,
    duplicateSelected,
    deleteSelected,
  } = useProjectStore();
  const currentProject = projects.find((p) => p.id === activeProjectId);
  const selectedObject = currentProject?.objects.find((object) => object.id === selectedObjectId);
  const contentOpen = overlays.sidebar || overlays.inspector || overlays.materials || overlays.settings;
  // Groups and multi-selections resize by stretching, unless turned (wall-fitted built-ins) or scanned.
  const noResize = (selectedObject?.shape === 'group' || selectedObjectIds.length > 1)
    && !(currentProject && stretchBox(currentProject.objects, selectedObjectIds.length > 1 ? selectedObjectIds : [selectedObject!.id]));

  return (
    <div
      className={`phone-tool-sheet${contentOpen ? ' is-expanded' : ''}`}
      data-testid="phone-canvas-dock"
    >
      <div className="phone-tool-sheet-handle" aria-hidden="true" />
      {/* Bottom-left: Properties (with a selection) + Undo/Redo; stays up while Properties is open so a second tap closes it. */}
      {(!contentOpen || overlays.inspector) && <FloatingLeft placement="phone" showUndo={!contentOpen} />}
      {!contentOpen && (
        <PhoneTapButton
          className="add-fab is-phone"
          data-testid="toolbar-add"
          aria-label="Add"
          title="Add"
          onTap={() => {
            setSidebarPanel('shapes');
            openOverlay('sidebar');
          }}
        >
          <Plus size={24} strokeWidth={2.2} />
        </PhoneTapButton>
      )}
      {contentOpen && (
        <div className="phone-tool-sheet-body" data-testid="phone-tool-sheet-body">
          {children}
          <WorkshopSettings />
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
        {!noResize && <DockItem
          label="Resize"
          testId="tool-resize"
          icon={<Scaling size={22} strokeWidth={1.8} />}
          active={activeGizmoMode === 'resize'}
          showLabel
          onTap={() => setGizmoMode('resize')}
        />}
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
            if (selectedObject) duplicateSelected();
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
            if (selectedObject) deleteSelected();
          }}
        />
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
