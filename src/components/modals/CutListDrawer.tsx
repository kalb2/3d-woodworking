import React from 'react';
import { Layers, FileSpreadsheet, X } from 'lucide-react';
import { useProjectStore } from '../../state/useProjectStore';
import { generateCutList, exportCutListCSV, cutListSections, projectHardware, type CutListItem } from '../../utils/exportUtils';
import { formatLens, formatSmallLen } from '../../utils/lengthFormat';
import { LUMBER_WASTE } from '../../utils/stock';
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

        {/* Table */}
        <div style={{ overflowX: 'auto', flex: 1 }}>
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
              {hasSheets && ' Sheets: parts nested on 4×8 with a 1/8" kerf; plywood keeps its grain on the 8\' side.'}
              {hasLumber && ` Board feet use nominal size for 1×2, 2×4 and other dimensional pine, rough thickness for other lumber (3/4" from 4/4); buy amount adds ${Math.round(LUMBER_WASTE * 100)}%.`}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
