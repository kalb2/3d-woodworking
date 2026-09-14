import React, { useState } from 'react';
import {
  Undo,
  Redo,
  Magnet,
  Grid,
  Move,
  Scaling,
  RotateCw,
  FolderOpen,
  Plus,
  Download,
  FileSpreadsheet,
  Camera,
  Layers,
  ChevronDown,
  Home,
  FileCode,
  Share2,
  Check
} from 'lucide-react';
import { useProjectStore } from '../../state/useProjectStore';
import { useAppStore } from '../../state/useAppStore';
import { useIsPhone } from '../../hooks/useIsPhone';
import { exportCutListCSV, exportProjectJSON, copyProjectToClipboard } from '../../utils/exportUtils';
import { fireReliableTap } from '../../utils/reliableTap';

interface IPadHeaderProps {
  onOpenProjectModal: () => void;
  onOpenCutList: () => void;
}

export const IPadHeader: React.FC<IPadHeaderProps> = ({
  onOpenProjectModal,
  onOpenCutList
}) => {
  const {
    projects,
    activeProjectId,
    activeGizmoMode,
    setGizmoMode,
    historyIndex,
    historyStack,
    undo,
    redo,
    toggleFloor,
    updateSnapSettings,
    createProject
  } = useProjectStore();

  const { setView } = useAppStore();
  const isPhone = useIsPhone();

  const [showExportMenu, setShowExportMenu] = useState(false);
  const [copiedNotification, setCopiedNotification] = useState(false);
  const currentProject = projects.find(p => p.id === activeProjectId);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < historyStack.length - 1;

  const handleCapturePNG = () => {
    setShowExportMenu(false);
    const canvas = document.querySelector('canvas');
    if (canvas) {
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `${currentProject?.name.toLowerCase().replace(/\s+/g, '_') || 'furniture'}_render.png`;
      a.click();
    }
  };

  const handleExportJSON = () => {
    setShowExportMenu(false);
    if (currentProject) {
      exportProjectJSON(currentProject);
    }
  };

  const handleCopyJSON = async () => {
    if (!currentProject) return;
    const ok = await copyProjectToClipboard(currentProject);
    if (ok) {
      setCopiedNotification(true);
      setTimeout(() => {
        setCopiedNotification(false);
        setShowExportMenu(false);
      }, 1500);
    }
  };

  return (
    <header
      className="editor-header"
      style={{
      position: 'absolute',
      left: 16,
      right: 16,
      zIndex: 20,
      height: 56,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      pointerEvents: 'none'
    }}>
      {/* Left section: Home Button, Project Switcher & Undo/Redo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, pointerEvents: 'auto', minWidth: 0, overflow: 'hidden' }}>
        {/* Back to Home Button */}
        <button
          type="button"
          className="glass-panel glass-button"
          onClick={(event) => fireReliableTap(event, () => setView('home'))}
          onPointerUp={(event) => fireReliableTap(event, () => setView('home'))}
          title="Back to Projects Home"
          aria-label="Back to Projects Home"
          data-testid="nav-home"
          style={{ padding: '10px 14px' }}
        >
          <Home size={18} color="#e09f3e" />
          {!isPhone && <span style={{ fontWeight: 600 }}>Home</span>}
        </button>

        {/* Project Selector Button */}
        <button
          className="glass-panel glass-button"
          onClick={onOpenProjectModal}
          style={{ minWidth: isPhone ? 0 : 180, maxWidth: isPhone ? 160 : undefined, justifyContent: 'space-between' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FolderOpen size={18} color="#e09f3e" />
            <span style={{ fontWeight: 600, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {currentProject?.name || 'My Project'}
            </span>
          </div>
          <ChevronDown size={16} color="#9ca3af" />
        </button>

        {/* New Project Quick Button */}
        <button
          className="glass-panel glass-button"
          onClick={() => {
            const name = prompt('Enter new woodworking project name:', `Project ${projects.length + 1}`);
            if (name) createProject(name);
          }}
          title="New Project (starts with cube)"
        >
          <Plus size={18} />
        </button>

        {!isPhone && <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.15)', margin: '0 4px' }} />}

        {/* Undo / Redo */}
        <button
          className={`glass-panel glass-button ${!canUndo ? 'disabled' : ''}`}
          onClick={undo}
          disabled={!canUndo}
          style={{ opacity: canUndo ? 1 : 0.4, display: isPhone ? 'none' : undefined }}
          title="Undo (Ctrl+Z)"
        >
          <Undo size={18} />
        </button>

        <button
          className={`glass-panel glass-button ${!canRedo ? 'disabled' : ''}`}
          onClick={redo}
          disabled={!canRedo}
          style={{ opacity: canRedo ? 1 : 0.4, display: isPhone ? 'none' : undefined }}
          title="Redo (Ctrl+Y)"
        >
          <Redo size={18} />
        </button>
      </div>

      {/* Middle section: Gizmo Mode Controls (Move, Grab Resize, Rotate) */}
      {!isPhone && (
      <div
        className="glass-panel"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: 4,
          borderRadius: 12,
          pointerEvents: 'auto'
        }}
      >
        <button
          className={`glass-button ${activeGizmoMode === 'move' ? 'active' : ''}`}
          onClick={() => setGizmoMode('move')}
        >
          <Move size={18} />
          <span>Move</span>
        </button>

        <button
          className={`glass-button ${activeGizmoMode === 'resize' ? 'active' : ''}`}
          onClick={() => setGizmoMode('resize')}
        >
          <Scaling size={18} />
          <span>Grab Resize</span>
        </button>

        <button
          className={`glass-button ${activeGizmoMode === 'rotate' ? 'active' : ''}`}
          onClick={() => setGizmoMode('rotate')}
        >
          <RotateCw size={18} />
          <span>Rotate</span>
        </button>
      </div>
      )}

      {/* Right section: Magnet Snap, Floor Toggle, Cut List & Export */}
      {!isPhone && (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, pointerEvents: 'auto' }}>
        {/* Floor Toggle Button */}
        <button
          className={`glass-panel glass-button ${currentProject?.showFloor ? 'active' : ''}`}
          onClick={toggleFloor}
          title="Toggle Transparent Floor Barrier"
        >
          <Grid size={18} />
          <span>Floor</span>
        </button>

        {/* Magnet Snap Toggle Button */}
        <button
          className={`glass-panel glass-button ${currentProject?.snapSettings.enabled ? 'active' : ''}`}
          onClick={() => {
            if (currentProject) {
              updateSnapSettings({ enabled: !currentProject.snapSettings.enabled });
            }
          }}
          title="Toggle 3D Magnetization & Surface Snapping"
        >
          <Magnet size={18} />
          <span>Magnet</span>
        </button>

        <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.15)', margin: '0 4px' }} />

        {/* Cut List Table */}
        <button
          className="glass-panel glass-button"
          onClick={onOpenCutList}
          title="View Bill of Materials & Cut List"
        >
          <Layers size={18} color="#e09f3e" />
          <span>Cut List</span>
        </button>

        {/* Export & Share Dropdown */}
        <div style={{ position: 'relative' }}>
          <button
            className="glass-panel glass-button"
            onClick={() => setShowExportMenu(!showExportMenu)}
          >
            <Download size={18} />
            <span>Share & Export</span>
          </button>

          {showExportMenu && (
            <div
              className="glass-panel"
              style={{
                position: 'absolute',
                top: 50,
                right: 0,
                width: 220,
                padding: 8,
                borderRadius: 12,
                display: 'flex',
                flexDirection: 'column',
                gap: 4
              }}
            >
              <button
                className="glass-button"
                style={{ justifyContent: 'flex-start', width: '100%', fontSize: 13 }}
                onClick={() => {
                  setShowExportMenu(false);
                  if (currentProject) exportCutListCSV(currentProject);
                }}
              >
                <FileSpreadsheet size={16} />
                <span>Export CSV Cut List</span>
              </button>

              <button
                className="glass-button"
                style={{ justifyContent: 'flex-start', width: '100%', fontSize: 13 }}
                onClick={handleCapturePNG}
              >
                <Camera size={16} />
                <span>Snapshot Image (PNG)</span>
              </button>

              <button
                className="glass-button"
                style={{ justifyContent: 'flex-start', width: '100%', fontSize: 13 }}
                onClick={handleExportJSON}
              >
                <FileCode size={16} />
                <span>Export Project (.json)</span>
              </button>

              <button
                className="glass-button"
                style={{ justifyContent: 'flex-start', width: '100%', fontSize: 13 }}
                onClick={handleCopyJSON}
              >
                {copiedNotification ? <Check size={16} color="#10b981" /> : <Share2 size={16} />}
                <span>{copiedNotification ? 'Copied to Clipboard!' : 'Copy JSON Blueprint'}</span>
              </button>
            </div>
          )}
        </div>
      </div>
      )}
    </header>
  );
};

