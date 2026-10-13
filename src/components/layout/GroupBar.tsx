import React from 'react';
import { ChevronRight } from 'lucide-react';
import { useProjectStore } from '../../state/useProjectStore';
import { useBuiltInFlow } from '../../builtins/useBuiltInFlow';
import { findBuiltInTemplate } from '../../builtins/builtIns';
import { pathTo } from '../../state/groupTree';
import { useReliableTap } from '../../utils/reliableTap';
import type { FurnitureObject } from '../../types/furniture';

const groupLabel = (g: FurnitureObject) => (g.builtIn ? findBuiltInTemplate(g.builtIn.template)?.name ?? g.name : g.name);

const Btn: React.FC<{ label: string; onTap: () => void; tone?: 'primary' | 'danger'; testId: string }> = ({ label, onTap, tone, testId }) => {
  const tap = useReliableTap(onTap);
  return (
    <button type="button" className={`group-bar-btn${tone ? ` is-${tone}` : ''}`} data-testid={testId} onClick={tap} onPointerUp={tap}>
      {label}
    </button>
  );
};

const Crumb: React.FC<{ label: string; onTap: () => void }> = ({ label, onTap }) => {
  const tap = useReliableTap(onTap);
  return (
    <button type="button" className="group-crumb" onClick={tap} onPointerUp={tap}>
      <span>{label}</span> <ChevronRight size={14} />
    </button>
  );
};

/**
 * Top-of-canvas group context: breadcrumb for the opened group path, and one
 * contextual, labeled bar for the selection (group, multi-select, select mode).
 */
export const GroupBar: React.FC = () => {
  const s = useProjectStore();
  const flowOpen = useBuiltInFlow((f) => Boolean(f.mode || f.focusWallId));
  const project = s.projects.find((p) => p.id === s.activeProjectId);
  if (!project || flowOpen) return null;
  const byId = new Map(project.objects.map((o) => [o.id, o]));
  const path = pathTo(project.objects, s.editingGroupId).map((id) => byId.get(id)).filter(Boolean) as FurnitureObject[];
  const count = s.selectedObjectIds.length;
  const selected = s.selectedObjectId ? byId.get(s.selectedObjectId) : undefined;

  let bar: React.ReactNode = null;
  if (s.multiSelect) {
    bar = (
      <div className="group-bar" data-testid="select-bar">
        <span className="group-bar-label">{count ? `${count} selected` : 'Drag to select'}</span>
        {count >= 2 && <Btn label="Group" testId="select-group" tone="primary" onTap={s.groupSelected} />}
        {count > 0 && <Btn label="Duplicate" testId="select-duplicate" onTap={s.duplicateSelected} />}
        {count > 0 && <Btn label="Delete" testId="select-delete" tone="danger" onTap={s.deleteSelected} />}
        <Btn label="Done" testId="select-done" onTap={s.toggleMultiSelect} />
      </div>
    );
  } else if (count >= 2) {
    bar = (
      <div className="group-bar" data-testid="multi-bar">
        <span className="group-bar-label">{count} selected</span>
        <Btn label="Group" testId="multi-group" tone="primary" onTap={s.groupSelected} />
        <Btn label="Clear" testId="multi-clear" onTap={() => s.selectObject(null)} />
      </div>
    );
  } else if (selected?.shape === 'group') {
    bar = (
      <div className="group-bar" data-testid="group-bar">
        <span className="group-bar-label">{groupLabel(selected)}</span>
        <Btn label="Open" testId="group-open" tone="primary" onTap={() => s.enterGroup(selected.id)} />
        <Btn label="Ungroup" testId="group-ungroup" onTap={() => s.ungroup(selected.id)} />
      </div>
    );
  }

  if (!path.length && !bar) return null;
  return (
    <div className="group-top">
      {path.length > 0 && (
        <div className="group-crumbs" data-testid="group-breadcrumb">
          {/* Tapping a crumb leaves that group (jumps to its parent level). */}
          {path.map((g) => <Crumb key={g.id} label={groupLabel(g)} onTap={() => s.setGroupContext(g.parentId ?? null)} />)}
        </div>
      )}
      {bar}
    </div>
  );
};
