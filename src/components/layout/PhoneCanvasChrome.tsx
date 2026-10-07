import React from 'react';
import {
  Check,
  Copy,
  Ellipsis,
  Group,
  Home,
  Move,
  Pencil,
  Plus,
  RotateCw,
  Scaling,
  Ungroup,
  Trash2,
} from 'lucide-react';
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
  const currentProject = projects.find((p) => p.id === activeProjectId);
  const selectedObject = currentProject?.objects.find((object) => object.id === selectedObjectId);
  const contentOpen = overlays.sidebar || overlays.inspector || overlays.materials || overlays.settings;
  const groupId = selectedObject?.shape === 'group' ? selectedObject.id : editingGroupId;

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
      {selectedObject && !overlays.inspector && (
        <PhoneTapButton
          className="phone-properties-entry"
          data-testid="phone-properties"
          aria-label="Properties"
          onTap={() => openOverlay('inspector')}
        >
          Properties
        </PhoneTapButton>
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
          onTap={() => {
            setSidebarPanel('shapes');
            openOverlay('sidebar');
          }}
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
