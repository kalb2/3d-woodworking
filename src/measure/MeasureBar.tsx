import React from 'react';
import { useProjectStore } from '../state/useProjectStore';
import { useReliableTap } from '../utils/reliableTap';
import { formatLength, measureDistance, measureHint } from '../utils/measure';
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
  const hint = measureHint(m.a, m.b, m.hover, unit);
  const done = Boolean(m.a && m.b);
  return (
    <div className="group-top">
      <div className={`measure-card${done ? ' is-result' : ''}`} data-testid="measure-bar" role="status" aria-live="polite">
        <div className="measure-card-text">
          <span className="measure-step" data-testid="measure-step">{hint.step}</span>
          <span className="measure-title" data-testid="measure-label">{hint.title}</span>
          <span className="measure-detail" data-testid="measure-detail">{hint.detail}</span>
        </div>
        <div className="measure-actions">
          {done && <Btn label="Pin it" tone="primary" testId="measure-pin" onTap={() => { addMeasurement(m.a!, m.b!); m.reset(); }} />}
          {done && <Btn label="Measure again" testId="measure-again" onTap={m.reset} />}
          <Btn label="Done" testId="measure-done" onTap={m.stop} />
        </div>
      </div>
      {m.showTip && (
        <div className="measure-tip" data-testid="measure-tip">
          <span>Tap a point, or touch and slide to aim: the ring rides above your finger so you can see it. It snaps to corners, edges and faces, or the floor grid. Lift to place. Two fingers move the view.</span>
          <Btn label="Got it" testId="measure-tip-ok" onTap={m.dismissTip} />
        </div>
      )}
    </div>
  );
};

/** While aiming with a finger: a ring where the point is, joined to the finger by a short line. */
export const MeasureAimGuide: React.FC = () => {
  const aim = useMeasure((m) => (m.active ? m.aim : null));
  if (!aim) return null;
  const h = Math.max(0, aim.fy - aim.y);
  return (
    <div className="measure-aim" data-testid="measure-aim" aria-hidden="true">
      <div className="measure-aim-line" style={{ left: aim.x, top: aim.y, height: h }} />
      <div className="measure-aim-ring" style={{ left: aim.x, top: aim.y }} />
      <div className="measure-aim-finger" style={{ left: aim.fx, top: aim.fy }} />
    </div>
  );
};
