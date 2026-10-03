import React from 'react';
import { useProjectStore } from '../../state/useProjectStore';
import { unitScale } from '../../utils/units';
import type { Dimensions3D, LengthUnit } from '../../types/furniture';
import { GIZMO_AXIS } from '../../theme/gizmo';

const ROWS: { key: keyof Dimensions3D; color: string; testId: string }[] = [
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

/** Colored length / height / width sliders. Shown for resize, not painted on the mesh. */
export const SizeBar: React.FC = () => {
  const {
    projects,
    activeProjectId,
    selectedObjectId,
    activeGizmoMode,
    showDimensions,
    updateObject,
    pushHistoryState,
    saveCurrentProject,
  } = useProjectStore();

  const project = projects.find((item) => item.id === activeProjectId);
  const object = project?.objects.find((item) => item.id === selectedObjectId);
  const visible = activeGizmoMode === 'resize' || showDimensions;
  if (!project || !object || !visible || object.shape === 'group') return null;

  const scale = unitScale(project.unit);

  const commit = () => {
    pushHistoryState();
    saveCurrentProject();
  };

  return (
    <div className="size-bar" data-testid="size-bar" role="group" aria-label="Part size">
      {ROWS.map((row) => {
        const inches = object.dimensions[row.key];
        const display = inches * scale;
        const maxInches = Math.max(96, inches * 2, 12);
        const minDisplay = 0.125 * scale;
        const maxDisplay = maxInches * scale;
        const step = project.unit === 'mm' ? 1 : project.unit === 'ft' ? 0.01 : 0.1;
        return (
          <label key={row.key} className="size-bar-row">
            <span className="size-bar-swatch" style={{ background: row.color }} />
            <span className="size-bar-value" style={{ color: row.color }} data-testid={row.testId}>
              {formatSize(inches, project.unit)}
            </span>
            <input
              type="range"
              min={minDisplay}
              max={Math.max(maxDisplay, display)}
              step={step}
              value={display}
              aria-label={`${row.key} in ${project.unit}`}
              style={{ accentColor: row.color }}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (!Number.isFinite(next)) return;
                updateObject(object.id, {
                  dimensions: {
                    ...object.dimensions,
                    [row.key]: Math.max(next / scale, 0.05),
                  },
                }, true);
              }}
              onPointerUp={commit}
              onKeyUp={commit}
            />
          </label>
        );
      })}
    </div>
  );
};
