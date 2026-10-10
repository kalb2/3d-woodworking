import React, { useEffect, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Minus, Plus, Trash2 } from 'lucide-react';
import type { BoardHole } from '../../types/furniture';
import { useProjectStore } from '../../state/useProjectStore';
import { clampHole, getHoles, holesUpdate, useHoleFocus } from '../../utils/holes';
import { unitScale } from '../../utils/units';

const clean = (v: number) => String(Math.round(v * 100) / 100);
const STEP = 0.125;

/** Number that commits on blur/Enter (one undo step), not per keystroke. */
const CommitField: React.FC<{ value: number; scale: number; onCommit: (inches: number) => void; label: string; min?: number; testId?: string }> = ({ value, scale, onCommit, label, min, testId }) => {
  const [draft, setDraft] = useState(clean(value * scale));
  useEffect(() => { setDraft(clean(value * scale)); }, [value, scale]);
  const commit = () => {
    const n = parseFloat(draft);
    if (Number.isNaN(n) || (min !== undefined && n < min)) { setDraft(clean(value * scale)); return; }
    if (Math.abs(n / scale - value) > 1e-6) onCommit(n / scale);
  };
  return (
    <input className="hole-bar-input" type="number" inputMode="decimal" aria-label={label} data-testid={testId} value={draft}
      onChange={(e) => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
  );
};

/** Bottom bar shown in hole mode. Dragging on the part moves the hole. */
export const HoleModeBar: React.FC = () => {
  const { editing, objectId, holeId, exit } = useHoleFocus();
  const project = useProjectStore((s) => s.projects.find((p) => p.id === s.activeProjectId));
  const updateObject = useProjectStore((s) => s.updateObject);
  const [more, setMore] = useState(false);
  const object = project?.objects.find((o) => o.id === objectId);
  const hole = object ? getHoles(object).find((h) => h.id === holeId) : undefined;
  useEffect(() => { if (editing && (!object || !hole)) exit(); }, [editing, object, hole, exit]);
  if (!editing || !object || !hole || !project) return null;

  const unit = project.unit;
  const scale = unitScale(unit);
  const kind = hole.kind ?? 'round';
  const rect = kind === 'rect';
  const notch = kind === 'notch';
  const patch = (p: Partial<BoardHole>) => {
    const holes = getHoles(object).map((h) => (h.id === hole.id ? clampHole(object.dimensions, { ...h, ...p }) : h));
    updateObject(object.id, holesUpdate(object, holes));
  };
  const setSize = (v: number) => {
    const size = Math.max(0.0625, v);
    if (notch) {
      // Keep the notch's proportions as it grows/shrinks.
      const ratio = (hole.height ?? hole.diameter / 2) / hole.diameter;
      patch({ diameter: size, height: Math.max(0.0625, size * ratio) });
    } else {
      patch(rect && (hole.height ?? hole.diameter) === hole.diameter ? { diameter: size, height: size } : { diameter: size });
    }
  };
  const remove = () => {
    updateObject(object.id, holesUpdate(object, getHoles(object).filter((h) => h.id !== hole.id)));
    exit();
  };

  return (
    <div className="hole-mode-bar" data-testid="hole-mode-bar">
      <div className="hole-bar-row">
        <div className="hole-bar-size">
          <button type="button" aria-label="Smaller" onClick={() => setSize(hole.diameter - STEP)}><Minus size={14} /></button>
          <CommitField value={hole.diameter} scale={scale} onCommit={setSize} label="Size" min={0} testId="hole-size" />
          <span className="hole-bar-size-label">{unit}</span>
          <button type="button" aria-label="Larger" onClick={() => setSize(hole.diameter + STEP)}><Plus size={14} /></button>
        </div>
        <button type="button" className={`hole-bar-btn${more ? ' is-on' : ''}`} onClick={() => setMore((v) => !v)} data-testid="hole-more">
          More {more ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
        <button type="button" className="hole-bar-btn is-danger" aria-label="Delete" onClick={remove} data-testid="hole-delete"><Trash2 size={14} /></button>
        <button type="button" className="hole-bar-btn is-primary" onClick={exit} data-testid="hole-done"><Check size={14} /> Done</button>
      </div>
      {more && (
        <div className="hole-bar-more" data-testid="hole-more-panel">
          <div className="hole-bar-row">
            <div className="hole-seg">
              <button type="button" className={kind === 'round' ? 'is-on' : ''} onClick={() => patch({ kind: 'round', height: undefined, edge: undefined })}>Round</button>
              <button type="button" className={rect ? 'is-on' : ''} onClick={() => patch({ kind: 'rect', height: hole.diameter, edge: undefined })}>Square</button>
              <button type="button" className={notch ? 'is-on' : ''} onClick={() => patch({ kind: 'notch', height: hole.diameter / 2 })}>Notch</button>
            </div>
            <div className="hole-seg">
              <button type="button" className={hole.depth === undefined ? 'is-on' : ''} onClick={() => patch({ depth: undefined })}>Thru</button>
              <button type="button" className={hole.depth !== undefined ? 'is-on' : ''} onClick={() => { if (hole.depth === undefined) patch({ depth: 0.5 }); }}>Depth</button>
            </div>
            {hole.depth !== undefined && (
              <CommitField value={hole.depth} scale={scale} onCommit={(v) => patch({ depth: Math.max(0.0625, v) })} label="Depth" min={0} />
            )}
          </div>
          <div className="hole-bar-row hole-bar-exact">
            <label>X <CommitField value={hole.x} scale={scale} onCommit={(v) => patch({ x: v })} label="X offset" /></label>
            <label>Y <CommitField value={hole.z} scale={scale} onCommit={(v) => patch({ z: v })} label="Y offset" /></label>
            {(rect || notch) && <>
              <label>{notch ? 'Width' : 'W'} <CommitField value={hole.diameter} scale={scale} onCommit={(v) => patch({ diameter: Math.max(0.0625, v) })} label="Width" min={0} /></label>
              <label>{notch ? 'Depth in' : 'H'} <CommitField value={hole.height ?? hole.diameter} scale={scale} onCommit={(v) => patch({ height: Math.max(0.0625, v) })} label={notch ? 'Notch depth' : 'Height'} min={0} /></label>
            </>}
          </div>
        </div>
      )}
    </div>
  );
};
