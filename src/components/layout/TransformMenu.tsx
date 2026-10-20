import React from 'react';
import { stretchBox } from '../../utils/groupStretch';
import { Move, RotateCw, Scaling, Copy, Trash2, Plus } from 'lucide-react';
import { useProjectStore } from '../../state/useProjectStore';
import { useAppStore } from '../../state/useAppStore';
import { useIsPhone } from '../../hooks/useIsPhone';
import { fireReliableTap, useReliableTap } from '../../utils/reliableTap';
import { ResizeSizeRow, RotateAngleRow } from './SizeBar';
import { FloatingLeft } from './FloatingLeft';

export const TransformMenu: React.FC = () => {
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

  const project = projects.find((item) => item.id === activeProjectId);
  const selected = project?.objects.find((item) => item.id === selectedObjectId);
  // Groups and multi-selections resize by stretching, unless turned (wall-fitted built-ins) or scanned.
  const noResize = (selected?.shape === 'group' || selectedObjectIds.length > 1)
    && !(project && stretchBox(project.objects, selectedObjectIds.length > 1 ? selectedObjectIds : [selected!.id]));

  const openOverlay = useAppStore((state) => state.openOverlay);
  const setSidebarPanel = useAppStore((state) => state.setSidebarPanel);
  const isPhone = useIsPhone();
  const tap = (action: () => void) => (event: React.SyntheticEvent) => fireReliableTap(event, action);
  const canEditSelection = Boolean(selected);
  const duplicateSelection = useReliableTap(() => {
    if (selected) duplicateSelected();
  });
  const deleteSelection = useReliableTap(() => {
    if (selected) deleteSelected();
  });
  const addPart = useReliableTap(() => {
    setSidebarPanel('shapes');
    openOverlay('sidebar');
  });

  if (isPhone) return null;

  return (
    <>
    <FloatingLeft placement="ipad" />
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
      {!noResize && (
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
      )}
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
      {canEditSelection && (<>
      <button
        type="button"
        className="is-duplicate"
        data-testid="toolbar-duplicate"
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
        onClick={deleteSelection}
        onPointerUp={deleteSelection}
      >
        <Trash2 size={18} />
        <span>Delete</span>
      </button>
      </>)}
      </div>
    </div>
    </>
  );
};
