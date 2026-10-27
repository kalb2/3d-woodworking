import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useProjectStore } from '../state/useProjectStore';
import { useBuiltInFlow } from '../builtins/useBuiltInFlow';
import { useReliableTap } from '../utils/reliableTap';
import { currentSpec } from './build';
import { AiRequestError, requestSpec } from './client';
import { MAX_PROMPT } from './spec';
import { useDescribeFlow } from './useDescribeFlow';

const primary: React.CSSProperties = { padding: '10px 12px', borderRadius: 10, border: 'none', background: '#e09f3e', color: '#fff', fontWeight: 700, fontSize: 14 };
const secondary: React.CSSProperties = { ...primary, background: 'rgba(148,163,184,0.2)', color: 'inherit', fontWeight: 600 };
const hintStyle: React.CSSProperties = { fontSize: 12, color: '#9ca3af', lineHeight: 1.4, margin: 0 };

const Button: React.FC<{ label: string; onTap: () => void; style: React.CSSProperties; testId: string; disabled?: boolean }> = ({ label, onTap, style, testId, disabled }) => {
  const tap = useReliableTap(() => { if (!disabled) onTap(); });
  return (
    <button type="button" data-testid={testId} disabled={disabled} onClick={tap} onPointerUp={tap}
      style={{ ...style, ...(disabled ? { opacity: 0.5 } : {}) }}>
      {label}
    </button>
  );
};

interface Result { groupId: string; name: string; notes: string[]; changed: boolean }

/**
 * Describe it: type (or dictate with the keyboard mic) a piece, get it built as
 * one group. "Change it" sends the group's design plus the change and rebuilds it.
 */
export const DescribeSheet: React.FC = () => {
  const { open, targetId, close, openChange } = useDescribeFlow();
  const insertAiPiece = useProjectStore((s) => s.insertAiPiece);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const ticket = useRef(0);

  useEffect(() => {
    ticket.current++;
    setText(''); setError(null); setResult(null); setBusy(false);
  }, [open, targetId]);

  const target = useProjectStore((s) => (targetId
    ? s.projects.find((p) => p.id === s.activeProjectId)?.objects.find((o) => o.id === targetId && o.ai)
    : undefined));
  const closeTap = useReliableTap(close);
  if (!open) return null;

  const generate = async () => {
    const prompt = text.trim();
    if (busy || !prompt) return;
    const mine = ++ticket.current;
    setBusy(true);
    setError(null);
    try {
      const spec = await requestSpec(prompt, target ? currentSpec(target) : null);
      if (mine !== ticket.current) return;
      const asked = target?.ai ? `${target.ai.prompt}; ${prompt}`.slice(-MAX_PROMPT) : prompt;
      const placed = insertAiPiece(spec, asked, target?.id ?? null);
      if (!placed) throw new AiRequestError('bad_json', 'Nothing buildable came back. Try describing it differently.');
      const g = useProjectStore.getState().projects.find((p) => p.id === useProjectStore.getState().activeProjectId)?.objects.find((o) => o.id === placed.groupId);
      if (g) useBuiltInFlow.getState().requestFocus(g.position, Math.hypot(g.dimensions.length, g.dimensions.height, g.dimensions.width) / 2);
      setResult({ groupId: placed.groupId, name: g?.name ?? spec.name, notes: placed.notes, changed: Boolean(target) });
      setText('');
    } catch (e) {
      if (mine !== ticket.current) return;
      setError(e instanceof AiRequestError ? e.message : 'Something went wrong. Try again.');
    } finally {
      if (mine === ticket.current) setBusy(false);
    }
  };

  const title = result ? `${result.name} ${result.changed ? 'changed' : 'added'}` : target ? `Change ${target.name}` : 'Describe it';
  let body: React.ReactNode;
  if (result) {
    body = (
      <>
        {result.notes.length > 0 ? (
          <div data-testid="describe-notes" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <p style={{ ...hintStyle, fontWeight: 600 }}>Fixed for you:</p>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.45 }}>
              {result.notes.map((n) => <li key={n}>{n}</li>)}
            </ul>
          </div>
        ) : <p style={hintStyle}>It's in your project as one group. Undo removes it.</p>}
        <div style={{ display: 'flex', gap: 8 }}>
          <Button label="Change it" testId="describe-change" style={{ ...secondary, flex: 1 }} onTap={() => openChange(result.groupId)} />
          <Button label="Done" testId="describe-done" style={{ ...primary, flex: 1 }} onTap={close} />
        </div>
      </>
    );
  } else {
    body = (
      <>
        <textarea
          data-testid="describe-input"
          aria-label={target ? 'What to change' : 'Describe the piece'}
          value={text}
          maxLength={MAX_PROMPT}
          rows={3}
          autoFocus
          placeholder={target ? 'What should change?' : 'What do you want to build?'}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void generate(); }}
          style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.5)',
            fontSize: 16, lineHeight: 1.4, resize: 'none', background: 'transparent', color: 'inherit', fontFamily: 'inherit' }}
        />
        <p style={hintStyle}>
          {target ? 'e.g. "make it 6 in taller" or "add a door". It rebuilds from its design, so hand edits to its parts are replaced.'
            : 'e.g. "a 36 in wide bookshelf, 6 ft tall, with 4 shelves". Tap the mic on the keyboard to say it.'}
        </p>
        {error && <p role="alert" data-testid="describe-error" style={{ margin: 0, fontSize: 13, color: '#dc2626', lineHeight: 1.4 }}>{error}</p>}
        <Button label={busy ? 'Generating…' : target ? 'Change it' : 'Generate'} testId="describe-generate" style={primary}
          disabled={busy || !text.trim()} onTap={() => { void generate(); }} />
      </>
    );
  }

  return (
    <div className="new-project-backdrop" data-testid="describe-sheet" onPointerUp={(e) => { if (e.target === e.currentTarget && !busy) close(); }}>
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
