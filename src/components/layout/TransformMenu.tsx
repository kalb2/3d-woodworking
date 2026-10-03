import React from 'react';
import { Move, RotateCw, Scaling, Group, Ungroup, Pencil, Check } from 'lucide-react';
import { useProjectStore } from '../../state/useProjectStore';
import { fireReliableTap } from '../../utils/reliableTap';

export const TransformMenu: React.FC = () => {
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
  } = useProjectStore();

  const project = projects.find((item) => item.id === activeProjectId);
  const selected = project?.objects.find((item) => item.id === selectedObjectId);
  const groupId = selected?.shape === 'group' ? selected.id : editingGroupId;

  const tap = (action: () => void) => (event: React.SyntheticEvent) => fireReliableTap(event, action);

  return (
    <div className="transform-menu" data-testid="transform-menu" role="toolbar" aria-label="Move, resize, and rotate">
      <button
        type="button"
        className={activeGizmoMode === 'move' ? 'is-active' : ''}
        data-testid="overlay-launch-tools"
        onClick={tap(() => setGizmoMode('move'))}
        onPointerUp={tap(() => setGizmoMode('move'))}
      >
        <Move size={18} />
        <span>Move</span>
      </button>
      <button
        type="button"
        className={activeGizmoMode === 'resize' ? 'is-active' : ''}
        data-testid="tool-resize"
        onClick={tap(() => setGizmoMode('resize'))}
        onPointerUp={tap(() => setGizmoMode('resize'))}
      >
        <Scaling size={18} />
        <span>Resize</span>
      </button>
      <button
        type="button"
        className={activeGizmoMode === 'rotate' ? 'is-active' : ''}
        data-testid="tool-rotate"
        onClick={tap(() => setGizmoMode('rotate'))}
        onPointerUp={tap(() => setGizmoMode('rotate'))}
      >
        <RotateCw size={18} />
        <span>Rotate</span>
      </button>
      {selectedObjectIds.length >= 2 && (
        <button
          type="button"
          data-testid="transform-group"
          onClick={tap(() => groupSelected())}
          onPointerUp={tap(() => groupSelected())}
        >
          <Group size={18} />
          <span>Group</span>
        </button>
      )}
      {groupId && selected?.shape === 'group' && !editingGroupId && (
        <>
          <button
            type="button"
            data-testid="transform-edit-group"
            onClick={tap(() => enterGroup(groupId))}
            onPointerUp={tap(() => enterGroup(groupId))}
          >
            <Pencil size={18} />
            <span>Edit parts</span>
          </button>
          <button
            type="button"
            data-testid="transform-ungroup"
            onClick={tap(() => ungroup(groupId))}
            onPointerUp={tap(() => ungroup(groupId))}
          >
            <Ungroup size={18} />
            <span>Ungroup</span>
          </button>
        </>
      )}
      {editingGroupId && (
        <button
          type="button"
          className="is-active"
          data-testid="transform-done-group"
          onClick={tap(() => exitGroup())}
          onPointerUp={tap(() => exitGroup())}
        >
          <Check size={18} />
          <span>Done</span>
        </button>
      )}
    </div>
  );
};
