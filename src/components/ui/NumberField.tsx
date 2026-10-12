import React, { useRef, useState } from 'react';

/** Text that is a number in progress: '', '-', '.', '4.', '-0.' are fine while typing. */
export function isPartialNumber(text: string, allowNegative = true): boolean {
  const re = allowNegative ? /^-?\d*\.?\d*$/ : /^\d*\.?\d*$/;
  return re.test(text.trim());
}

/** Parse on commit; null = not a number (revert). Clamp and round only here. */
export function parseCommit(text: string, opts: { min?: number; max?: number; integer?: boolean } = {}): number | null {
  const t = text.trim().replace(',', '.');
  if (t === '' || t === '-' || t === '.' || t === '-.') return null;
  let n = Number(t);
  if (!Number.isFinite(n)) return null;
  if (opts.integer) n = Math.round(n);
  if (opts.min !== undefined) n = Math.max(opts.min, n);
  if (opts.max !== undefined) n = Math.min(opts.max, n);
  return n;
}

/** Clean display: no trailing .0, at most `decimals` places. */
export const cleanNumber = (n: number, decimals = 2) => {
  if (!Number.isFinite(n)) return '';
  const f = 10 ** decimals;
  return String(Math.round(n * f) / f);
};

export interface NumberFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'min' | 'max'> {
  /** Current value in display units. */
  value: number;
  /** Called once per edit, on blur or Enter/Done, with the clamped number. */
  onCommit: (value: number) => void;
  min?: number;
  max?: number;
  integer?: boolean;
  /** Display formatter when not editing. */
  format?: (value: number) => string;
  testId?: string;
  ref?: React.Ref<HTMLInputElement>;
}

/**
 * Number input that never fights the keyboard: while focused it keeps your
 * text as typed; it commits (clamped) on blur or Enter, and Escape reverts.
 * Uses type="text" + inputMode so iOS shows a decimal keypad and React never
 * reformats mid-typing.
 */
export const NumberField: React.FC<NumberFieldProps> = ({
  value, onCommit, min, max, integer, format, testId, onFocus, onBlur, onKeyDown, ref, ...rest
}) => {
  const [draft, setDraft] = useState<string | null>(null);
  const skipCommit = useRef(false);
  const shown = format ? format(value) : cleanNumber(value);
  const allowNegative = min === undefined || min < 0;

  const commit = () => {
    const text = draft;
    setDraft(null);
    if (text === null) return;
    const n = parseCommit(text, { min, max, integer });
    if (n === null) return;
    if (Math.abs(n - value) > 1e-9) onCommit(n);
  };

  return (
    <input
      {...rest}
      ref={ref}
      type="text"
      inputMode={integer ? 'numeric' : 'decimal'}
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      enterKeyHint="done"
      data-testid={testId}
      value={draft ?? shown}
      onFocus={(e) => {
        setDraft(shown);
        const el = e.currentTarget;
        // Select all so the first keystroke replaces the value (iOS needs a tick).
        el.select();
        setTimeout(() => { if (document.activeElement === el) el.select(); }, 0);
        onFocus?.(e);
      }}
      onChange={(e) => {
        const t = e.target.value;
        if (isPartialNumber(t.replace(',', '.'), allowNegative)) setDraft(t);
      }}
      onBlur={(e) => {
        if (skipCommit.current) { skipCommit.current = false; setDraft(null); }
        else commit();
        onBlur?.(e);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { commit(); e.currentTarget.blur(); }
        else if (e.key === 'Escape') { skipCommit.current = true; setDraft(null); e.currentTarget.blur(); }
        onKeyDown?.(e);
      }}
    />
  );
};
