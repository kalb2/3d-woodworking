import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Lock, LockOpen, MoreHorizontal, X } from 'lucide-react';
import { useProjectStore } from '../state/useProjectStore';
import { useAppStore } from '../state/useAppStore';
import { useReliableTap } from '../utils/reliableTap';
import { describeWall } from '../native/wallScan';
import { autoBaseCount, MEDIA_WALL_DEFAULTS, type UpperStyle } from '../generators/mediaWall';
import { fitMediaWall } from '../generators/fitMediaWall';
import type { FurnitureObject, RoomWall } from '../types/furniture';
import { BUILT_IN_TEMPLATES, builtInLabel, findBuiltInTemplate, listBuiltIns } from './builtIns';
import { useBuiltInFlow } from './useBuiltInFlow';

const fieldStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 13 };
const inputStyle: React.CSSProperties = { width: 72, padding: '6px 8px', borderRadius: 8, border: '1px solid rgba(148,163,184,0.5)', fontSize: 14, textAlign: 'right', background: 'transparent', color: 'inherit' };
const chipStyle: React.CSSProperties = {
  position: 'fixed', left: '50%', transform: 'translateX(-50%)', top: 'calc(env(safe-area-inset-top, 0px) + 64px)', zIndex: 230,
  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 999, border: 'none',
  background: 'rgba(15,23,42,0.82)', color: '#fff', fontSize: 13, fontWeight: 600,
};

const Row: React.FC<{ onTap: () => void; children: React.ReactNode; testId?: string }> = ({ onTap, children, testId }) => {
  const tap = useReliableTap(onTap);
  return (
    <button type="button" className="phone-sheet-row" data-testid={testId} onClick={tap} onPointerUp={tap} style={{ justifyContent: 'space-between' }}>
      {children}
    </button>
  );
};

function useProject() {
  return useProjectStore((s) => s.projects.find((p) => p.id === s.activeProjectId));
}

/** Media wall form; fitted to a wall when `wall` is given. */
const MediaWallForm: React.FC<{ wall?: RoomWall; existing?: FurnitureObject; onDone: () => void }> = ({ wall, existing, onDone }) => {
  const insertBuiltIn = useProjectStore((s) => s.insertBuiltIn);
  const prev = (existing?.builtIn?.input ?? {}) as Record<string, number | string>;
  const num = (k: string, d: number) => (typeof prev[k] === 'number' ? (prev[k] as number) : d);
  const [tvSize, setTvSize] = useState(num('tvSize', MEDIA_WALL_DEFAULTS.tvSize));
  const [baseDepth, setBaseDepth] = useState(num('baseDepth', MEDIA_WALL_DEFAULTS.baseDepth));
  const [upperStyle, setUpperStyle] = useState<UpperStyle>(prev.upperStyle === 'cabinets' ? 'cabinets' : 'shelves');
  const fitted = useMemo(() => wall ? fitMediaWall({ ...MEDIA_WALL_DEFAULTS, tvSize }, wall, { center: existing?.builtIn?.center }) : null, [wall, tvSize, existing]);
  const maxWidth = fitted ? Math.floor((fitted.span ? fitted.span.x1 - fitted.span.x0 : wall!.width)) : 360;
  const [wallWidth, setWallWidth] = useState(Math.round(num('wallWidth', wall ? maxWidth : MEDIA_WALL_DEFAULTS.wallWidth)));
  const [wallHeight, setWallHeight] = useState(Math.round(num('wallHeight', wall ? wall.height : MEDIA_WALL_DEFAULTS.wallHeight)));
  const [baseCount, setBaseCount] = useState<number | null>(typeof prev.baseCount === 'number' ? prev.baseCount : null);
  const width = Math.min(wallWidth, maxWidth);

  const generate = () => {
    const input = { wallWidth: width, wallHeight, tvSize, baseDepth, upperStyle, baseCount: baseCount ?? autoBaseCount(width) };
    const ok = insertBuiltIn({ template: 'media-wall', input, wallId: wall?.id, width: wall ? width : undefined,
      center: existing?.builtIn?.center, editId: existing?.builtIn?.id });
    if (ok) onDone();
  };
  const generateTap = useReliableTap(generate);
  const upperTap = { shelves: useReliableTap(() => setUpperStyle('shelves')), cabinets: useReliableTap(() => setUpperStyle('cabinets')) };
  const field = (label: string, value: number, set: (n: number) => void, testId: string) => (
    <label style={fieldStyle}>
      <span>{label}</span>
      <input type="number" inputMode="decimal" data-testid={testId} value={value} onChange={(e) => set(Number(e.target.value))} style={inputStyle} />
    </label>
  );
  return (
    <div data-testid="media-wall-form" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {field(wall ? `Width (in, max ${maxWidth})` : 'Wall width (in)', wallWidth, setWallWidth, 'mw-width')}
      {field('Height (in)', wallHeight, setWallHeight, 'mw-height')}
      {field('TV size (in)', tvSize, setTvSize, 'mw-tv')}
      {field('Base cabinets', baseCount ?? autoBaseCount(width), (n) => setBaseCount(n), 'mw-count')}
      {field('Base depth (in)', baseDepth, setBaseDepth, 'mw-depth')}
      <div style={fieldStyle}>
        <span>Uppers</span>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['shelves', 'cabinets'] as const).map((style) => (
            <button key={style} type="button" data-testid={`mw-upper-${style}`} onClick={upperTap[style]} onPointerUp={upperTap[style]}
              style={{ padding: '6px 10px', borderRadius: 8, fontSize: 13, border: '1px solid rgba(148,163,184,0.5)',
                background: upperStyle === style ? '#e09f3e' : 'transparent', color: upperStyle === style ? '#fff' : 'inherit' }}>
              {style === 'shelves' ? 'Open shelves' : 'Cabinets'}
            </button>
          ))}
        </div>
      </div>
      {wall && <span style={{ fontSize: 11, color: '#9ca3af' }}>Fits the largest clear stretch of the wall; parts skip windows and doors.</span>}
      <button type="button" data-testid="mw-generate" onClick={generateTap} onPointerUp={generateTap}
        style={{ marginTop: 4, padding: '10px 12px', borderRadius: 10, border: 'none', background: '#e09f3e', color: '#fff', fontWeight: 700, fontSize: 14 }}>
        {existing ? 'Update' : 'Generate'}
      </button>
    </div>
  );
};

const BuiltInRow: React.FC<{ group: FurnitureObject; label: string; onClose: () => void }> = ({ group, label, onClose }) => {
  const [menu, setMenu] = useState(false);
  const { selectObject, deleteBuiltIn } = useProjectStore();
  const flow = useBuiltInFlow();
  const select = useReliableTap(() => {
    selectObject(group.id);
    const d = group.dimensions;
    flow.requestFocus(group.position, Math.max(d.length, d.height, d.width));
    onClose();
  });
  const more = useReliableTap(() => setMenu((v) => !v));
  const edit = useReliableTap(() => flow.startEdit(group.id, group.builtIn!.template, group.builtIn!.wallId));
  const del = useReliableTap(() => { if (window.confirm(`Delete ${label}?`)) deleteBuiltIn(group.id); });
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <button type="button" className="phone-sheet-row" onClick={select} onPointerUp={select} style={{ flex: 1 }}>{label}</button>
        <button type="button" aria-label="More" className="glass-button" onClick={more} onPointerUp={more} style={{ minWidth: 40, minHeight: 40, padding: 6 }}>
          <MoreHorizontal size={16} />
        </button>
      </div>
      {menu && (
        <div style={{ display: 'flex', gap: 8, padding: '0 8px 8px' }}>
          <button type="button" className="glass-button" onClick={edit} onPointerUp={edit} style={{ flex: 1 }}>Edit</button>
          <button type="button" className="glass-button" onClick={del} onPointerUp={del} style={{ flex: 1, color: '#ef4444' }}>Delete</button>
        </div>
      )}
    </div>
  );
};

/** App-level built-ins UI: add flow, list, wall-pick chip and breadcrumb chip. */
export const BuiltInSheet: React.FC = () => {
  const flow = useBuiltInFlow();
  const project = useProject();
  const editingGroupId = useProjectStore((s) => s.editingGroupId);
  const exitGroup = useProjectStore((s) => s.exitGroup);
  const room = project?.scannedRoom;
  const exitTap = useReliableTap(exitGroup);
  const dismissWall = useReliableTap(() => flow.focusWall(null));
  const setRoomLocked = useProjectStore((s) => s.setRoomLocked);
  const roomLocked = project?.roomLocked !== false;
  const lockTap = useReliableTap(() => {
    if (roomLocked) {
      // Unlock and hand the tapped wall to the normal tools (bottom bar: Move/Resize/Delete).
      setRoomLocked(false, flow.focusWallId);
      flow.focusWall(null);
    } else {
      setRoomLocked(true);
    }
  });
  const addForWall = useReliableTap(() => {
    if (!flow.focusWallId) return;
    // Open the Templates tab with this wall preselected.
    flow.setTargetWall(flow.focusWallId);
    flow.focusWall(null);
    useAppStore.getState().setSidebarPanel('templates');
    useAppStore.getState().openOverlay('sidebar');
  });
  const closeTap = useReliableTap(flow.close);
  const backTap = useReliableTap(flow.back);

  if (!project) return null;

  const focusedWall = flow.focusWallId ? room?.walls.find((w) => w.id === flow.focusWallId) : undefined;
  if (!flow.mode && focusedWall) {
    return (
      <div className="wall-action-bar" data-testid="wall-action-bar">
        <div className="wall-action-label">
          <strong>{focusedWall.label}</strong>
          <span>{Math.round(focusedWall.width)} × {Math.round(focusedWall.height)} in</span>
        </div>
        <button type="button" className="wall-action-add" data-testid="wall-add-template" onClick={addForWall} onPointerUp={addForWall}>
          + Template
        </button>
        <button type="button" className={`wall-action-icon${roomLocked ? '' : ' is-unlocked'}`} data-testid="wall-lock-toggle"
          aria-label={roomLocked ? 'Unlock walls' : 'Lock walls'} aria-pressed={roomLocked}
          title={roomLocked ? 'Walls locked: tap to unlock for editing' : 'Walls unlocked: tap to lock'}
          onClick={lockTap} onPointerUp={lockTap}>
          {roomLocked ? <Lock size={16} /> : <LockOpen size={16} />}
        </button>
        <button type="button" className="wall-action-icon" aria-label="Dismiss" onClick={dismissWall} onPointerUp={dismissWall}>
          <X size={16} />
        </button>
      </div>
    );
  }

  if (!flow.mode) {
    const g = editingGroupId ? project.objects.find((o) => o.id === editingGroupId) : undefined;
    if (!g?.builtIn) return null;
    return (
      <button type="button" style={chipStyle} data-testid="builtin-breadcrumb" onClick={exitTap} onPointerUp={exitTap}>
        {findBuiltInTemplate(g.builtIn.template)?.name ?? g.name} <ChevronRight size={14} />
      </button>
    );
  }

  const existing = flow.editGroupId ? project.objects.find((o) => o.id === flow.editGroupId) : undefined;
  const wall = flow.wallId ? room?.walls.find((w) => w.id === flow.wallId) : undefined;
  let title = 'Built-ins';
  let body: React.ReactNode = null;
  if (flow.mode === 'list') {
    const items = listBuiltIns(project.objects);
    body = items.length === 0
      ? <span style={{ fontSize: 13, color: '#9ca3af' }}>No built-ins yet.</span>
      : items.map((g) => <BuiltInRow key={g.id} group={g} label={builtInLabel(g, room)} onClose={flow.close} />);
  } else if (flow.step === 'wall') {
    title = 'Which wall?';
    body = (
      <>
        <span style={{ fontSize: 12, color: '#9ca3af', lineHeight: 1.4 }}>Tip: close this and tap a wall in the scene to start there. Or pick one:</span>
        {room?.walls.map((w) => (
          <Row key={w.id} onTap={() => flow.chooseWall(w.id)}><span>{describeWall(w)}</span><ChevronRight size={16} /></Row>
        ))}
        <Row onTap={() => flow.chooseWall(null)}><span style={{ color: '#9ca3af' }}>No wall (free-standing)</span></Row>
      </>
    );
  } else if (flow.step === 'template') {
    title = wall ? `Template · ${wall.label}` : 'Template';
    body = BUILT_IN_TEMPLATES.map((t) => (
      <Row key={t.id} onTap={() => flow.chooseTemplate(t.id)} testId={`builtin-template-${t.id}`}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
          <span style={{ fontWeight: 600 }}>{t.name}</span>
          <span style={{ fontSize: 11, color: '#9ca3af' }}>{t.description}</span>
        </div>
        <ChevronRight size={16} />
      </Row>
    ));
  } else {
    title = `${existing ? 'Edit ' : ''}${findBuiltInTemplate(flow.template ?? 'media-wall')?.name ?? 'Built-in'}${wall ? ` · ${wall.label}` : ''}`;
    body = <MediaWallForm key={flow.editGroupId ?? flow.wallId ?? 'free'} wall={wall} existing={existing} onDone={flow.close} />;
  }

  return (
    <div className="new-project-backdrop" data-testid="builtin-sheet" onPointerUp={(e) => { if (e.target === e.currentTarget) flow.close(); }}>
      <div className="new-project-card-sheet glass-panel" style={{ maxHeight: '75vh', overflowY: 'auto', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          {flow.mode === 'add' && flow.step === 'form' && !!room?.walls.length && !flow.fromWall && !existing ? (
            <button type="button" className="glass-button" aria-label="Back" onClick={backTap} onPointerUp={backTap} style={{ padding: 6, minHeight: 40, minWidth: 40 }}>
              <ChevronLeft size={16} />
            </button>
          ) : <span style={{ width: 40 }} />}
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
