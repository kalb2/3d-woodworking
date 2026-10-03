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
  Plus,
  Ruler,
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
  const { overlays, setOverlayOpen } = useAppStore();
  const { activeProjectId, projects } = useProjectStore();
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
  const { overlays, openOverlay, setOverlayOpen } = useAppStore();
  const {
    projects,
    activeProjectId,
    selectedObjectId,
    duplicateObject,
    deleteObject,
    showDimensions,
    toggleDimensions,
  } = useProjectStore();
  const [partMenuOpen, setPartMenuOpen] = useState(false);

  const currentProject = projects.find((p) => p.id === activeProjectId);
  const selectedObject = currentProject?.objects.find((object) => object.id === selectedObjectId);
  const contentOpen = overlays.sidebar || overlays.inspector || overlays.materials || overlays.settings;
  const propertiesOpen = overlays.inspector;

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
      <div className="phone-dock-grid">
      <nav className="phone-tool-sheet-secondary" aria-label="Measure and view">
        <DockItem
          compact
          label="Settings"
          testId="tool-settings"
          icon={<Settings size={18} strokeWidth={1.7} />}
          active={overlays.settings}
          onTap={() => {
            if (overlays.settings) {
              setOverlayOpen('settings', false);
              return;
            }
            openOverlay('settings', true);
          }}
        />
        <PhoneTapButton
          className={`phone-measure-pill${showDimensions ? ' is-active' : ''}`}
          onTap={toggleDimensions}
          aria-label="Toggle dimensions"
          aria-pressed={showDimensions}
          title="Toggle dimensions"
          data-testid="tool-dims"
        >
          <Ruler size={16} strokeWidth={1.8} />
          <span>Measure</span>
        </PhoneTapButton>
        <DockItem
          compact
          label="Parts"
          testId="overlay-launch-shapes"
          icon={<Box size={18} strokeWidth={1.7} />}
          active={overlays.sidebar}
          onTap={() => {
            if (overlays.sidebar) {
              setOverlayOpen('sidebar', false);
              return;
            }
            openOverlay('sidebar', true);
          }}
        />
      </nav>
      <DockItem
        className="phone-dock-part"
        label="Properties"
        testId="overlay-launch-properties"
        icon={<SlidersHorizontal size={22} strokeWidth={1.6} />}
        active={propertiesOpen}
        disabled={!hasSelection}
        onTap={() => {
          if (!hasSelection) return;
          if (overlays.inspector) {
            setOverlayOpen('inspector', false);
            return;
          }
          openOverlay('inspector', true);
        }}
      />
      </div>
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
  className?: string;
  onTap: () => void;
}> = ({ label, testId, icon, active, disabled, compact, className, onTap }) => (
  <PhoneTapButton
    className={`phone-dock-item${compact ? ' is-compact' : ''}${active ? ' is-active' : ''}${className ? ` ${className}` : ''}`}
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
