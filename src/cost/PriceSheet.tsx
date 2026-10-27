import React from 'react';
import { X } from 'lucide-react';
import { useReliableTap } from '../utils/reliableTap';
import { useProjectStore } from '../state/useProjectStore';
import type { FurnitureProject } from '../types/furniture';
import { DEFAULT_PRICES, EXAMPLE_NOTE, FLAT_LABEL, HARDWARE, STICK_PROFILES, STICK_STOCK, priceLabel, resolvePrices, stickKey, type ProjectCost } from './cost';
import { editPrices, usePriceStore, type ExtraField } from './usePriceStore';
import { stickFeet } from '../utils/stock';

type Scope = 'device' | 'project';

const muted: React.CSSProperties = { color: '#9ca3af', fontSize: 12 };
const head: React.CSSProperties = { fontWeight: 700, color: '#e09f3e', fontSize: 13, margin: '14px 0 4px' };

const Chip: React.FC<{ label: string; on: boolean; testId: string; onTap: () => void }> = ({ label, on, testId, onTap }) => {
  const tap = useReliableTap(onTap);
  return <button type="button" className={`tpl-chip${on ? ' is-on' : ''}`} aria-pressed={on} data-testid={testId} onClick={tap} onPointerUp={tap}>{label}</button>;
};

const TextButton: React.FC<{ label: string; testId: string; onTap: () => void }> = ({ label, testId, onTap }) => {
  const tap = useReliableTap(onTap);
  return <button type="button" className="glass-button" data-testid={testId} onClick={tap} onPointerUp={tap} style={{ fontSize: 12, padding: '4px 10px', minHeight: 'auto' }}>{label}</button>;
};

/** A $ or % amount: edits commit on blur / Enter; empty goes back to the price under it. */
const Amount: React.FC<{ value: number; suffix?: '%'; label: string; testId: string; onCommit: (v: number | null) => void; width?: number }> = ({ value, suffix, label, testId, onCommit, width = 76 }) => {
  const shown = suffix ? String(value) : value.toFixed(2);
  const [draft, setDraft] = React.useState(shown);
  React.useEffect(() => setDraft(shown), [shown]);
  const commit = () => {
    const t = draft.trim().replace(/[$,%\s]/g, '');
    if (t === '') { onCommit(null); return; }
    const n = Number(t);
    if (Number.isFinite(n) && n >= 0) onCommit(n); else setDraft(shown);
  };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
      {!suffix && <span style={muted}>$</span>}
      <input
        className="glass-input"
        inputMode="decimal"
        aria-label={label}
        data-testid={testId}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        style={{ width, padding: '4px 6px', fontSize: 14, textAlign: 'right', minHeight: 'auto' }}
      />
      {suffix && <span style={muted}>%</span>}
    </span>
  );
};

/**
 * Prices behind the cost: this device's list (all projects) or this project's
 * own, over it. Shows what this project buys; "All prices" opens the full list.
 */
export const PriceSheet: React.FC<{ project: FurnitureProject; cost: ProjectCost; onClose: () => void }> = ({ project, cost, onClose }) => {
  const device = usePriceStore((s) => s.device);
  const setDevicePrice = usePriceStore((s) => s.setDevicePrice);
  const resetDevice = usePriceStore((s) => s.resetDevice);
  const setProjectPrices = useProjectStore((s) => s.setProjectPrices);
  const [scope, setScope] = React.useState<Scope>(project.prices ? 'project' : 'device');
  const [all, setAll] = React.useState(false);
  const tapClose = useReliableTap(onClose);

  const shown = scope === 'device' ? resolvePrices(device) : resolvePrices(device, project.prices);
  const own = scope === 'device' ? device : project.prices;
  const set = (key: string | ExtraField, v: number | null) => {
    if (scope === 'device') setDevicePrice(key, v);
    else setProjectPrices(editPrices(project.prices, key, v));
  };

  const used = new Set(cost.lines.map((l) => l.key).filter((k): k is string => !!k));
  const keys = (prefix: string) => [...new Set([...Object.keys(DEFAULT_PRICES.items), ...used])].filter((k) => k.startsWith(prefix) && (all || used.has(k)));
  const tag = (key: string) => (own?.items && key in own.items ? (scope === 'project' ? 'this project' : '') : shown.example.has(key) ? 'example' : '');
  const row = (key: string, unit: string) => (
    <div key={key} data-testid="price-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '3px 0' }}>
      <span>{priceLabel(key)} <span style={muted}>per {unit}{tag(key) ? ` · ${tag(key)}` : ''}</span></span>
      <Amount value={shown.items[key] ?? 0} label={`${priceLabel(key)} price`} testId={`price-${key}`} onCommit={(v) => set(key, v)} />
    </div>
  );

  const profiles = [...new Set([...(all ? STICK_PROFILES : []), ...[...used].filter((k) => k.startsWith('stick:')).map((k) => k.split(':')[1])])];
  const sheets = keys('sheet:'), bf = keys('bf:');
  const hardware = HARDWARE.filter((h) => all || used.has(h.key));
  const nothing = !profiles.length && !sheets.length && !bf.length && !hardware.length;

  return (
    <div role="dialog" aria-label="Prices" data-testid="price-sheet" style={{ position: 'fixed', inset: 0, zIndex: 110, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="glass-panel" style={{ width: '100%', maxWidth: 460, maxHeight: '85vh', borderRadius: 18, padding: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: 17, fontWeight: 700 }}>Prices</h2>
          <button type="button" className="glass-button" aria-label="Close prices" onClick={tapClose} onPointerUp={tapClose} style={{ padding: 6, minHeight: 'auto', minWidth: 'auto', borderRadius: '50%' }}>
            <X size={18} />
          </button>
        </div>
        <div data-testid="price-example-note" style={muted}>{EXAMPLE_NOTE}</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <Chip label="All projects" on={scope === 'device'} testId="price-scope-device" onTap={() => setScope('device')} />
          <Chip label="This project" on={scope === 'project'} testId="price-scope-project" onTap={() => setScope('project')} />
        </div>
        <div style={muted}>{scope === 'device' ? 'Used by every project on this device.' : `Only for ${project.name}; empty a box to use the all-projects price.`}</div>
        <div data-testid="price-list" style={{ overflow: 'auto', flex: 1, minHeight: 0, fontSize: 14 }}>
          {nothing && <div style={{ ...muted, marginTop: 10 }}>Nothing to price in this project yet.</div>}
          {profiles.length > 0 && (
            <>
              <div style={head}>Lumber, per stick</div>
              {profiles.map((p) => (
                <div key={p} data-testid="price-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '3px 0' }}>
                  <span style={{ fontWeight: 600, minWidth: 34 }}>{p}</span>
                  <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {STICK_STOCK.map((L) => (
                      <span key={L} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <span style={muted}>{stickFeet(L)}</span>
                        <Amount width={58} value={shown.items[stickKey(p, L)] ?? 0} label={`${p} ${stickFeet(L)} price`} testId={`price-${stickKey(p, L)}`} onCommit={(v) => set(stickKey(p, L), v)} />
                      </span>
                    ))}
                  </span>
                </div>
              ))}
            </>
          )}
          {sheets.length > 0 && <><div style={head}>Sheets, per 4×8</div>{sheets.map((k) => row(k, 'sheet'))}</>}
          {bf.length > 0 && <><div style={head}>Other lumber, per board foot</div>{bf.map((k) => row(k, 'bd ft'))}</>}
          {hardware.length > 0 && <><div style={head}>Hardware</div>{hardware.map((h) => row(h.key, h.unit))}</>}
          <div style={head}>Extras</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0' }}>
            <span>{FLAT_LABEL} <span style={muted}>flat</span></span>
            <Amount value={shown.flat} label={`${FLAT_LABEL} amount`} testId="price-flat" onCommit={(v) => set('flat', v)} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0' }}>
            <span>Waste / contingency</span>
            <Amount suffix="%" width={52} value={shown.wastePct} label="Waste / contingency percent" testId="price-wastePct" onCommit={(v) => set('wastePct', v)} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0' }}>
            <span>Tax</span>
            <Amount suffix="%" width={52} value={shown.taxPct} label="Tax percent" testId="price-taxPct" onCommit={(v) => set('taxPct', v)} />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <TextButton label={all ? 'Only this project’s items' : 'All prices'} testId="price-show-all" onTap={() => setAll((v) => !v)} />
          {scope === 'project' && project.prices && <TextButton label="Use all-projects prices" testId="price-clear-project" onTap={() => setProjectPrices(undefined)} />}
          {scope === 'device' && Object.keys(device).length > 0 && <TextButton label="Back to example prices" testId="price-reset-device" onTap={resetDevice} />}
        </div>
      </div>
    </div>
  );
};
