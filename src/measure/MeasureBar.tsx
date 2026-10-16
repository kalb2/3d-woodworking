import React from 'react';
import { useProjectStore } from '../state/useProjectStore';
import { useReliableTap } from '../utils/reliableTap';
import { formatLength, measureDistance } from '../utils/measure';
import { useMeasure } from './useMeasure';

const Btn: React.FC<{ label: string; onTap: () => void; tone?: 'primary' | 'danger'; testId: string }> = ({ label, onTap, tone, testId }) => {
  const tap = useReliableTap(onTap);
  return (
    <button type="button" className={`group-bar-btn${tone ? ` is-${tone}` : ''}`} data-testid={testId} onClick={tap} onPointerUp={tap}>{label}</button>
  );
};

const KIND: Record<string, string> = { vertex: 'corner', midpoint: 'edge middle', face: 'face center', surface: 'surface' };

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
  const label = !m.a ? 'Measure · tap a point' : !m.b ? `From ${KIND[m.a.kind]} · tap a second point` : `${formatLength(measureDistance(m.a, m.b), unit)}`;
  return (
    <div className="group-top"><div className="group-bar" data-testid="measure-bar">
      <span className="group-bar-label" data-testid="measure-label">{label}</span>
      {m.a && m.b && <Btn label="Pin" tone="primary" testId="measure-pin" onTap={() => { addMeasurement(m.a!, m.b!); m.reset(); }} />}
      <Btn label="Done" testId="measure-done" onTap={m.stop} />
    </div></div>
  );
};
