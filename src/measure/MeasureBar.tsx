import React from 'react';
import { useProjectStore } from '../state/useProjectStore';
import { useReliableTap } from '../utils/reliableTap';
import { formatLength, measureDistance, measureStepText } from '../utils/measure';
import { useMeasure } from './useMeasure';

const Btn: React.FC<{ label: string; onTap: () => void; tone?: 'primary' | 'danger'; testId: string }> = ({ label, onTap, tone, testId }) => {
  const tap = useReliableTap(onTap);
  return (
    <button type="button" className={`group-bar-btn${tone ? ` is-${tone}` : ''}`} data-testid={testId} onClick={tap} onPointerUp={tap}>{label}</button>
  );
};


/** Top bar for the tape measure, or for a selected pinned dimension. */
export const MeasureBar: React.FC = () => {
  const m = useMeasure();
  const project = useProjectStore((s) => s.projects.find((p) => p.id === s.activeProjectId));
  const addMeasurement = useProjectStore((s) => s.addMeasurement);
  const removeMeasurement = useProjectStore((s) => s.removeMeasurement);
  const unit = project?.unit ?? 'in';
  const pinned = m.selectedId ? project?.measurements?.find((d) => d.id === m.selectedId) : undefined;

  if (!m.active && pinned) {
    return (
      <div className="group-top"><div className="group-bar" data-testid="dim-bar">
        <span className="group-bar-label">Dimension · {formatLength(measureDistance(pinned.a, pinned.b), unit)}</span>
        <Btn label="Delete" tone="danger" testId="dim-delete" onTap={() => { removeMeasurement(pinned.id); m.select(null); }} />
        <Btn label="Close" testId="dim-close" onTap={() => m.select(null)} />
      </div></div>
    );
  }
  if (!m.active) return null;
  return (
    <div className="group-top">
      <div className="group-bar" data-testid="measure-bar">
        <span className="group-bar-label" data-testid="measure-label">{measureStepText(m.a, m.b, unit)}</span>
        {m.a && m.b && <Btn label="Pin" tone="primary" testId="measure-pin" onTap={() => { addMeasurement(m.a!, m.b!); m.reset(); }} />}
        {m.a && m.b && <Btn label="Measure again" testId="measure-again" onTap={m.reset} />}
        <Btn label="Done" testId="measure-done" onTap={m.stop} />
      </div>
      {m.showTip && (
        <div className="measure-tip" data-testid="measure-tip">
          <span>Touch and slide to place a point. It snaps to corners, edge middles and face centers, or the floor grid. Lift to place. Two fingers move the view.</span>
          <Btn label="Got it" testId="measure-tip-ok" onTap={m.dismissTip} />
        </div>
      )}
    </div>
  );
};
