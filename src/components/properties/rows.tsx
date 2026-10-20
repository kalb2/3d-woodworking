import React from 'react';
import { ChevronRight } from 'lucide-react';
import { useReliableTap } from '../../utils/reliableTap';

/** Shared building blocks so every Properties row has the same height, padding and alignment. */
export const Section: React.FC<{ title: string; testId?: string; children: React.ReactNode }> = ({ title, testId, children }) => (
  <section className="props-section" data-testid={testId}>
    <h3 className="props-kicker">{title}</h3>
    <div className="props-card">{children}</div>
  </section>
);

export const Row: React.FC<{ label: string; children?: React.ReactNode; testId?: string }> = ({ label, children, testId }) => (
  <div className="props-row" data-testid={testId}>
    <span className="props-label">{label}</span>
    <span className="props-value">{children}</span>
  </div>
);

export const SwitchRow: React.FC<{ label: string; on: boolean; onToggle: () => void; testId: string }> = ({ label, on, onToggle, testId }) => {
  const tap = useReliableTap(onToggle);
  return (
    <button type="button" className="props-row is-button" role="switch" aria-checked={on} aria-label={label}
      data-testid={testId} onClick={tap} onPointerUp={tap}>
      <span className="props-label">{label}</span>
      <span className={`menu-switch${on ? ' is-on' : ''}`} aria-hidden="true"><span /></span>
    </button>
  );
};

export const ActionRow: React.FC<{ label: string; icon: React.ReactNode; onTap: () => void; testId: string; disabled?: boolean }> = ({ label, icon, onTap, testId, disabled }) => {
  const tap = useReliableTap(onTap);
  return (
    <button type="button" className="props-row is-button is-action" data-testid={testId} disabled={disabled} onClick={tap} onPointerUp={tap}>
      <span className="props-action-icon" aria-hidden="true">{icon}</span>
      <span className="props-label">{label}</span>
      <ChevronRight size={16} className="props-chevron" aria-hidden="true" />
    </button>
  );
};

export function Seg<T extends string>({ value, options, onChange, label, testId }: {
  value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string; testId: string;
}) {
  return (
    <span className="props-seg" role="group" aria-label={label} data-testid={testId}>
      {options.map((o) => (
        <SegButton key={o.id} on={o.id === value} label={o.label} testId={`${testId}-${o.id}`} onTap={() => onChange(o.id)} />
      ))}
    </span>
  );
}

const SegButton: React.FC<{ on: boolean; label: string; testId: string; onTap: () => void }> = ({ on, label, testId, onTap }) => {
  const tap = useReliableTap(onTap);
  return (
    <button type="button" className={on ? 'is-on' : ''} aria-pressed={on} data-testid={testId} onClick={tap} onPointerUp={tap}>{label}</button>
  );
};
