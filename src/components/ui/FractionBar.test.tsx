// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { NumberField, addFraction } from './NumberField';

afterEach(cleanup);

describe('addFraction', () => {
  it('builds mixed numbers from the keypad + a chip', () => {
    expect(addFraction('', '3/4')).toBe('3/4');
    expect(addFraction('1', '1/4')).toBe('1 1/4');
    expect(addFraction('12', '1/2')).toBe('12 1/2');
    expect(addFraction('1 1/4', '3/8')).toBe('1 3/8');
    expect(addFraction('1/4', '1/8')).toBe('1/8');
    expect(addFraction('1.5', '3/4')).toBe('1 3/4');
    expect(addFraction('0', '3/4')).toBe('3/4');
    expect(addFraction('3/4"', '1/2', true)).toBe('1/2');
  });
});

describe('Fraction fields', () => {
  it('use the decimal keypad and show a fraction row only while editing', () => {
    const onCommit = vi.fn();
    const r = render(<NumberField value={0.75} fractions testId="f" onCommit={onCommit} />);
    const input = r.getByTestId('f') as HTMLInputElement;
    expect(input.getAttribute('inputmode')).toBe('decimal');
    expect(r.queryByTestId('fraction-bar')).toBeNull();
    fireEvent.focus(input);
    const bar = r.getByTestId('fraction-bar');
    expect([...bar.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['1/16', '1/8', '1/4', '3/8', '1/2', '5/8', '3/4', '7/8']);
    fireEvent.change(input, { target: { value: '2' } });
    fireEvent.click(r.getByTestId('fraction-3-8'));
    expect(input.value).toBe('2 3/8');
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith(2.375);
    expect(r.queryByTestId('fraction-bar')).toBeNull();
  });

  it('pressing a chip does not take focus from the field', () => {
    const r = render(<NumberField value={1} fractions testId="f" onCommit={() => {}} />);
    const input = r.getByTestId('f') as HTMLInputElement;
    fireEvent.focus(input);
    const chip = r.getByTestId('fraction-1-2');
    expect(fireEvent.mouseDown(chip)).toBe(false); // default prevented
    expect(fireEvent.pointerDown(chip)).toBe(false);
  });

  it('a chip replaces a fully selected value', () => {
    const onPreview = vi.fn();
    const r = render(<NumberField value={0.75} fractions testId="f" onCommit={() => {}} onPreview={onPreview} />);
    const input = r.getByTestId('f') as HTMLInputElement;
    input.focus(); fireEvent.focus(input);
    input.setSelectionRange(0, input.value.length);
    fireEvent.click(r.getByTestId('fraction-1-2'));
    expect(input.value).toBe('1/2');
    expect(onPreview).toHaveBeenLastCalledWith(0.5);
  });

  it('plain number fields have no fraction row', () => {
    const r = render(<NumberField value={1} testId="f" onCommit={() => {}} />);
    fireEvent.focus(r.getByTestId('f'));
    expect(r.queryByTestId('fraction-bar')).toBeNull();
  });
});
