import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useProjectStore } from '../state/useProjectStore';
import { useReliableTap } from '../utils/reliableTap';
import { NumberField } from '../components/ui/NumberField';
import { unitScale } from '../utils/units';
import type { FurnitureObject, Joint, JointType, LengthUnit } from '../types/furniture';
import { useJoinFlow } from './useJoinFlow';
import {
  DEFAULT_SPACING, JOINT_LABEL, JOINT_TYPES, buttKind, contactOn, groovable, defaultDepth, hardwareCount, jointLayout, jointNote, jointsOf, pairContact,
} from './joints';
import type { Face } from '../utils/pushPull';

const fieldStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, fontSize: 14 };
const inputStyle: React.CSSProperties = { width: 90, padding: '6px 8px', borderRadius: 8, border: '1px solid rgba(148,163,184,0.5)', background: 'transparent', color: 'inherit', textAlign: 'right' };

const Tap: React.FC<{ label: string; onTap: () => void; testId: string; active?: boolean; tone?: 'primary' | 'danger'; style?: React.CSSProperties }> = ({ label, onTap, testId, active, tone, style }) => {
  const tap = useReliableTap(onTap);
  return (
    <button type="button" data-testid={testId} aria-pressed={active} onClick={tap} onPointerUp={tap}
      className={tone === 'primary' ? 'glass-button active' : 'glass-button'}
      style={{ minHeight: 40, padding: '6px 12px', fontSize: 14, ...(active ? { background: '#e09f3e', color: '#fff', borderColor: '#e09f3e' } : {}), ...(tone === 'danger' ? { color: '#ef4444' } : {}), ...style }}>
      {label}
    </button>
  );
};

/** Joint sizes are shown in inches for in/ft projects, else the metric unit. */
const fieldUnit = (u: LengthUnit): LengthUnit => (u === 'ft' ? 'in' : u);

interface FormProps {
  objects: FurnitureObject[];
  unit: LengthUnit;
  initial: { type: JointType; receiverId: string; materId: string; face: Face; depth: number; extend: boolean; spacing?: number; id?: string };
  onDone: () => void;
}

const JoinForm: React.FC<FormProps> = ({ objects, unit, initial, onDone }) => {
  const { saveJoint, removeJoint } = useProjectStore();
  const byId = new Map(objects.map((o) => [o.id, o]));
  const [type, setType] = useState<JointType>(initial.type);
  const [side, setSide] = useState({ receiverId: initial.receiverId, materId: initial.materId, face: initial.face });
  const R = byId.get(side.receiverId), M = byId.get(side.materId);
  const [depth, setDepth] = useState(initial.depth);
  const [extend, setExtend] = useState(initial.extend);
  const [spacing, setSpacing] = useState<number | undefined>(initial.spacing);
  // The other way round (e.g. both ends flush): offer Swap.
  const flip = R && M ? contactOn(M, R) : null;
  const fu = fieldUnit(unit), k = unitScale(fu);
  const grooved = type === 'dado' || type === 'rabbet';
  const holes = type === 'pocket' || type === 'dowel';
  const sp = spacing ?? DEFAULT_SPACING[type === 'dowel' ? 'dowel' : 'pocket'];
  const draft: Joint = { id: initial.id ?? 'draft', type, ...side, depth, extended: initial.id ? initial.depth : 0, spacing: holes ? sp : undefined };
  const L = jointLayout(draft, R, M);
  const count = holes ? hardwareCount(draft, R, M) : 0;

  const save = useReliableTap(() => {
    if (!R || !M) return;
    saveJoint({ id: initial.id, type, ...side, depth, ...(holes ? { spacing: sp } : {}) }, grooved && extend);
    onDone();
  });
  const remove = () => { if (initial.id) removeJoint(initial.id); onDone(); };
  const swap = () => {
    if (!flip || !R || !M) return;
    setSide({ receiverId: M.id, materId: R.id, face: flip.face });
    setDepth(defaultDepth(M, flip.face));
  };
  const toggleExtend = useReliableTap(() => setExtend((v) => !v));
  if (!R || !M) return <p style={{ margin: 0 }}>Those parts are gone.</p>;
  // Dado / rabbet need a broad face to cut into (this way round, or swapped).
  const grooveHere = groovable(R, side.face);
  const grooveSwapped = !grooveHere && Boolean(flip && groovable(M, flip.face));
  const canGroove = grooveHere || grooveSwapped;
  const types = JOINT_TYPES.filter((t) => canGroove || (t !== 'dado' && t !== 'rabbet') || t === type);
  const pick = (t: JointType) => {
    if ((t === 'dado' || t === 'rabbet') && grooveSwapped) swap();
    setType(t);
  };

  const cutIn = type === 'pocket' ? M : R;
  return (
    <div data-testid="join-form" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div role="group" aria-label="Joint type" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {types.map((t) => <Tap key={t} label={JOINT_LABEL[t]} testId={`join-type-${t}`} active={type === t} onTap={() => pick(t)} />)}
      </div>
      {!canGroove && (
        <p data-testid="join-no-groove" style={{ margin: 0, fontSize: 13, color: '#9ca3af' }}>
          These boards meet {buttKind(R, side.face) === 'end' ? 'end to end' : 'edge to edge'}, so there is no face to cut a dado or rabbet into. Use a butt joint, pocket screws, or dowels.
        </p>
      )}
      {type !== 'butt' && (
        <div style={{ ...fieldStyle, color: '#9ca3af', fontSize: 13 }}>
          <span data-testid="join-where">
            {grooved && `${type === 'dado' ? 'Groove' : 'Rabbet'} in ${R.name}${L ? `, ${jointNote(draft, R.id, R, M, fu).replace(/^\w+ /, '')}` : ''}`}
            {type === 'pocket' && `${count} pocket holes in ${cutIn.name} (hidden face), screwed into ${R.name}`}
            {type === 'dowel' && `${count} dowels, 3/8" × 1 1/2"`}
          </span>
          {flip && type !== 'dowel' && <Tap label="Swap" testId="join-swap" onTap={swap} />}
        </div>
      )}
      {grooved && (
        <>
          <label style={fieldStyle}>
            <span>Depth ({fu})</span>
            <NumberField testId="join-depth" value={Math.round(depth * k * 1000) / 1000} min={0.01} onCommit={(n) => setDepth(Math.max(0.03, n / k))} style={inputStyle} />
          </label>
          <button type="button" className="phone-sheet-row" role="switch" aria-checked={extend} data-testid="join-extend"
            onClick={toggleExtend} onPointerUp={toggleExtend} style={{ justifyContent: 'space-between' }}>
            <span>Lengthen {M.name} into the groove</span>
            <span className={`menu-switch${extend ? ' is-on' : ''}`} aria-hidden="true"><span /></span>
          </button>
        </>
      )}
      {holes && (
        <label style={fieldStyle}>
          <span>Spacing ({fu})</span>
          <NumberField testId="join-spacing" value={Math.round(sp * k * 100) / 100} min={0.1} onCommit={(n) => setSpacing(Math.max(1, n / k))} style={inputStyle} />
        </label>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        {initial.id && <Tap label="Remove joint" testId="join-remove" tone="danger" onTap={remove} style={{ flex: 1 }} />}
        <button type="button" className="glass-button active" data-testid="join-save" onClick={save} onPointerUp={save} style={{ flex: 1, minHeight: 44 }}>
          {initial.id ? 'Save' : 'Add joint'}
        </button>
      </div>
    </div>
  );
};

const JointRow: React.FC<{ j: Joint; partId: string; objects: FurnitureObject[]; unit: LengthUnit }> = ({ j, partId, objects, unit }) => {
  const byId = new Map(objects.map((o) => [o.id, o]));
  const other = byId.get(j.receiverId === partId ? j.materId : j.receiverId);
  const edit = useReliableTap(() => useJoinFlow.getState().edit(j.id, partId));
  const remove = () => useProjectStore.getState().removeJoint(j.id);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} data-testid="joint-row">
      <button type="button" className="phone-sheet-row" onClick={edit} onPointerUp={edit} style={{ flex: 1, flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
        <span>{JOINT_LABEL[j.type]} · {other?.name ?? 'missing part'}</span>
        <span style={{ fontSize: 12, color: '#9ca3af' }}>{jointNote(j, partId, byId.get(j.receiverId), byId.get(j.materId), fieldUnit(unit))}</span>
      </button>
      <Tap label="Remove" testId="joint-remove" tone="danger" onTap={remove} />
    </div>
  );
};

/** Join two boards, or list/edit a board's joints. */
export const JoinSheet: React.FC = () => {
  const view = useJoinFlow((f) => f.view);
  const close = useJoinFlow((f) => f.close);
  const project = useProjectStore((s) => s.projects.find((p) => p.id === s.activeProjectId));
  const closeTap = useReliableTap(close);
  if (!view || !project) return null;
  const byId = new Map(project.objects.map((o) => [o.id, o]));
  let title = 'Join';
  let body: React.ReactNode = null;

  if (view.kind === 'new') {
    const pair = pairContact(byId.get(view.a), byId.get(view.b));
    title = 'Join boards';
    body = pair
      ? <JoinForm objects={project.objects} unit={project.unit} onDone={close}
          initial={{ type: 'butt', receiverId: pair.receiver.id, materId: pair.mater.id, face: pair.face, depth: defaultDepth(pair.receiver, pair.face), extend: true }} />
      : <p style={{ margin: 0 }}>These parts need to touch, square to each other.</p>;
  } else if (view.kind === 'edit') {
    const j = project.joints?.find((x) => x.id === view.jointId);
    title = j ? `Edit ${JOINT_LABEL[j.type].toLowerCase()}` : 'Joint';
    const done = () => (view.back ? useJoinFlow.getState().list(view.back) : close());
    body = j
      ? <JoinForm key={j.id} objects={project.objects} unit={project.unit} onDone={done}
          initial={{ id: j.id, type: j.type, receiverId: j.receiverId, materId: j.materId, face: j.face, depth: j.depth, extend: j.extended > 0 || j.type === 'butt' || j.type === 'pocket' || j.type === 'dowel', spacing: j.spacing }} />
      : <p style={{ margin: 0 }}>That joint was removed.</p>;
  } else {
    const part = byId.get(view.partId);
    const list = jointsOf(project, view.partId).filter((j) => byId.has(j.receiverId) && byId.has(j.materId));
    title = `Joints · ${part?.name ?? ''}`;
    body = list.length
      ? <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{list.map((j) => <JointRow key={j.id} j={j} partId={view.partId} objects={project.objects} unit={project.unit} />)}</div>
      : <p style={{ margin: 0, color: '#9ca3af' }}>No joints. Select this board and one it touches, then tap Join.</p>;
  }

  return (
    <div className="new-project-backdrop" data-testid="join-sheet" onPointerUp={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="new-project-card-sheet glass-panel" style={{ maxHeight: '75vh', overflowY: 'auto', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ width: 40 }} />
          <h2 style={{ margin: 0, fontSize: 17 }}>{title}</h2>
          <button type="button" className="glass-button" aria-label="Close" onClick={closeTap} onPointerUp={closeTap} style={{ padding: 6, minHeight: 40, minWidth: 40 }}>
            <X size={16} />
          </button>
        </div>
        {body}
      </div>
    </div>
  );
};
