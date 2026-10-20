import React, { useState } from 'react';
import { useProjectStore } from '../state/useProjectStore';
import { useReliableTap } from '../utils/reliableTap';
import { NumberField, cleanNumber } from '../components/ui/NumberField';
import { Row, Section, Seg, SwitchRow } from '../components/properties/rows';
import { unitScale } from '../utils/units';
import { formatLength } from '../utils/measure';
import type { ButtFasten, FurnitureObject, FurnitureProject, Joint, JointType, LengthUnit } from '../types/furniture';
import { useJoinFlow, type JoinView } from './useJoinFlow';
import {
  DEFAULT_SCREW_LENGTH, JOINT_LABEL, JOINT_TYPES, buttKind, contactOn, defaultDepth, defaultSetback, dowelDiameter, dowelLength,
  groovable, hardwareSpots, jointGeometry, otherEdgePosition, pairContact, reseatPosition, shiftAlong,
} from './joints';
import { fitCheck, type FitResult } from './fitCheck';
import { JointDiagram } from './JointDiagram';

/** Joint sizes are shown in inches for in/ft projects, else the metric unit. */
const fieldUnit = (u: LengthUnit): LengthUnit => (u === 'ft' ? 'in' : u);
const SHORT_LABEL: Record<JointType, string> = { butt: 'Butt', dado: 'Dado', rabbet: 'Rabbet', pocket: 'Pocket', dowel: 'Dowels' };

const Btn: React.FC<{ label: string; onTap: () => void; testId: string; tone?: 'primary' | 'danger' | 'plain'; active?: boolean; style?: React.CSSProperties }> = ({ label, onTap, testId, tone = 'plain', active, style }) => {
  const tap = useReliableTap(onTap);
  return (
    <button type="button" data-testid={testId} aria-pressed={active} onClick={tap} onPointerUp={tap}
      className={`joint-btn is-${tone}${active ? ' is-on' : ''}`} style={style}>{label}</button>
  );
};

/** Length input: fractions in inches, plain numbers in metric. Commits on blur / Done. */
const LenField: React.FC<{ label: string; value: number; unit: LengthUnit; testId: string; min?: number; onCommit: (inches: number) => void; onPreview?: (inches: number | null) => void }> = ({ label, value, unit, testId, min = 0.01, onCommit, onPreview }) => {
  const fu = fieldUnit(unit), k = unitScale(fu), imperial = fu === 'in';
  return (
    <Row label={label}>
      <NumberField className="props-input is-number" testId={testId} aria-label={label} fractions={imperial} min={min * k}
        value={value * k} format={() => (imperial ? formatLength(value, 'in').replace(/ in$/, '"') : `${cleanNumber(value * k, 1)}`)}
        onCommit={(n) => onCommit(n / k)} onPreview={onPreview ? (n) => onPreview(n === null ? null : n / k) : undefined} />
      {!imperial && <span className="props-unit">{fu}</span>}
    </Row>
  );
};

const CountField: React.FC<{ value: number; testId: string; onCommit: (n: number) => void }> = ({ value, testId, onCommit }) => (
  <Row label="How many">
    <NumberField className="props-input is-number" testId={testId} aria-label="How many" integer min={1} max={40} value={value} onCommit={onCommit} />
  </Row>
);

export const FitLine: React.FC<{ fit: FitResult }> = ({ fit }) => (
  <div className={`joint-fit is-${fit.status}`} data-testid="joint-fit" role="status">
    <span className="joint-dot" aria-hidden="true" />
    <span>{fit.message}</span>
  </div>
);

export const fitWord = (fit: FitResult) => (fit.status === 'fits' ? 'Fits' : fit.status === 'broken' ? 'Broken' : 'Check');

/** Edge names across the cut, in plain words. */
const EDGE_NAMES: Record<'x' | 'y' | 'z', [string, string]> = { x: ['Left', 'Right'], y: ['Bottom', 'Top'], z: ['Back', 'Front'] };

/** Everything about one saved joint: fit check, live cross-section, the sizes that matter for its type. */
const JointEditor: React.FC<{ project: FurnitureProject; joint: Joint; onDone: () => void }> = ({ project, joint: j, onDone }) => {
  const st = useProjectStore.getState();
  const byId = new Map(project.objects.map((o) => [o.id, o]));
  const R = byId.get(j.receiverId), M = byId.get(j.materId);
  const unit = project.unit;
  const [preview, setPreview] = useState<Partial<Joint>>({});
  const seated = j.extended > 0;
  const save = (patch: Partial<Joint>, seat = seated) => {
    const next = { ...j, ...patch };
    const { extended: _e, ...rest } = next;
    void _e;
    st.saveJoint(rest, (next.type === 'dado' || next.type === 'rabbet') && seat);
    setPreview({});
  };
  const removeTap = () => { st.removeJoint(j.id); onDone(); };
  if (!R || !M) {
    return (
      <div className="joint-editor" data-testid="joint-editor">
        <FitLine fit={fitCheck(j, R, M, unit)} />
        <Btn label="Remove joint" testId="join-remove" tone="danger" onTap={removeTap} />
      </div>
    );
  }
  const fit = fitCheck(j, R, M, unit);
  const g = jointGeometry(j, R, M);
  const draft = { ...j, ...preview };
  const grooved = j.type === 'dado' || j.type === 'rabbet';
  const canGroove = groovable(R, j.face);
  const types = JOINT_TYPES.filter((t) => canGroove || (t !== 'dado' && t !== 'rabbet') || t === j.type);
  const reseat = fit.status === 'broken' ? reseatPosition(j, R, M) : null;
  const span = g ? g.L.lMax - g.L.lMin : 0;
  const n = g && (j.type === 'pocket' || j.type === 'dowel') ? hardwareSpots(j, g.L).length : 0;
  const prev = (key: keyof Joint) => (v: number | null) => setPreview((p) => ({ ...p, [key]: v ?? undefined }));
  const edgeNames = g ? EDGE_NAMES[g.L.t] : EDGE_NAMES.x;

  return (
    <div className="joint-editor" data-testid="joint-editor">
      <FitLine fit={fit} />
      {fit.status === 'broken' && (
        <div className="joint-actions">
          {reseat && <Btn label="Re-seat" testId="joint-reseat" tone="primary" onTap={() => st.updateObject(M.id, { position: reseat })} />}
          <Btn label="Remove joint" testId="join-remove-broken" tone="danger" onTap={removeTap} />
        </div>
      )}
      {g && <JointDiagram joint={draft} R={R} M={M} unit={unit} seated={grooved && seated} />}

      {g && (
        <Section title="Joint" testId="joint-type-section">
          <div className="props-row joint-type-row">
            <Seg label="Joint type" testId="joint-type" value={j.type} options={types.map((t) => ({ id: t, label: SHORT_LABEL[t] }))}
              onChange={(t) => save({ type: t, depth: t === 'dado' || t === 'rabbet' ? (grooved ? j.depth : defaultDepth(R, j.face)) : j.depth }, t === 'dado' || t === 'rabbet' ? (grooved ? seated : true) : false)} />
          </div>
          {!canGroove && <p className="props-note" data-testid="join-no-groove">These boards meet {buttKind(R, j.face) === 'end' ? 'end to end' : 'edge to edge'}, so there is no face for a dado or rabbet.</p>}
        </Section>
      )}

      {g && grooved && (
        <Section title={`${j.type === 'dado' ? 'Dado' : 'Rabbet'} in ${R.name}`} testId="joint-groove">
          <LenField label="Width" unit={unit} testId="joint-width" value={g.grooveWidth} onCommit={(w) => save({ width: Math.abs(w - g.matThick) < 1e-6 ? undefined : w })} onPreview={prev('width')} />
          <LenField label="Depth" unit={unit} testId="joint-depth" value={j.depth} min={0.03} onCommit={(d) => save({ depth: Math.max(0.03, d) })} onPreview={prev('depth')} />
          {j.type === 'dado' ? (
            <LenField label={`From ${edgeNames[0].toLowerCase()} end`} unit={unit} testId="joint-offset" value={g.offset} min={0}
              onCommit={(o) => st.updateObject(M.id, { position: shiftAlong(R, M, g.L.t, o - g.offset) })} />
          ) : (
            <Row label="Edge">
              <Seg label="Edge" testId="joint-edge" value={g.edge === 'start' ? 'start' : 'end'}
                options={[{ id: 'start', label: edgeNames[0] }, { id: 'end', label: edgeNames[1] }]}
                onChange={(e) => {
                  if ((e === 'start') === (g.edge === 'start')) return;
                  const p = otherEdgePosition(j, R, M);
                  if (p) st.updateObject(M.id, { position: p });
                }} />
            </Row>
          )}
          <SwitchRow label={`Seat ${M.name} in it`} on={seated} testId="joint-seat" onToggle={() => save({}, !seated)} />
        </Section>
      )}

      {g && j.type === 'pocket' && (
        <Section title={`Pocket screws in ${M.name}`} testId="joint-pocket">
          <CountField value={n} testId="joint-count" onCommit={(c) => save({ count: c })} />
          <LenField label="From the ends" unit={unit} testId="joint-setback" value={j.setback ?? defaultSetback(span)} min={0} onCommit={(s) => save({ setback: s })} />
          <LenField label="Screw length" unit={unit} testId="joint-screw" value={j.screwLength ?? DEFAULT_SCREW_LENGTH} onCommit={(s) => save({ screwLength: s })} onPreview={prev('screwLength')} />
        </Section>
      )}

      {g && j.type === 'dowel' && (
        <Section title="Dowels" testId="joint-dowel">
          <LenField label="Diameter" unit={unit} testId="joint-diameter" value={dowelDiameter(j)} onCommit={(d) => save({ diameter: d })} onPreview={prev('diameter')} />
          <LenField label="Length" unit={unit} testId="joint-length" value={dowelLength(j)} onCommit={(l) => save({ length: l })} onPreview={prev('length')} />
          <CountField value={n} testId="joint-count" onCommit={(c) => save({ count: c })} />
          <LenField label="From the ends" unit={unit} testId="joint-setback" value={j.setback ?? defaultSetback(span)} min={0} onCommit={(s) => save({ setback: s })} />
        </Section>
      )}

      {g && j.type === 'butt' && (
        <Section title="Butt joint" testId="joint-butt">
          <Row label="Cuts"><span className="props-readout">None, the boards just meet</span></Row>
          <Row label="Held with">
            <Seg<ButtFasten> label="Held with" testId="joint-fasten" value={j.fasten ?? 'glue'}
              options={[{ id: 'glue', label: 'Glue' }, { id: 'screws', label: 'Screws' }, { id: 'glue-screws', label: 'Both' }, { id: 'none', label: 'None' }]}
              onChange={(f) => save({ fasten: f })} />
          </Row>
        </Section>
      )}

      {fit.status !== 'broken' && <Btn label="Remove joint" testId="join-remove" tone="danger" onTap={removeTap} />}
    </div>
  );
};

/** Pick a joint for two touching boards; the editor opens right after. */
const NewJoint: React.FC<{ project: FurnitureProject; a: string; b: string }> = ({ project, a, b }) => {
  const byId = new Map(project.objects.map((o) => [o.id, o]));
  const pair = pairContact(byId.get(a), byId.get(b));
  const [type, setType] = useState<JointType>('butt');
  const [side, setSide] = useState(pair ? { receiverId: pair.receiver.id, materId: pair.mater.id, face: pair.face } : null);
  const R = side ? byId.get(side.receiverId) : undefined, M = side ? byId.get(side.materId) : undefined;
  const add = useReliableTap(() => {
    if (!R || !M || !side) return;
    const grooved = type === 'dado' || type === 'rabbet';
    const id = useProjectStore.getState().saveJoint({ type, ...side, depth: defaultDepth(R, side.face) }, grooved);
    if (id) useJoinFlow.getState().edit(id);
  });
  if (!pair || !R || !M || !side) return <p style={{ margin: 0 }}>These parts need to touch, square to each other.</p>;
  const here = groovable(R, side.face);
  const flip = contactOn(M, R);
  const swapped = !here && Boolean(flip && groovable(M, flip.face));
  const canGroove = here || swapped;
  const pick = (t: JointType) => {
    if ((t === 'dado' || t === 'rabbet') && swapped && flip) setSide({ receiverId: M.id, materId: R.id, face: flip.face });
    setType(t);
  };
  const types = JOINT_TYPES.filter((t) => canGroove || (t !== 'dado' && t !== 'rabbet'));
  const cutIn = type === 'pocket' ? M : R;
  return (
    <div data-testid="join-form" className="joint-editor">
      <div role="group" aria-label="Joint type" className="joint-type-grid">
        {types.map((t) => <Btn key={t} label={JOINT_LABEL[t]} testId={`join-type-${t}`} active={type === t} onTap={() => pick(t)} />)}
      </div>
      {!canGroove && (
        <p className="props-note" data-testid="join-no-groove">
          These boards meet {buttKind(R, side.face) === 'end' ? 'end to end' : 'edge to edge'}, so there is no face to cut a dado or rabbet into. Use a butt joint, pocket screws, or dowels.
        </p>
      )}
      <p className="props-note" data-testid="join-where">
        {type === 'butt' && `${M.name} meets ${R.name}. No cuts.`}
        {(type === 'dado' || type === 'rabbet') && `${type === 'dado' ? 'Groove' : 'Rabbet'} in ${R.name}; ${M.name} sits in it.`}
        {type === 'pocket' && `Pocket holes in ${cutIn.name} (hidden face), screwed into ${R.name}.`}
        {type === 'dowel' && `Dowels between ${M.name} and ${R.name}.`}
        {' '}You can adjust sizes next.
      </p>
      <button type="button" className="joint-btn is-primary is-wide" data-testid="join-save" onClick={add} onPointerUp={add}>Add joint</button>
    </div>
  );
};

/** Rows of joints with a status dot + word; tap opens the editor. */
export const JointRows: React.FC<{ project: FurnitureProject; joints: Joint[]; partId?: string; back?: JoinView; onOpen?: () => void }> = ({ project, joints, partId, back, onOpen }) => {
  const byId = new Map(project.objects.map((o) => [o.id, o]));
  return (
    <>
      {joints.map((j) => <JointRow key={j.id} j={j} byId={byId} unit={project.unit} partId={partId} back={back} onOpen={onOpen} />)}
    </>
  );
};

const JointRow: React.FC<{ j: Joint; byId: Map<string, FurnitureObject>; unit: LengthUnit; partId?: string; back?: JoinView; onOpen?: () => void }> = ({ j, byId, unit, partId, back, onOpen }) => {
  const R = byId.get(j.receiverId), M = byId.get(j.materId);
  const fit = fitCheck(j, R, M, unit);
  const name = partId ? (j.receiverId === partId ? M : R)?.name ?? 'missing part' : `${R?.name ?? '?'} + ${M?.name ?? '?'}`;
  const open = useReliableTap(() => { onOpen?.(); useJoinFlow.getState().edit(j.id, back); });
  return (
    <button type="button" className="props-row is-button" data-testid="joint-row" onClick={open} onPointerUp={open}>
      <span className="props-label joint-row-label">{JOINT_LABEL[j.type]} · {name}</span>
      <span className={`joint-status is-${fit.status}`} data-testid="joint-status"><span className="joint-dot" aria-hidden="true" />{fitWord(fit)}</span>
    </button>
  );
};

/** Join two boards, edit a joint, or list joints. */
export const JoinSheet: React.FC = () => {
  const view = useJoinFlow((f) => f.view);
  const close = useJoinFlow((f) => f.close);
  const project = useProjectStore((s) => s.projects.find((p) => p.id === s.activeProjectId));
  const doneTap = useReliableTap(() => {
    const v = useJoinFlow.getState().view;
    if (v?.kind === 'edit' && v.back) useJoinFlow.setState({ view: v.back }); else close();
  });
  if (!view || !project) return null;
  const byId = new Map(project.objects.map((o) => [o.id, o]));
  let title = 'Join';
  let body: React.ReactNode = null;

  if (view.kind === 'new') {
    title = 'Join boards';
    body = <NewJoint project={project} a={view.a} b={view.b} />;
  } else if (view.kind === 'edit') {
    const j = project.joints?.find((x) => x.id === view.jointId);
    const R = j ? byId.get(j.receiverId) : undefined, M = j ? byId.get(j.materId) : undefined;
    title = j ? `${JOINT_LABEL[j.type]} · ${R?.name ?? '?'} + ${M?.name ?? '?'}` : 'Joint';
    body = j
      ? <JointEditor key={j.id} project={project} joint={j} onDone={() => (view.back ? useJoinFlow.setState({ view: view.back }) : close())} />
      : <p style={{ margin: 0 }}>That joint was removed.</p>;
  } else {
    const part = view.partId ? byId.get(view.partId) : undefined;
    const all = (project.joints ?? []).filter((j) => byId.has(j.receiverId) && byId.has(j.materId));
    const list = view.partId ? all.filter((j) => j.receiverId === view.partId || j.materId === view.partId) : all;
    title = part ? `Joints · ${part.name}` : 'Joints';
    body = list.length
      ? <div className="props-card"><JointRows project={project} joints={list} partId={view.partId} back={view} /></div>
      : <p className="props-note">No joints yet. Select two boards that touch, then tap Join.</p>;
  }

  return (
    <div className="new-project-backdrop joint-backdrop" data-testid="join-sheet" onPointerUp={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="new-project-card-sheet glass-panel joint-sheet" data-testid="joint-sheet-card">
        <div className="joint-head">
          <h2 className="joint-title">{title}</h2>
          <button type="button" className="joint-btn is-plain" data-testid="join-done" onClick={doneTap} onPointerUp={doneTap}>Done</button>
        </div>
        {body}
      </div>
    </div>
  );
};
