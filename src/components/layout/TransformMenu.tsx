import React from 'react';
import { Move, RotateCw, Scaling, Group, Ungroup, Pencil, Check, Copy, Trash2, Plus } from 'lucide-react';
import { useProjectStore } from '../../state/useProjectStore';
import { useAppStore } from '../../state/useAppStore';
import { useIsPhone } from '../../hooks/useIsPhone';
import { fireReliableTap, useReliableTap } from '../../utils/reliableTap';
import { ResizeSizeRow, RotateAngleRow } from './SizeBar';
import { UndoRedoButtons } from './UndoRedoButtons';

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
    duplicateObject,
    deleteObject,
  } = useProjectStore();

  const project = projects.find((item) => item.id === activeProjectId);
  const selected = project?.objects.find((item) => item.id === selectedObjectId);
  const groupId = selected?.shape === 'group' ? selected.id : editingGroupId;

  const openOverlay = useAppStore((state) => state.openOverlay);
  const setSidebarPanel = useAppStore((state) => state.setSidebarPanel);
  const isPhone = useIsPhone();
  const tap = (action: () => void) => (event: React.SyntheticEvent) => fireReliableTap(event, action);
  const canEditSelection = Boolean(selected);
  const duplicateSelection = useReliableTap(() => {
    if (selected) duplicateObject(selected.id);
  });
  const deleteSelection = useReliableTap(() => {
    if (selected) deleteObject(selected.id);
  });
  const addPart = useReliableTap(() => {
    setSidebarPanel('shapes');
    openOverlay('sidebar');
  });

  if (isPhone) return null;

  return (
    <>
    <UndoRedoButtons placement="ipad" />
    <button type="button" className="add-fab is-ipad" data-testid="toolbar-add" aria-label="Add" title="Add" onClick={addPart} onPointerUp={addPart}>
      <Plus size={24} strokeWidth={2.2} />
    </button>
    <div className="transform-menu" data-testid="transform-menu" role="toolbar" aria-label="Move, resize, and rotate">
      <ResizeSizeRow />
      <RotateAngleRow />
      <div className="transform-menu-icons">
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
      <button
        type="button"
        className="is-duplicate"
        data-testid="toolbar-duplicate"
        disabled={!canEditSelection}
        onClick={duplicateSelection}
        onPointerUp={duplicateSelection}
      >
        <Copy size={18} />
        <span>Duplicate</span>
      </button>
      <button
        type="button"
        className="is-delete"
        data-testid="toolbar-delete"
        disabled={!canEditSelection}
        onClick={deleteSelection}
        onPointerUp={deleteSelection}
      >
        <Trash2 size={18} />
        <span>Delete</span>
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
    </div>
    </>
  );
};
