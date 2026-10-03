import React, { useState } from 'react';
import { Info, Link2, RotateCcw, Unlink2 } from 'lucide-react';
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

const ROTATION_AXES: { key: 'x' | 'y' | 'z'; color: string; testId: string; label: string }[] = [
  { key: 'x', color: GIZMO_AXIS.x, testId: 'angle-x', label: 'X rotation' },
  { key: 'y', color: GIZMO_AXIS.y, testId: 'angle-y', label: 'Y rotation' },
  { key: 'z', color: GIZMO_AXIS.z, testId: 'angle-z', label: 'Z rotation' },
];

export function formatDegrees(value: number) {
  if (!Number.isFinite(value)) return '0';
  return String(Math.round(value));
}

function writeRotation(
  objectId: string,
  rotation: { x: number; y: number; z: number },
  key: 'x' | 'y' | 'z',
  degrees: number,
  updateObject: (id: string, patch: { rotation: { x: number; y: number; z: number } }, silent?: boolean) => void,
) {
  if (!Number.isFinite(degrees)) return;
  updateObject(objectId, { rotation: { ...rotation, [key]: degrees } }, true);
}

/** Red, green, and blue degree fields in the same bar as the transform tools. */
export const RotateAngleRow: React.FC = () => {
  const { object, activeGizmoMode, updateObject, pushHistoryState, saveCurrentProject } = useSelectedPart();
  const [drafts, setDrafts] = useState<Partial<Record<'x' | 'y' | 'z', string>>>({});
  if (activeGizmoMode !== 'rotate' || !object || object.shape === 'group') return null;

  const commit = () => {
    setDrafts({});
    commitSize(pushHistoryState, saveCurrentProject);
  };

  return (
    <div className="size-inline" data-testid="angle-bar" role="group" aria-label="Rotation in degrees">
      {ROTATION_AXES.map((axis) => (
        <label key={axis.key} className="rotate-angle">
          <span className="rotate-angle-dot" style={{ background: axis.color }} />
          <input
            className="size-figure"
            data-testid={axis.testId}
            type="number"
            inputMode="numeric"
            step={1}
            aria-label={`${axis.label} in degrees`}
            style={{ color: axis.color, borderBottomColor: axis.color }}
            value={drafts[axis.key] ?? formatDegrees(object.rotation[axis.key])}
            onFocus={() => setDrafts((current) => ({ ...current, [axis.key]: formatDegrees(object.rotation[axis.key]) }))}
            onChange={(event) => {
              const text = event.target.value;
              setDrafts((current) => ({ ...current, [axis.key]: text }));
              writeRotation(object.id, object.rotation, axis.key, Number(text), updateObject);
            }}
            onBlur={commit}
            onKeyUp={(event) => {
              if (event.key === 'Enter') commit();
            }}
          />
          <span className="rotate-degree-mark" aria-hidden="true">°</span>
        </label>
      ))}
      <button
        type="button"
        className="size-link"
        data-testid="angle-reset"
        aria-label="Reset rotation"
        onClick={() => {
          updateObject(object.id, { rotation: { x: 0, y: 0, z: 0 } }, true);
          commitSize(pushHistoryState, saveCurrentProject);
        }}
      >
        <RotateCcw size={16} />
      </button>
    </div>
  );
};

/** Live degree pill beside the ring being dragged. The number and info mark both edit that axis. */
export const RotateDegreePill: React.FC<{
  axis: 'x' | 'y' | 'z';
  degrees: number;
  onChange: (degrees: number) => void;
  onCommit: () => void;
}> = ({ axis, degrees, onChange, onCommit }) => {
  const color = GIZMO_AXIS[axis];
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <div className="rotate-readout" data-testid="angle-pill" style={{ borderColor: color }}>
      <input
        ref={inputRef}
        data-testid="angle-pill-input"
        type="number"
        inputMode="numeric"
        step={1}
        aria-label={`${axis.toUpperCase()} rotation in degrees`}
        value={draft ?? formatDegrees(degrees)}
        onPointerDown={(event) => event.stopPropagation()}
        onFocus={() => setDraft(formatDegrees(degrees))}
        onChange={(event) => {
          const text = event.target.value;
          setDraft(text);
          const next = Number(text);
          if (Number.isFinite(next)) onChange(next);
        }}
        onBlur={() => {
          setDraft(null);
          onCommit();
        }}
        onKeyUp={(event) => {
          if (event.key === 'Enter') {
            inputRef.current?.blur();
          }
        }}
      />
      <span className="rotate-readout-diamond" style={{ background: color }} />
      <button
        type="button"
        className="rotate-readout-edit"
        data-testid="angle-pill-edit"
        aria-label="Edit degrees"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => inputRef.current?.focus()}
      >
        <Info size={14} />
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
