import React, { useState } from 'react';
import { Info, Link2, RotateCcw, Unlink2 } from 'lucide-react';
import { useProjectStore } from '../../state/useProjectStore';
import { unitScale } from '../../utils/units';
import type { Dimensions3D, LengthUnit } from '../../types/furniture';
import { GIZMO_AXIS } from '../../theme/gizmo';
import { NumberField } from '../ui/NumberField';

const AXES: { key: keyof Dimensions3D; color: string; testId: string }[] = [
  { key: 'length', color: GIZMO_AXIS.x, testId: 'size-x' },
  { key: 'height', color: GIZMO_AXIS.y, testId: 'size-y' },
  { key: 'width', color: GIZMO_AXIS.z, testId: 'size-z' },
];

function formatSize(inches: number, unit: LengthUnit) {
  const value = inches * unitScale(unit);
  if (unit === 'mm') return String(Math.round(value));
  if (unit === 'ft') return value.toFixed(2);
  // Clean inches/cm: 44, 44.25, 0.75 (no trailing zeros).
  return String(Math.round(value * 100) / 100);
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

/** Full-height track. The native range thumb is a few pixels tall and loses the touch to the canvas. */
const FloorDistanceSlider: React.FC<{
  display: number;
  maxDisplay: number;
  step: number;
  unit: LengthUnit;
  onChange: (display: number) => void;
  onCommit: () => void;
}> = ({ display, maxDisplay, step, unit, onChange, onCommit }) => {
  const fraction = maxDisplay > 0 ? Math.min(1, Math.max(0, display / maxDisplay)) : 0;

  const valueFromPointer = (clientX: number, track: HTMLElement) => {
    const rect = track.getBoundingClientRect();
    const width = rect.width || 1;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / width));
    const raw = ratio * maxDisplay;
    const stepped = step > 0 ? Math.round(raw / step) * step : raw;
    return Math.min(maxDisplay, Math.max(0, stepped));
  };

  const drag = (event: React.PointerEvent<HTMLDivElement>) => {
    onChange(valueFromPointer(event.clientX, event.currentTarget));
  };

  return (
    <div
      className="floor-distance-slider"
      data-testid="floor-distance-drag"
      role="slider"
      aria-valuemin={0}
      aria-valuemax={maxDisplay}
      aria-valuenow={display}
      aria-label={`Drag distance from the floor in ${unit}`}
      onPointerDown={(event) => {
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag(event);
      }}
      onPointerMove={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        drag(event);
      }}
      onPointerUp={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        onCommit();
      }}
      onPointerCancel={onCommit}
    >
      <div className="floor-distance-track" />
      <div className="floor-distance-thumb" style={{ left: `${fraction * 100}%` }} />
    </div>
  );
};

/** Distance from the floor while Move is active. Drag or type to raise the part. */
export const MoveFloorRow: React.FC = () => {
  const { project, object, activeGizmoMode, updateObject, pushHistoryState, saveCurrentProject } = useSelectedPart();
  if (activeGizmoMode !== 'move' || !project || !object) return null;

  const scale = unitScale(project.unit);
  const gapInches = Math.max(object.position.y - object.dimensions.height / 2, 0);
  const step = project.unit === 'mm' ? 1 : project.unit === 'ft' ? 0.01 : 0.1;
  const display = gapInches * scale;
  const maxDisplay = Math.max(96, gapInches + 24) * scale;

  const write = (displayValue: number) => {
    if (!Number.isFinite(displayValue)) return;
    const inches = Math.max(displayValue / scale, 0);
    updateObject(object.id, {
      position: { ...object.position, y: inches + object.dimensions.height / 2 },
    }, true);
  };

  const commit = () => commitSize(pushHistoryState, saveCurrentProject);

  return (
    <div className="size-inline floor-distance" data-testid="floor-distance" role="group" aria-label="Distance from the floor">
      <span className="floor-distance-label">Floor</span>
      <NumberField
        className="size-figure"
        testId="floor-distance-input"
        min={0}
        aria-label={`Distance from the floor in ${project.unit}`}
        style={{ color: GIZMO_AXIS.y, borderBottomColor: GIZMO_AXIS.y }}
        value={display}
        format={() => formatSize(gapInches, project.unit)}
        onCommit={(n) => {
          write(n);
          commit();
        }}
      />
      <FloorDistanceSlider
        display={display}
        maxDisplay={maxDisplay}
        step={step}
        unit={project.unit}
        onChange={(next) => write(next)}
        onCommit={() => commitSize(pushHistoryState, saveCurrentProject)}
      />
    </div>
  );
};

/** One underlined number per axis, in the same bar as the transform tools. */
export const ResizeSizeRow: React.FC = () => {
  const { project, object, activeGizmoMode, updateObject, pushHistoryState, saveCurrentProject } = useSelectedPart();
  const [linked, setLinked] = useState(false);
  if (activeGizmoMode !== 'resize' || !project || !object || object.shape === 'group') return null;

  const scale = unitScale(project.unit);

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
        <NumberField
          key={axis.key}
          className="size-figure"
          testId={axis.testId}
          min={0.05 * scale}
          aria-label={`${axis.key} in ${project.unit}`}
          style={{ color: axis.color, borderBottomColor: axis.color }}
          value={object.dimensions[axis.key] * scale}
          format={() => formatSize(object.dimensions[axis.key], project.unit)}
          onCommit={(n) => {
            write(axis.key, n);
            commitSize(pushHistoryState, saveCurrentProject);
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
const TURN_AXES = ROTATION_AXES.map((a) => ({ key: a.key, color: a.color, label: a.key.toUpperCase(), aria: `Turn 90° around ${a.key.toUpperCase()}` }));

/**
 * "Turn 90°" row: one tap = +90° about that axis, through the selection's center.
 * Built from the same column parts as the degree fields above so X/Y/Z line up.
 */
export const TurnNinetyRow: React.FC = () => {
  const turn = useProjectStore((s) => s.turnSelection90);
  return (
    <div className="size-inline turn90" data-testid="turn90" role="group" aria-label="Turn 90 degrees">
      <span className="turn90-cols">
        {TURN_AXES.map((a) => (
          <button key={a.key} type="button" className="rotate-angle turn90-btn" data-testid={`turn90-${a.key}`} aria-label={a.aria} onClick={() => turn(a.key)}>
            <span className="rotate-angle-dot" aria-hidden="true" style={{ visibility: 'hidden' }} />
            <span className="size-figure turn90-figure" style={{ color: a.color, borderColor: a.color }}>90°</span>
            <span className="rotate-degree-mark" aria-hidden="true" style={{ visibility: 'hidden' }}>°</span>
          </button>
        ))}
      </span>
      <span className="size-link" aria-hidden="true" style={{ visibility: 'hidden' }} />
    </div>
  );
};

export const RotateAngleRow: React.FC = () => {
  const { object, activeGizmoMode, selectedObjectIds, updateObject, pushHistoryState, saveCurrentProject } = useSelectedPart();
  if (activeGizmoMode !== 'rotate' || !object) return null;
  // Groups and multi-selections get only the 90° turns (no per-part angle fields).
  if (object.shape === 'group' || selectedObjectIds.length > 1) return <TurnNinetyRow />;

  const commit = () => commitSize(pushHistoryState, saveCurrentProject);

  return (
    <>
    <div className="size-inline" data-testid="angle-bar" role="group" aria-label="Rotation in degrees">
      {ROTATION_AXES.map((axis) => (
        <label key={axis.key} className="rotate-angle">
          <span className="rotate-angle-dot" style={{ background: axis.color }} />
          <NumberField
            className="size-figure"
            testId={axis.testId}
            integer
            aria-label={`${axis.label} in degrees`}
            style={{ color: axis.color, borderBottomColor: axis.color }}
            value={object.rotation[axis.key]}
            format={formatDegrees}
            onCommit={(n) => {
              writeRotation(object.id, object.rotation, axis.key, n, updateObject);
              commit();
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
      <TurnNinetyRow />
    </>
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

  return (
    <div className="rotate-readout" data-testid="angle-pill" style={{ borderColor: color }}>
      <NumberField
        ref={inputRef}
        testId="angle-pill-input"
        integer
        aria-label={`${axis.toUpperCase()} rotation in degrees`}
        value={degrees}
        format={formatDegrees}
        onPointerDown={(event) => event.stopPropagation()}
        onCommit={(n) => {
          onChange(n);
          onCommit();
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

