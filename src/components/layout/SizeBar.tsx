import React, { useState } from 'react';
import { Link2, Unlink2 } from 'lucide-react';
import { useProjectStore } from '../../state/useProjectStore';
import { unitScale } from '../../utils/units';
import type { Dimensions3D, LengthUnit } from '../../types/furniture';
import { GIZMO_AXIS } from '../../theme/gizmo';

const AXES: { key: keyof Dimensions3D; color: string; testId: string }[] = [
  { key: 'length', color: GIZMO_AXIS.x, testId: 'size-x' },
  { key: 'height', color: GIZMO_AXIS.y, testId: 'size-y' },
  { key: 'width', color: GIZMO_AXIS.z, testId: 'size-z' },
];

function formatSize(inches: number, unit: LengthUnit) {
  const value = inches * unitScale(unit);
  if (unit === 'mm') return String(Math.round(value));
  if (unit === 'ft') return value.toFixed(2);
  return value.toFixed(1);
}

function useSelectedPart() {
  const store = useProjectStore();
  const project = store.projects.find((item) => item.id === store.activeProjectId);
  const object = project?.objects.find((item) => item.id === store.selectedObjectId);
  return { ...store, project, object };
}

function commitSize(pushHistoryState: () => void, saveCurrentProject: () => void) {
  pushHistoryState();
  saveCurrentProject();
}

/** One underlined number per axis, in the same bar as the transform tools. */
export const ResizeSizeRow: React.FC = () => {
  const { project, object, activeGizmoMode, updateObject, pushHistoryState, saveCurrentProject } = useSelectedPart();
  const [linked, setLinked] = useState(false);
  if (activeGizmoMode !== 'resize' || !project || !object || object.shape === 'group') return null;

  const scale = unitScale(project.unit);
  const step = project.unit === 'mm' ? 1 : project.unit === 'ft' ? 0.01 : 0.1;

  const write = (key: keyof Dimensions3D, display: number) => {
    if (!Number.isFinite(display)) return;
    const inches = Math.max(display / scale, 0.05);
    const current = object.dimensions[key];
    let dimensions: Dimensions3D = { ...object.dimensions, [key]: inches };
    if (linked && current > 0.01) {
      const ratio = inches / current;
      dimensions = {
        length: Math.max(object.dimensions.length * ratio, 0.05),
        height: Math.max(object.dimensions.height * ratio, 0.05),
        width: Math.max(object.dimensions.width * ratio, 0.05),
      };
      dimensions[key] = inches;
    }
    updateObject(object.id, { dimensions }, true);
  };

  return (
    <div className="size-inline" data-testid="size-bar" role="group" aria-label="Part size">
      {AXES.map((axis) => (
        <input
          key={axis.key}
          className="size-figure"
          data-testid={axis.testId}
          type="number"
          inputMode="decimal"
          step={step}
          min={0.05 * scale}
          aria-label={`${axis.key} in ${project.unit}`}
          style={{ color: axis.color, borderBottomColor: axis.color }}
          value={formatSize(object.dimensions[axis.key], project.unit)}
          onChange={(event) => write(axis.key, Number(event.target.value))}
          onBlur={() => commitSize(pushHistoryState, saveCurrentProject)}
          onKeyUp={(event) => {
            if (event.key === 'Enter') commitSize(pushHistoryState, saveCurrentProject);
          }}
        />
      ))}
      <button
        type="button"
        className={`size-link${linked ? ' is-on' : ''}`}
        data-testid="size-link"
        aria-pressed={linked}
        aria-label={linked ? 'Unlock proportions' : 'Lock proportions'}
        onClick={() => setLinked((value) => !value)}
      >
        {linked ? <Link2 size={16} /> : <Unlink2 size={16} />}
      </button>
    </div>
  );
};

/** Small bottom-left length readout used while moving. Not a second sheet. */
export const MoveSizeNudge: React.FC<{ placement?: 'dock' | 'canvas' }> = ({ placement = 'dock' }) => {
  const { project, object, activeGizmoMode, updateObject, pushHistoryState, saveCurrentProject } = useSelectedPart();
  if (activeGizmoMode !== 'move' || !project || !object || object.shape === 'group') return null;

  const scale = unitScale(project.unit);
  const display = object.dimensions.length * scale;
  const step = project.unit === 'mm' ? 1 : project.unit === 'ft' ? 0.01 : 0.1;
  const maxDisplay = Math.max(96, object.dimensions.length * 2, 12) * scale;

  return (
    <label className={`size-nudge${placement === 'canvas' ? ' is-canvas' : ''}`} data-testid="size-move">
      <span className="size-figure size-figure-read" style={{ color: GIZMO_AXIS.x }}>
        {formatSize(object.dimensions.length, project.unit)}
      </span>
      <input
        type="range"
        min={0.125 * scale}
        max={Math.max(maxDisplay, display)}
        step={step}
        value={display}
        aria-label={`Length in ${project.unit}`}
        style={{ accentColor: GIZMO_AXIS.x }}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (!Number.isFinite(next)) return;
          updateObject(object.id, {
            dimensions: { ...object.dimensions, length: Math.max(next / scale, 0.05) },
          }, true);
        }}
        onPointerUp={() => commitSize(pushHistoryState, saveCurrentProject)}
        onKeyUp={() => commitSize(pushHistoryState, saveCurrentProject)}
      />
    </label>
  );
};
