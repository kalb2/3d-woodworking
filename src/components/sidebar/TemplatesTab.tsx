import React, { useState } from 'react';
import { Bookmark, MoreHorizontal, Tv, X } from 'lucide-react';
import { useProjectStore } from '../../state/useProjectStore';
import { useBuiltInFlow } from '../../builtins/useBuiltInFlow';
import { BUILT_IN_TEMPLATES } from '../../builtins/builtIns';
import { cameraTarget, useUserTemplates, type UserTemplate } from '../../templates/userTemplates';
import { useReliableTap } from '../../utils/reliableTap';

interface Props { isPhone: boolean; onDone: () => void }

const rowStyle = (isPhone: boolean): React.CSSProperties | undefined =>
  (isPhone ? undefined : { justifyContent: 'flex-start', width: '100%', padding: '12px' });

const SavedRow: React.FC<{ t: UserTemplate; isPhone: boolean; onInsert: (t: UserTemplate) => void }> = ({ t, isPhone, onInsert }) => {
  const [menu, setMenu] = useState(false);
  const { rename, remove } = useUserTemplates();
  const insert = useReliableTap(() => onInsert(t));
  const more = useReliableTap(() => setMenu((v) => !v));
  const doRename = useReliableTap(() => {
    const name = window.prompt('Rename template', t.name);
    if (name && name.trim()) rename(t.id, name);
    setMenu(false);
  });
  const doDelete = useReliableTap(() => { if (window.confirm(`Delete "${t.name}"?`)) remove(t.id); setMenu(false); });
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <button type="button" className={isPhone ? 'phone-sheet-row' : 'glass-button'} data-testid="user-template-row"
          onClick={insert} onPointerUp={insert} style={{ ...rowStyle(isPhone), flex: 1 }}>
          <Bookmark size={18} color={isPhone ? '#64748b' : '#e09f3e'} style={{ marginRight: 10, flexShrink: 0 }} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{t.name}</span>
            <span style={{ fontSize: 11, color: '#9ca3af' }}>{t.parts.length} part{t.parts.length === 1 ? '' : 's'}</span>
          </div>
        </button>
        <button type="button" aria-label={`More for ${t.name}`} className="glass-button" onClick={more} onPointerUp={more}
          style={{ minWidth: 40, minHeight: 40, padding: 6 }}>
          <MoreHorizontal size={16} />
        </button>
      </div>
      {menu && (
        <div style={{ display: 'flex', gap: 8, padding: '0 8px 8px' }}>
          <button type="button" className="glass-button" onClick={doRename} onPointerUp={doRename} style={{ flex: 1 }}>Rename</button>
          <button type="button" className="glass-button" onClick={doDelete} onPointerUp={doDelete} style={{ flex: 1, color: '#ef4444' }}>Delete</button>
        </div>
      )}
    </div>
  );
};

/** Editor Add › Templates: built-in templates, then the user's saved templates. */
export const TemplatesTab: React.FC<Props> = ({ isPhone, onDone }) => {
  const templates = useUserTemplates((s) => s.templates);
  const project = useProjectStore((s) => s.projects.find((p) => p.id === s.activeProjectId));
  const insertUserTemplate = useProjectStore((s) => s.insertUserTemplate);
  const targetWallId = useBuiltInFlow((s) => s.targetWallId);
  const targetWall = targetWallId ? project?.scannedRoom?.walls.find((w) => w.id === targetWallId) : undefined;
  const clearWall = useReliableTap(() => useBuiltInFlow.getState().setTargetWall(null));

  const openBuiltIn = (id: (typeof BUILT_IN_TEMPLATES)[number]['id']) => {
    useBuiltInFlow.getState().startTemplate(id, Boolean(project?.scannedRoom?.walls.length), targetWall?.id ?? null);
    onDone();
  };
  const insertSaved = (t: UserTemplate) => {
    if (insertUserTemplate(t, { at: { x: cameraTarget.x, z: cameraTarget.z }, wallId: targetWall?.id })) {
      useBuiltInFlow.getState().setTargetWall(null);
      onDone();
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {targetWall && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: '#64748b', padding: '0 4px' }}>
          <span>For {targetWall.label}</span>
          <button type="button" aria-label="Clear wall" onClick={clearWall} onPointerUp={clearWall}
            style={{ border: 'none', background: 'transparent', color: 'inherit', display: 'flex', padding: 4 }}><X size={14} /></button>
        </div>
      )}
      {BUILT_IN_TEMPLATES.map((t) => (
        <BuiltInRow key={t.id} name={t.name} description={t.description} isPhone={isPhone} onTap={() => openBuiltIn(t.id)} testId={`builtin-${t.id}`} />
      ))}
      <div style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 10, padding: '0 4px' }}>
        My templates
      </div>
      {templates.length === 0
        ? <span style={{ fontSize: 12, color: '#9ca3af', padding: '0 4px' }} data-testid="user-templates-empty">Select something and choose Save as template.</span>
        : templates.map((t) => <SavedRow key={t.id} t={t} isPhone={isPhone} onInsert={insertSaved} />)}
    </div>
  );
};

const BuiltInRow: React.FC<{ name: string; description: string; isPhone: boolean; onTap: () => void; testId: string }> = ({ name, description, isPhone, onTap, testId }) => {
  const tap = useReliableTap(onTap);
  return (
    <button type="button" className={isPhone ? 'phone-sheet-row' : 'glass-button'} data-testid={testId} onClick={tap} onPointerUp={tap} style={rowStyle(isPhone)}>
      <Tv size={18} color={isPhone ? '#64748b' : '#e09f3e'} style={{ marginRight: 10, flexShrink: 0 }} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{name}</span>
        <span style={{ fontSize: 11, color: '#9ca3af', textAlign: 'left' }}>{description}</span>
      </div>
    </button>
  );
};
