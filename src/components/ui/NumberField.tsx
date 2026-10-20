import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useReliableTap } from '../../utils/reliableTap';

/** Text that is a number in progress: '', '-', '.', '4.', '-0.' are fine while typing. */
export function isPartialNumber(text: string, allowNegative = true): boolean {
  const re = allowNegative ? /^-?\d*\.?\d*$/ : /^\d*\.?\d*$/;
  return re.test(text.trim());
}

/** Text that is a fraction in progress: '3/', '1 1/4', '1-1/', '3/4"'. */
export function isPartialFraction(text: string): boolean {
  return /^\d*(\.\d*)?([ -]?\d*(\/\d*)?)?"?$/.test(text.trim());
}

/** '3/4' → 0.75, '1 1/4' or '1-1/4' → 1.25, '1.5"' → 1.5; null when not a number. */
export function parseFraction(text: string): number | null {
  const t = text.trim().replace(/"$/, '').trim().replace(',', '.');
  const m = /^(?:(\d+)[ -])?(\d+)\/(\d+)$/.exec(t);
  if (m) {
    const den = Number(m[3]);
    if (!den) return null;
    return (m[1] ? Number(m[1]) : 0) + Number(m[2]) / den;
  }
  if (t === '' || t === '-' || t === '.' || t === '-.') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Parse on commit; null = not a number (revert). Clamp and round only here. */
export function parseCommit(text: string, opts: { min?: number; max?: number; integer?: boolean; fractions?: boolean } = {}): number | null {
  const t = text.trim().replace(',', '.');
  if (t === '' || t === '-' || t === '.' || t === '-.') return null;
  let n = opts.fractions ? (parseFraction(t) ?? NaN) : Number(t);
  if (!Number.isFinite(n)) return null;
  if (opts.integer) n = Math.round(n);
  if (opts.min !== undefined) n = Math.max(opts.min, n);
  if (opts.max !== undefined) n = Math.min(opts.max, n);
  return n;
}

/** The fractions offered above the keypad. */
export const FRACTIONS = ['1/16', '1/8', '1/4', '3/8', '1/2', '5/8', '3/4', '7/8'] as const;

/**
 * Text after tapping a fraction: '' → '3/4', '1' → '1 3/4', '1 1/4' → '1 3/4' (swaps the fraction),
 * '1.5' → '1 3/4' (keeps the whole number). `replace` = the old text was all selected.
 */
export function addFraction(text: string, frac: string, replace = false): string {
  if (replace) return frac;
  const t = text.trim().replace(/"$/, '').trim();
  const whole = /^(\d+)/.exec(t)?.[1];
  if (!whole || /^\d+\/\d*$/.test(t)) return frac;
  return whole === '0' ? frac : `${whole} ${frac}`;
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
  /** Accept imperial fractions ('3/4', '1 1/4'). */
  fractions?: boolean;
  /** Called while typing with the number so far (null = not a number yet), for live previews. */
  onPreview?: (value: number | null) => void;
}

/**
 * Number input that never fights the keyboard: while focused it keeps your
 * text as typed; it commits (clamped) on blur or Enter, and Escape reverts.
 * Uses type="text" + inputMode so iOS shows a decimal keypad and React never
 * reformats mid-typing.
 */
export const NumberField: React.FC<NumberFieldProps> = ({
  value, onCommit, min, max, integer, format, testId, onFocus, onBlur, onKeyDown, ref, fractions, onPreview, ...rest
}) => {
  const [draft, setDraft] = useState<string | null>(null);
  const skipCommit = useRef(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const setRef = (el: HTMLInputElement | null) => {
    inputRef.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = el;
  };
  const shown = format ? format(value) : cleanNumber(value);
  const allowNegative = min === undefined || min < 0;

  const commit = () => {
    const text = draft;
    setDraft(null);
    onPreview?.(null);
    if (text === null) return;
    const n = parseCommit(text, { min, max, integer, fractions });
    if (n === null) return;
    if (Math.abs(n - value) > 1e-9) onCommit(n);
  };

  const pickFraction = (frac: string) => {
    const el = inputRef.current;
    const text = draft ?? shown;
    const all = !!el && text.length > 0 && el.selectionStart === 0 && el.selectionEnd === el.value.length;
    const next = addFraction(text, frac, all);
    setDraft(next);
    if (onPreview) onPreview(parseCommit(next, { min, max, integer, fractions }));
    if (el) requestAnimationFrame(() => { if (document.activeElement === el) el.setSelectionRange(next.length, next.length); });
  };

  const input = (
    <input
      {...rest}
      ref={setRef}
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
        const okText = fractions ? isPartialFraction(t.replace(',', '.')) : isPartialNumber(t.replace(',', '.'), allowNegative);
        if (!okText) return;
        setDraft(t);
        if (onPreview) {
          const n = parseCommit(t, { min, max, integer, fractions });
          onPreview(n);
        }
      }}
      onBlur={(e) => {
        if (skipCommit.current) { skipCommit.current = false; setDraft(null); onPreview?.(null); }
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
  if (!fractions) return input;
  const label = typeof rest['aria-label'] === 'string' ? rest['aria-label'] : '';
  return <>{input}{draft !== null && <FractionBar label={label} text={draft} input={inputRef} onPick={pickFraction} />}</>;
};

/** Keep the field focused (and the keypad up) when a chip is pressed. */
const keepFocus = (e: React.SyntheticEvent) => e.preventDefault();

const FractionChip: React.FC<{ frac: string; onPick: (f: string) => void }> = ({ frac, onPick }) => {
  const tap = useReliableTap(() => onPick(frac));
  return (
    <button type="button" className="fraction-chip" data-testid={`fraction-${frac.replace('/', '-')}`} aria-label={`Add ${frac} inch`}
      onPointerDown={keepFocus} onMouseDown={keepFocus} onTouchEnd={(e) => { keepFocus(e); tap(e); }} onPointerUp={tap} onClick={tap}>{frac}</button>
  );
};

/** A row of fractions that sits on top of the number keypad while an inch field is being edited. */
const FractionBar: React.FC<{ label: string; text: string; input: React.RefObject<HTMLInputElement | null>; onPick: (f: string) => void }> = ({ label, text, input, onPick }) => {
  const [bottom, setBottom] = useState(0);
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    // Sit just above the keyboard: the gap between the visual and layout viewport bottoms.
    const place = () => {
      setBottom(Math.max(0, window.innerHeight - (vv.offsetTop + vv.height)));
      // Scroll the field above the bar when its sheet can.
      const el = input.current, bar = barRef.current;
      if (!el || !bar) return;
      const over = el.getBoundingClientRect().bottom - (vv.offsetTop + vv.height - bar.offsetHeight) + 12;
      let box: HTMLElement | null = el.parentElement;
      while (box && !/(auto|scroll)/.test(getComputedStyle(box).overflowY)) box = box.parentElement;
      if (over > 0 && box) box.scrollTop += over;
    };
    place();
    vv.addEventListener('resize', place);
    vv.addEventListener('scroll', place);
    return () => { vv.removeEventListener('resize', place); vv.removeEventListener('scroll', place); };
  }, [input]);
  return createPortal(
    <div className="fraction-bar" data-testid="fraction-bar" role="group" aria-label="Add a fraction" style={{ bottom }} ref={barRef}
      onPointerDown={keepFocus} onMouseDown={keepFocus}>
      {/* What is being typed, in case the keyboard covers the field. */}
      <div className="fraction-readout" data-testid="fraction-readout" aria-hidden="true">
        <span>{label}</span><b>{text || ' '}</b>
      </div>
      <div className="fraction-chips">
        {FRACTIONS.map((f) => <FractionChip key={f} frac={f} onPick={onPick} />)}
      </div>
    </div>,
    document.body,
  );
};
