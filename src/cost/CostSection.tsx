import React from 'react';
import { useReliableTap } from '../utils/reliableTap';
import { costTotals } from '../utils/exportUtils';
import { EXAMPLE_NOTE, formatMoney, type ProjectCost } from './cost';

const muted: React.CSSProperties = { color: '#9ca3af' };
const qty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** The buy list priced: one line per thing to buy, then extras and the total. Prices are edited behind one button. */
export const CostSection: React.FC<{ cost: ProjectCost; onEditPrices: () => void }> = ({ cost, onEditPrices }) => {
  const tapEdit = useReliableTap(onEditPrices);
  return (
    <section data-testid="cut-cost" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ fontWeight: 700, color: '#e09f3e' }}>Cost</div>
        <button
          type="button"
          className="glass-button"
          data-testid="cost-edit-prices"
          onClick={tapEdit}
          onPointerUp={tapEdit}
          style={{ fontSize: 12, padding: '4px 10px', minHeight: 'auto' }}
        >
          Edit prices
        </button>
      </div>
      <ul style={{ listStyle: 'none', margin: '6px 0 0', padding: 0, fontSize: 14 }}>
        {cost.lines.map((l, i) => (
          <li key={`${l.label}-${i}`} data-testid="cost-line" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '3px 0' }}>
            <span>
              {l.label}
              <span style={muted}> · {qty(l.quantity)} {l.unit === 'bd ft' ? 'bd ft' : '×'}{l.unitPrice != null ? ` ${l.unit === 'bd ft' ? '× ' : ''}${formatMoney(l.unitPrice)}` : ''}</span>
            </span>
            <span data-testid="cost-line-total" style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', ...(l.total == null ? muted : {}) }}>
              {l.total == null ? 'no price' : formatMoney(l.total)}
            </span>
          </li>
        ))}
      </ul>
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: 6, paddingTop: 6, fontSize: 14 }}>
        {costTotals(cost).map(([label, amount]) => (
          <div
            key={label}
            data-testid={label === 'Total' ? 'cost-total' : 'cost-extra'}
            style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontVariantNumeric: 'tabular-nums', ...(label === 'Total' ? { fontWeight: 700, fontSize: 16 } : muted) }}
          >
            <span>{label}</span><span>{formatMoney(amount)}</span>
          </div>
        ))}
      </div>
      {(cost.anyExample || cost.unpriced > 0) && (
        <div data-testid="cost-note" style={{ ...muted, fontSize: 12, marginTop: 4, lineHeight: 1.45 }}>
          {cost.anyExample && EXAMPLE_NOTE}
          {cost.anyExample && cost.unpriced > 0 && ' '}
          {cost.unpriced > 0 && `${cost.unpriced} ${cost.unpriced === 1 ? 'line has' : 'lines have'} no price and ${cost.unpriced === 1 ? 'is' : 'are'} left out of the total.`}
        </div>
      )}
    </section>
  );
};
