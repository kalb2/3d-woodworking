import React from 'react';
import { Ellipsis, Home } from 'lucide-react';
import { useProjectStore } from '../../state/useProjectStore';
import { useAppStore } from '../../state/useAppStore';
import { fireReliableTap, useReliableTap } from '../../utils/reliableTap';
import { EditorOverflowList } from './EditorOverflow';

interface IPadHeaderProps {
  onOpenCutList: () => void;
  onShareProject: () => void;
}

export const IPadHeader: React.FC<IPadHeaderProps> = ({
  onOpenCutList,
  onShareProject,
}) => {
  const { activeProjectId, projects, setUnit } = useProjectStore();
  const { setView, overlays, openOverlay, setOverlayOpen } = useAppStore();
  const currentProject = projects.find((project) => project.id === activeProjectId);
  const unit = currentProject?.unit ?? 'in';

  const cycleUnit = () => {
    const order = ['in', 'cm', 'mm', 'ft'] as const;
    const next = order[(order.indexOf(unit as typeof order[number]) + 1) % order.length] ?? 'in';
    setUnit(next);
  };

  const toggleMore = () => {
    if (overlays.menu) setOverlayOpen('menu', false);
    else openOverlay('menu', true);
  };
  const cycleUnits = useReliableTap(cycleUnit);
  const more = useReliableTap(toggleMore);

  return (
    <header className="editor-header editor-topbar">
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
        <span style={{ fontWeight: 600 }}>Home</span>
      </button>

      <div className="editor-topbar-title" data-testid="editor-project-title">
        <span className="editor-topbar-name" data-testid="editor-project-name">
          {currentProject?.name || 'My Project'}
        </span>
        <button
          type="button"
          className="phone-header-unit"
          onClick={cycleUnits}
          onPointerUp={cycleUnits}
          aria-label={`Units: ${unit}. Tap to change`}
          title="Change units"
          data-testid="editor-project-units"
        >
          {unit}
        </button>
      </div>

      <div className="editor-topbar-more">
        <button
          type="button"
          className="glass-panel glass-button editor-more-btn"
          onClick={more}
          onPointerUp={more}
          title="More"
          aria-label="More"
          aria-expanded={overlays.menu}
          data-testid="editor-overflow"
        >
          <Ellipsis size={18} />
        </button>
        {overlays.menu && (
          <div className="editor-overflow glass-panel" data-testid="overlay-menu">
            <EditorOverflowList
              onOpenCutList={onOpenCutList}
              onShareProject={onShareProject}
              onClose={() => setOverlayOpen('menu', false)}
            />
          </div>
        )}
      </div>
    </header>
  );
};
