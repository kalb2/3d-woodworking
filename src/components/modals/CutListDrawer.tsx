import React from 'react';
import { Layers, FileSpreadsheet, X } from 'lucide-react';
import { useProjectStore } from '../../state/useProjectStore';
import { generateCutList, exportCutListCSV, cutListSections, lumberBuyList, panelText, projectHardware, sheetBuyList, type CutListItem, type CutListSection, type StickBuy } from '../../utils/exportUtils';
import { formatLens, formatSmallLen } from '../../utils/lengthFormat';
import { LUMBER_WASTE, SHEET, sheetHasGrain, stickFeet, type SheetLayout, type SheetNest } from '../../utils/stock';
import { useReliableTap } from '../../utils/reliableTap';
import type { FurnitureProject } from '../../types/furniture';

interface CutListDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

const cell: React.CSSProperties = { padding: '10px 12px', verticalAlign: 'top' };
const sub: React.CSSProperties = { fontSize: 12, fontWeight: 400, color: '#9ca3af', marginTop: 2 };

/** L × W × T; may wrap between dimensions on a phone, never inside one (23 5/8"). */
export function cutSizeText(item: Pick<CutListItem, 'lengthIn' | 'widthIn' | 'thicknessIn'>, unit: FurnitureProject['unit']): string {
  const v = [item.lengthIn, item.widthIn, item.thicknessIn];
  if (unit === 'mm' || unit === 'cm') return formatLens(v, unit);
  return v.map((n) => formatSmallLen(n, unit).replace(/ /g, '\u00a0')).join(' × ');
}

/** One part row: name with its shape/joinery/assembly underneath, size L × W × T, quantity. */
const PartRow: React.FC<{ item: CutListItem; unit: FurnitureProject['unit'] }> = ({ item, unit }) => {
  const details = [item.shape !== 'Board' ? item.shape : '', item.notes ?? '', item.usedIn ? `in ${item.usedIn}` : ''].filter(Boolean);
  return (
    <tr data-testid="cut-part-row" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      <td style={{ ...cell, fontWeight: 600 }}>
        {item.name}
        {details.map((d) => <div key={d} data-testid="cut-part-detail" style={sub}>{d}</div>)}
      </td>
      <td data-testid="cut-part-size" style={{ ...cell, fontVariantNumeric: 'tabular-nums' }}>
        {cutSizeText(item, unit)}
      </td>
      <td style={{ ...cell, fontWeight: 700, color: '#e09f3e', textAlign: 'right' }}>{item.quantity}</td>
    </tr>
  );
};

/** Sticks to buy ('3 × 2×4 at 8 ft'), with which cuts come from each stick on request. */
const BuyList: React.FC<{ buys: StickBuy[]; unit: FurnitureProject['unit'] }> = ({ buys, unit }) => {
  const [showLayout, setShowLayout] = React.useState(false);
  const tapLayout = useReliableTap(() => setShowLayout((v) => !v));
  const len = (n: number) => formatSmallLen(n, unit).replace(/ /g, '\u00a0');
  const oversize = buys.filter((b) => b.oversize.length);
  return (
    <section data-testid="cut-buy-list" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ fontWeight: 700, color: '#e09f3e' }}>Lumber to buy</div>
        <button
          type="button"
          className="glass-button"
          data-testid="cut-layout-toggle"
          aria-expanded={showLayout}
          onClick={tapLayout}
          onPointerUp={tapLayout}
          style={{ fontSize: 12, padding: '4px 10px', minHeight: 'auto' }}
        >
          {showLayout ? 'Hide cut layout' : 'Show cut layout'}
        </button>
      </div>
      <ul style={{ listStyle: 'none', margin: '6px 0 0', padding: 0, fontSize: 14 }}>
        {buys.filter((b) => b.sticks.length).map((b) => (
          <li key={`${b.material}-${b.profile}`} data-testid="cut-buy-line" style={{ padding: '3px 0' }}>
            <strong>{b.sticks.length} × {b.profile}</strong> at {stickFeet(b.stockLength)}
            <span style={{ color: '#9ca3af' }}> · {b.material}</span>
          </li>
        ))}
      </ul>
      {oversize.map((b) => (
        <div key={`over-${b.material}-${b.profile}`} data-testid="cut-buy-oversize" role="alert" style={{ fontSize: 13, color: '#f87171', marginTop: 4 }}>
          {b.oversize.length} {b.profile} {b.oversize.length === 1 ? 'part is' : 'parts are'} longer than 12 ft ({b.oversize.map(len).join(', ')}): splice it or special-order the stock.
        </div>
      ))}
      {showLayout && (
        <ol data-testid="cut-layout" style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, fontSize: 12 }}>
          {buys.flatMap((b) => b.sticks.map((st, i) => (
            <li key={`${b.material}-${b.profile}-${i}`} data-testid="cut-layout-stick" style={{ padding: '3px 0', lineHeight: 1.45 }}>
              <span style={{ fontWeight: 600 }}>{b.profile} #{i + 1}</span> ({stickFeet(st.length)}): {st.cuts.map(len).join(' + ')}
              <span style={{ color: '#9ca3af' }}> · {len(st.left)} left</span>
            </li>
          )))}
        </ol>
      )}
    </section>
  );
};

/** Label size in sheet inches; the diagram is at most 440px wide, so about 11–17px on screen. Thin strips drop to SMALL. */
const LABEL = 3.8;
const SMALL = 3;
const fits = (text: string, w: number, fs: number) => text.length * fs * 0.52 <= w - 1;

type Label = { fs: number; lines: string[] };
/** The roomiest label that fits the panel: name over size, name over L × over W, one line, one small line; null → keyed by number. */
function panelLabel(name: string, l: string, w: string, pw: number, ph: number): Label | null {
  const size = `${l} × ${w}`;
  const tiers: Label[] = [
    { fs: LABEL, lines: [name, size] },
    { fs: LABEL, lines: [name, `${l} ×`, w] },
    { fs: LABEL, lines: [`${name} ${size}`] },
    { fs: SMALL, lines: [name, size] },
    { fs: SMALL, lines: [`${name} ${size}`] },
  ];
  return tiers.find((t) => ph >= t.fs * (t.lines.length * 1.2 + 0.3) && t.lines.every((line) => fits(line, pw, t.fs))) ?? null;
}

/** One 4×8 sheet drawn to scale: panels labeled with name and size (or a number keyed below), offcuts and waste shaded. */
const SheetDiagram: React.FC<{ layout: SheetLayout; unit: FurnitureProject['unit']; caption: string }> = ({ layout, unit, caption }) => {
  const hatch = `waste-${React.useId().replace(/:/g, '')}`;
  const fmt = (n: number) => formatSmallLen(n, unit);
  // Identical panels that need a key share one number.
  const keys = new Map<string, number>();
  const panels = layout.panels.map((p) => {
    const label = panelLabel(p.name ?? '', fmt(p.length), fmt(p.width), p.w, p.h);
    const text = `${p.name ? `${p.name} ` : ''}${fmt(p.length)} × ${fmt(p.width)}`;
    let key = 0;
    if (!label) { key = keys.get(text) ?? keys.size + 1; keys.set(text, key); }
    return { p, label, key };
  });
  return (
    <figure data-testid="sheet-diagram" style={{ margin: '10px 0 0' }}>
      <figcaption style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{caption}</figcaption>
      <svg
        viewBox={`-0.5 -0.5 ${SHEET.length + 1} ${SHEET.width + 1}`}
        role="img"
        aria-label={`${caption}: ${layout.panels.map((p) => panelText(p, unit)).join(', ')}`}
        style={{ width: '100%', maxWidth: 440, display: 'block', color: 'inherit' }}
      >
        <defs>
          <pattern id={hatch} width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="3" stroke="currentColor" strokeOpacity="0.14" strokeWidth="0.6" />
          </pattern>
          {/* Hatch only the waste: the panels are cut out of it. */}
          <mask id={`${hatch}-m`}>
            <rect x={0} y={0} width={SHEET.length} height={SHEET.width} fill="white" />
            {layout.panels.map((p, i) => <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h} fill="black" />)}
          </mask>
        </defs>
        <rect x={0} y={0} width={SHEET.length} height={SHEET.width} fill={`url(#${hatch})`} mask={`url(#${hatch}-m)`} />
        <rect x={0} y={0} width={SHEET.length} height={SHEET.width} fill="none" stroke="currentColor" strokeOpacity="0.55" strokeWidth="0.4" />
        {layout.offcuts.map((o, i) => (
          <rect key={`o${i}`} data-testid="sheet-offcut" x={o.x} y={o.y} width={o.w} height={o.h} fill="currentColor" fillOpacity="0.05" stroke="currentColor" strokeOpacity="0.3" strokeWidth="0.25" strokeDasharray="1 1" />
        ))}
        {panels.map(({ p, label, key }, i) => {
          const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
          const fs = label?.fs ?? Math.min(LABEL, p.h * 0.8, p.w * 0.8);
          return (
            <g key={i} data-testid="sheet-panel">
              <rect x={p.x} y={p.y} width={p.w} height={p.h} fill="rgba(224,159,62,0.28)" stroke="#e09f3e" strokeWidth="0.35" />
              <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={fs} fill="currentColor">
                {label
                  ? label.lines.map((line, j) => (
                    <tspan key={j} x={cx} dy={j === 0 ? -((label.lines.length - 1) * fs * 1.2) / 2 : fs * 1.2} fontWeight={j === 0 && p.name && line.startsWith(p.name) ? 600 : 400}>{line}</tspan>
                  ))
                  : (fs >= 1.5 ? key : '')}
              </text>
            </g>
          );
        })}
      </svg>
      {keys.size > 0 && (
        <div data-testid="sheet-key" style={{ ...sub, display: 'flex', flexWrap: 'wrap', gap: '2px 12px', marginTop: 4 }}>
          {[...keys].map(([text, key]) => <span key={key}>{key}: {text}</span>)}
        </div>
      )}
    </figure>
  );
};

/** Sheets to buy per material and thickness, with each sheet's diagram on request. */
const SheetList: React.FC<{ sections: Array<CutListSection & { sheets: SheetNest }>; unit: FurnitureProject['unit'] }> = ({ sections, unit }) => {
  const [show, setShow] = React.useState(false);
  const tap = useReliableTap(() => setShow((v) => !v));
  const len = (n: number) => formatSmallLen(n, unit).replace(/ /g, '\u00a0');
  const any = sections.some((s) => s.sheets.sheets);
  return (
    <section data-testid="cut-sheet-list" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ fontWeight: 700, color: '#e09f3e' }}>Sheets to buy</div>
        {any && (
          <button
            type="button"
            className="glass-button"
            data-testid="sheet-layout-toggle"
            aria-expanded={show}
            onClick={tap}
            onPointerUp={tap}
            style={{ fontSize: 12, padding: '4px 10px', minHeight: 'auto' }}
          >
            {show ? 'Hide sheet layout' : 'Show sheet layout'}
          </button>
        )}
      </div>
      <ul style={{ listStyle: 'none', margin: '6px 0 0', padding: 0, fontSize: 14 }}>
        {sections.filter((s) => s.sheets.sheets).map((s) => (
          <li key={s.title} data-testid="cut-sheet-line" style={{ padding: '3px 0' }}>
            <strong>{s.sheets.sheets} × {s.title}</strong> 4×8
            <span style={{ color: '#9ca3af' }}> · {Math.round(s.sheets.yield * 100)}% used</span>
          </li>
        ))}
      </ul>
      {sections.filter((s) => s.sheets.oversize).map((s) => (
        <div key={`over-${s.title}`} data-testid="cut-sheet-oversize" role="alert" style={{ fontSize: 13, color: '#f87171', marginTop: 4 }}>
          {s.sheets.oversize} {s.title} {s.sheets.oversize === 1 ? 'panel is' : 'panels are'} bigger than a 4×8 sheet ({s.sheets.oversizeParts.map((o) => `${o.name ? `${o.name} ` : ''}${len(o.length)} × ${len(o.width)}`).join(', ')}): join smaller panels or buy oversize stock.
        </div>
      ))}
      {show && sections.map((s) => s.sheets.layouts.map((l, i) => (
        <SheetDiagram
          key={`${s.title}-${i}`}
          layout={l}
          unit={unit}
          caption={`${s.title} · sheet ${i + 1} of ${s.sheets.layouts.length} · ${Math.round(l.used * 100)}% used${sheetHasGrain({ species: s.items[0]?.species ?? 'plywood' }) ? ' · grain along 8 ft' : ''}`}
        />
      )))}
    </section>
  );
};

export const CutListDrawer: React.FC<CutListDrawerProps> = ({ isOpen, onClose }) => {
  const { projects, activeProjectId } = useProjectStore();
  const currentProject = projects.find(p => p.id === activeProjectId);
  const tapExport = useReliableTap(() => { if (currentProject) exportCutListCSV(currentProject); });
  const tapClose = useReliableTap(onClose);

  if (!isOpen || !currentProject) return null;

  const unit = currentProject.unit;
  const cutList = generateCutList(currentProject);
  const sections = cutListSections(cutList, unit);
  const hardware = projectHardware(currentProject);
  const buys = lumberBuyList(sections);
  const sheetBuys = sheetBuyList(sections);
  const hasSheets = sections.some((s) => s.kind === 'sheet');
  const hasLumber = sections.some((s) => s.kind === 'lumber');

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 100,
      background: 'rgba(0,0,0,0.75)',
      backdropFilter: 'blur(12px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24
    }}>
      <div
        className="glass-panel"
        style={{
          width: '100%',
          maxWidth: 680,
          borderRadius: 20,
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          maxHeight: '85vh'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Layers size={24} color="#e09f3e" />
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>Cut List & Bill of Materials</h2>
              <span style={{ fontSize: 12, color: '#9ca3af' }}>{currentProject.name}</span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button type="button" className="glass-button active" data-testid="cut-export-csv" onClick={tapExport} onPointerUp={tapExport}>
              <FileSpreadsheet size={16} /> Export CSV
            </button>

            <button
              type="button"
              className="glass-button"
              aria-label="Close cut list"
              onClick={tapClose}
              onPointerUp={tapClose}
              style={{ padding: 6, minHeight: 'auto', minWidth: 'auto', borderRadius: '50%' }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Buy lists, then the table; all of it scrolls inside the panel */}
        <div data-testid="cut-scroll" style={{ overflow: 'auto', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {buys.length > 0 && <BuyList buys={buys} unit={unit} />}
        {sheetBuys.length > 0 && <SheetList sections={sheetBuys} unit={unit} />}
        <div style={{ overflowX: 'auto', flexShrink: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.15)', color: '#e09f3e' }}>
                <th style={cell}>Part</th>
                <th style={cell}>Length × Width × Thick</th>
                <th style={{ ...cell, textAlign: 'right' }}>Qty</th>
              </tr>
            </thead>
            <tbody>
              {cutList.length === 0 ? (
                <tr>
                  <td colSpan={3} style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>
                    No 3D objects in canvas yet. Add shapes to view cut list.
                  </td>
                </tr>
              ) : (
                sections.map((s) => (
                  <React.Fragment key={`${s.kind}-${s.title}`}>
                    <tr data-testid="cut-material-row">
                      <td colSpan={3} style={{ padding: '14px 12px 6px' }}>
                        <div style={{ fontWeight: 700, color: '#e09f3e' }}>{s.title} · {s.pieces} pcs</div>
                        {s.summary && <div data-testid="cut-buy" style={sub}>{s.summary}</div>}
                      </td>
                    </tr>
                    {s.items.map((item) => <PartRow key={item.id} item={item} unit={unit} />)}
                  </React.Fragment>
                ))
              )}
              {hardware.length > 0 && (
                <>
                  <tr data-testid="cut-hardware-row">
                    <td colSpan={3} style={{ padding: '14px 12px 6px', fontWeight: 700, color: '#e09f3e' }}>Hardware</td>
                  </tr>
                  {hardware.map((h) => (
                    <tr key={h.name} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      <td colSpan={2} style={{ ...cell, fontWeight: 600 }}>{h.name}</td>
                      <td style={{ ...cell, fontWeight: 700, color: '#e09f3e', textAlign: 'right' }}>{h.quantity}</td>
                    </tr>
                  ))}
                </>
              )}
            </tbody>
          </table>
          {cutList.length > 0 && (
            <p data-testid="cut-footnote" style={{ ...sub, padding: '12px 12px 0', lineHeight: 1.5 }}>
              Finished sizes, joinery included. Length runs with the grain.
              {hasSheets && ' Sheets: panels nested on 4×8 with straight-through (guillotine) cuts and a 1/8" kerf; plywood keeps its grain on the 8\' side, MDF may turn.'}
              {hasLumber && ` Board feet use nominal size for 1×2, 2×4 and other dimensional pine, rough thickness for other lumber (3/4" from 4/4).`}
              {buys.length > 0 && ' Dimensional lumber is packed longest-first onto 8, 10 or 12 ft sticks with a 1/8" kerf, picking the length that wastes least.'}
              {sections.some((s) => s.kind === 'lumber' && s.summary.includes('waste')) && ` Other lumber: buy amount adds ${Math.round(LUMBER_WASTE * 100)}%.`}
            </p>
          )}
        </div>
        </div>
      </div>
    </div>
  );
};
