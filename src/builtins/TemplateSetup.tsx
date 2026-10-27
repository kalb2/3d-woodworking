import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useProjectStore } from '../state/useProjectStore';
import { useReliableTap } from '../utils/reliableTap';
import { LengthField } from '../components/ui/LengthField';
import { cameraTarget } from '../templates/userTemplates';
import { buildModule, normalizeModuleInput, type ModuleField, type ModuleId } from '../generators/modules';
import type { BuiltInTemplateId, FurnitureObject, LengthUnit, RoomWall } from '../types/furniture';
import { builtInModified, findBuiltInTemplate } from './builtIns';
import { useBuiltInFlow } from './useBuiltInFlow';

type Values = Record<string, number | string>;


const Btn: React.FC<{ label: string; onTap: () => void; testId: string; tone?: 'primary' | 'plain'; ariaLabel?: string; className?: string }> = ({ label, onTap, testId, tone = 'plain', ariaLabel, className }) => {
  const tap = useReliableTap(onTap);
  return (
    <button type="button" data-testid={testId} aria-label={ariaLabel} onClick={tap} onPointerUp={tap}
      className={`joint-btn is-${tone}${className ? ` ${className}` : ''}`}>{label}</button>
  );
};

const Choice: React.FC<{ label: string; on: boolean; testId: string; onTap: () => void }> = ({ label, on, testId, onTap }) => {
  const tap = useReliableTap(onTap);
  return (
    <button type="button" className={`tpl-chip${on ? ' is-on' : ''}`} aria-pressed={on} data-testid={testId} onClick={tap} onPointerUp={tap}>{label}</button>
  );
};

/** − n + for whole-number counts. The − / + hide at the ends of the range instead of greying out. */
export const Stepper: React.FC<{ label: string; value: number; min: number; max: number; testId: string; onChange: (n: number) => void }> = ({ label, value, min, max, testId, onChange }) => {
  const less = useReliableTap(() => onChange(Math.max(min, value - 1)));
  const more = useReliableTap(() => onChange(Math.min(max, value + 1)));
  const word = label.toLowerCase();
  return (
    <span className="tpl-stepper" role="group" aria-label={label} data-testid={testId}>
      <button type="button" className="tpl-step" aria-label={`Fewer ${word}`} data-testid={`${testId}-less`} onClick={less} onPointerUp={less}
        style={value <= min ? { visibility: 'hidden' } : undefined}>−</button>
      <span className="tpl-step-value" data-testid={`${testId}-value`}>{value}</span>
      <button type="button" className="tpl-step" aria-label={`More ${word}`} data-testid={`${testId}-more`} onClick={more} onPointerUp={more}
        style={value >= max ? { visibility: 'hidden' } : undefined}>+</button>
    </span>
  );
};

const LenInput: React.FC<{ label: string; inches: number; min?: number; max?: number; unit: LengthUnit; testId: string; onCommit: (inches: number) => void }> = ({ label, inches, min, max, unit, testId, onCommit }) => {
  return (
    <span className="tpl-len">
      <LengthField className="props-input is-number" testId={testId} aria-label={label} inches={inches} unit={unit}
        min={min ?? 0} max={max} onCommit={onCommit} />
    </span>
  );
};

const FieldRow: React.FC<{ f: ModuleField; values: Values; unit: LengthUnit; set: (k: string, v: number | string) => void }> = ({ f, values, unit, set }) => {
  const v = values[f.key];
  if (f.kind === 'choice') {
    return (
      <div className="props-row tpl-choice-row">
        <span className="props-label">{f.label}</span>
        <span className="tpl-chips" role="group" aria-label={f.label}>
          {f.options!.map((o) => <Choice key={o.value} label={o.label} on={v === o.value} testId={`tpl-${f.key}-${o.value}`} onTap={() => set(f.key, o.value)} />)}
        </span>
      </div>
    );
  }
  return (
    <div className="props-row">
      <span className="props-label">{f.label}</span>
      <span className="props-value">
        {f.count
          ? <Stepper label={f.label} value={Number(v)} min={f.min ?? 0} max={f.max ?? 99} testId={`tpl-${f.key}`} onChange={(n) => set(f.key, n)} />
          : <LenInput label={f.label} inches={Number(v)} min={f.min} max={f.max} unit={unit} testId={`tpl-${f.key}`} onCommit={(n) => set(f.key, n)} />}
      </span>
    </div>
  );
};

/**
 * Compact setup for a modular template: size first (prefilled to standard
 * sizes), the counts that matter, and the rest under More options. Editing a
 * placed one rebuilds it in place; hand changes get one plain-words warning.
 */
export const TemplateSetup: React.FC<{ templateId: BuiltInTemplateId; wall?: RoomWall; existing?: FurnitureObject; onDone: () => void }> = ({ templateId, wall, existing, onDone }) => {
  const insertBuiltIn = useProjectStore((s) => s.insertBuiltIn);
  const project = useProjectStore((s) => s.projects.find((p) => p.id === s.activeProjectId));
  const unit = project?.unit ?? 'in';
  const t = findBuiltInTemplate(templateId)!;
  const [values, setValues] = useState<Values>(() => normalizeModuleInput(templateId as ModuleId, { ...(existing?.builtIn?.input ?? { v: 2 }) }));
  const [more, setMore] = useState(false);
  const [warn, setWarn] = useState(false);
  const set = (k: string, v: number | string) => { setValues((cur) => normalizeModuleInput(templateId as ModuleId, { ...cur, [k]: v })); setWarn(false); };
  const built = useMemo(() => buildModule(templateId as ModuleId, values), [templateId, values]);
  const boards = built.parts.length;
  const main = t.fields!.filter((f) => !f.advanced);
  const extra = t.fields!.filter((f) => f.advanced);

  const build = () => {
    const { wallWidth: _w, ...input } = values;
    void _w;
    const ok = insertBuiltIn({ template: templateId, input, wallId: wall?.id, center: existing?.builtIn?.center, editId: existing?.builtIn?.id,
      at: existing ? undefined : { x: cameraTarget.x, z: cameraTarget.z } });
    if (!ok) return;
    if (!existing) {
      // Frame the new piece so it is all in view.
      const g = useProjectStore.getState().projects.find((p) => p.id === useProjectStore.getState().activeProjectId)?.objects.find((o) => o.id === ok);
      if (g) useBuiltInFlow.getState().requestFocus(g.position, Math.hypot(g.dimensions.length, g.dimensions.height, g.dimensions.width) / 2);
    }
    onDone();
  };
  const primary = () => {
    if (existing && project && builtInModified(project.objects, project.joints ?? [], project.scannedRoom, existing.id)) { setWarn(true); return; }
    build();
  };
  const toggleMore = useReliableTap(() => setMore((m) => !m));

  return (
    <div className="tpl-setup" data-testid="module-form">
      <section className="props-section">
        <h3 className="props-kicker">Size</h3>
        <div className="props-card">{main.filter((f) => f.kind === 'number' && !f.count).map((f) => <FieldRow key={f.key} f={f} values={values} unit={unit} set={set} />)}</div>
      </section>
      {main.some((f) => f.kind === 'choice' || f.count) && (
        <section className="props-section">
          <h3 className="props-kicker">Layout</h3>
          <div className="props-card">{main.filter((f) => f.kind === 'choice' || f.count).map((f) => <FieldRow key={f.key} f={f} values={values} unit={unit} set={set} />)}</div>
        </section>
      )}
      <section className="props-section">
        <button type="button" className="tpl-more" data-testid="tpl-more" aria-expanded={more} onClick={toggleMore} onPointerUp={toggleMore}>
          {more ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
          <span>More options</span>
          {!more && <span className="tpl-more-hint">{extra.map((f) => f.label.toLowerCase()).slice(0, 3).join(', ')}…</span>}
        </button>
        {more && <div className="props-card" data-testid="tpl-more-options">{extra.map((f) => <FieldRow key={f.key} f={f} values={values} unit={unit} set={set} />)}</div>}
      </section>
      <span className="tpl-summary" data-testid="tpl-summary">
        {boards} boards · {built.joints.filter((j) => j.type !== 'butt').length} joints{wall ? ' · lines up with other cabinets on this wall, skips windows and doors' : ''}
      </span>
      {warn ? (
        <div className="tpl-warn" role="alert" data-testid="tpl-warn">
          <span>Rebuilding will replace your manual changes to these boards.</span>
          <div className="joint-actions">
            <Btn label="Cancel" testId="tpl-warn-cancel" onTap={() => setWarn(false)} />
            <Btn label="Rebuild" testId="tpl-rebuild" tone="primary" onTap={build} />
          </div>
        </div>
      ) : (
        <Btn label={existing ? 'Update' : `Add ${t.name.toLowerCase()}`} testId="mod-generate" tone="primary" className="is-wide" onTap={primary} />
      )}
    </div>
  );
};
