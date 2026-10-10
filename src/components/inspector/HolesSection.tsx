import React from 'react';
import { Minus, Plus, X } from 'lucide-react';
import type { BoardHole, FurnitureObject, HoleFace } from '../../types/furniture';
import { useProjectStore } from '../../state/useProjectStore';
import { getHoles, holesUpdate, newHole, useHoleFocus } from '../../utils/holes';

const clean = (v: number) => String(Math.round(v * 100) / 100);
const STEP_IN = 0.25;

const NumField: React.FC<{ label: string; value: number; scale: number; onChange: (inches: number) => void; step?: boolean; min?: number; onFocus: () => void }> = ({ label, value, scale, onChange, step, min, onFocus }) => (
  <label className="hole-field">
    <span>{label}</span>
    <span className="hole-field-input">
      {step && <button type="button" aria-label={`${label} down`} onClick={() => onChange(value - STEP_IN)}><Minus size={12} /></button>}
      <input type="number" inputMode="decimal" value={clean(value * scale)} onFocus={onFocus}
        onChange={(e) => {
          const n = parseFloat(e.target.value);
          if (Number.isNaN(n) || (min !== undefined && n < min)) return;
          onChange(n / scale);
        }} />
      {step && <button type="button" aria-label={`${label} up`} onClick={() => onChange(value + STEP_IN)}><Plus size={12} /></button>}
    </span>
  </label>
);

/** Holes on a box/board: collapsed to one "+ Add hole" until there is one. */
export const HolesSection: React.FC<{ object: FurnitureObject; unit: string; scale: number }> = ({ object, unit, scale }) => {
  const updateObject = useProjectStore((s) => s.updateObject);
  const focus = useHoleFocus();
  const holes = getHoles(object);
  const write = (next: BoardHole[]) => updateObject(object.id, holesUpdate(object, next));
  const patch = (id: string, p: Partial<BoardHole>) => write(holes.map((h) => (h.id === id ? { ...h, ...p } : h)));
  const add = () => {
    const h = newHole(object);
    write([...holes, h]);
    focus.set(object.id, h.id);
  };
  const remove = (id: string) => {
    write(holes.filter((h) => h.id !== id));
    if (focus.holeId === id) focus.set(null, null);
  };

  return (
    <div className="holes-section" data-testid="holes-section">
      {holes.length > 0 && <span className="part-properties-kicker">Holes ({unit})</span>}
      {holes.map((h, i) => {
        const onFocus = () => focus.set(object.id, h.id);
        const rect = (h.kind ?? 'round') === 'rect';
        const through = h.depth === undefined;
        return (
          <div key={h.id} className={`hole-row${focus.holeId === h.id ? ' is-focused' : ''}`} data-testid="hole-row" onPointerDown={onFocus}>
            <div className="hole-row-head">
              <span className="hole-row-title">Hole {i + 1}</span>
              <div className="hole-seg">
                {(['round', 'rect'] as const).map((k) => (
                  <button key={k} type="button" className={(h.kind ?? 'round') === k ? 'is-on' : ''} onClick={() => patch(h.id, { kind: k, height: k === 'rect' ? (h.height ?? h.diameter) : undefined })}>
                    {k === 'round' ? 'Round' : 'Rect'}
                  </button>
                ))}
              </div>
              <div className="hole-seg">
                {(['top', 'front', 'side'] as HoleFace[]).map((f) => (
                  <button key={f} type="button" className={(h.face ?? 'top') === f ? 'is-on' : ''} onClick={() => patch(h.id, { face: f, x: 0, z: 0 })}>
                    {f[0].toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
              <button type="button" className="hole-remove" aria-label={`Delete hole ${i + 1}`} data-testid="hole-delete" onClick={() => remove(h.id)}><X size={14} /></button>
            </div>
            <div className="hole-row-fields">
              <NumField label={rect ? 'W' : 'Ø'} value={h.diameter} scale={scale} min={0} onFocus={onFocus} onChange={(v) => patch(h.id, { diameter: Math.max(0.05, v) })} />
              {rect && <NumField label="H" value={h.height ?? h.diameter} scale={scale} min={0} onFocus={onFocus} onChange={(v) => patch(h.id, { height: Math.max(0.05, v) })} />}
              <NumField label="X" value={h.x} scale={scale} step onFocus={onFocus} onChange={(v) => patch(h.id, { x: v })} />
              <NumField label="Y" value={h.z} scale={scale} step onFocus={onFocus} onChange={(v) => patch(h.id, { z: v })} />
              <label className="hole-field">
                <span>Depth</span>
                <span className="hole-field-input">
                  {through
                    ? <button type="button" className="hole-thru" onClick={() => { onFocus(); patch(h.id, { depth: 0.5 }); }}>Thru</button>
                    : <>
                        <input type="number" inputMode="decimal" value={clean(h.depth! * scale)} onFocus={onFocus}
                          onChange={(e) => { const n = parseFloat(e.target.value); if (!Number.isNaN(n) && n > 0) patch(h.id, { depth: n / scale }); }} />
                        <button type="button" aria-label="Make through" onClick={() => patch(h.id, { depth: undefined })}><X size={12} /></button>
                      </>}
                </span>
              </label>
            </div>
          </div>
        );
      })}
      <button type="button" className="hole-add" data-testid="hole-add" onClick={add}>+ Add hole</button>
    </div>
  );
};
