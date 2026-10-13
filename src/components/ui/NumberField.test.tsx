// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { NumberField, cleanNumber, isPartialNumber, parseCommit } from './NumberField';

afterEach(cleanup);

const setup = (props: Partial<React.ComponentProps<typeof NumberField>> = {}) => {
  const onCommit = vi.fn();
  const r = render(<NumberField value={12} onCommit={onCommit} testId="f" {...props} />);
  const input = r.getByTestId('f') as HTMLInputElement;
  return { input, onCommit, r };
};
const type = (input: HTMLInputElement, text: string) => fireEvent.change(input, { target: { value: text } });

describe('helpers', () => {
  it('accepts partial numbers while typing', () => {
    for (const t of ['', '.', '4', '4.', '4.5', '-', '-0.', '0.25']) expect(isPartialNumber(t)).toBe(true);
    for (const t of ['4a', '1..2', '--1', 'e5']) expect(isPartialNumber(t)).toBe(false);
    expect(isPartialNumber('-1', false)).toBe(false);
  });
  it('parses and clamps on commit only', () => {
    expect(parseCommit('44')).toBe(44);
    expect(parseCommit('4.')).toBe(4);
    expect(parseCommit('')).toBeNull();
    expect(parseCommit('.')).toBeNull();
    expect(parseCommit('0.01', { min: 0.05 })).toBe(0.05);
    expect(parseCommit('500', { max: 360 })).toBe(360);
    expect(parseCommit('2.6', { integer: true })).toBe(3);
    expect(parseCommit('1,5')).toBe(1.5);
  });
  it('formats cleanly', () => {
    expect(cleanNumber(24)).toBe('24');
    expect(cleanNumber(0.755)).toBe('0.76');
    expect(cleanNumber(1.5)).toBe('1.5');
  });
});

describe('NumberField', () => {
  it('lets you type 44 digit by digit without committing or clamping each keystroke', () => {
    const { input, onCommit } = setup({ min: 1 });
    fireEvent.focus(input);
    type(input, '');
    expect(input.value).toBe('');
    type(input, '4');
    expect(input.value).toBe('4');
    type(input, '44');
    expect(input.value).toBe('44');
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(44);
  });

  it('keeps partial input like "4." and "." while typing', () => {
    const { input } = setup();
    fireEvent.focus(input);
    type(input, '.');
    expect(input.value).toBe('.');
    type(input, '4.');
    expect(input.value).toBe('4.');
    type(input, '4.5');
    expect(input.value).toBe('4.5');
  });

  it('ignores letters', () => {
    const { input } = setup();
    fireEvent.focus(input);
    type(input, '4');
    type(input, '4x');
    expect(input.value).toBe('4');
  });

  it('commits on Enter (keyboard Done) and clamps only then', () => {
    const { input, onCommit } = setup({ min: 0.5, max: 96 });
    fireEvent.focus(input);
    type(input, '0.1');
    expect(input.value).toBe('0.1');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith(0.5);
  });

  it('Escape reverts without committing', () => {
    const { input, onCommit } = setup();
    fireEvent.focus(input);
    type(input, '99');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onCommit).not.toHaveBeenCalled();
    expect(input.value).toBe('12');
  });

  it('empty or unchanged input reverts silently', () => {
    const { input, onCommit } = setup();
    fireEvent.focus(input);
    type(input, '');
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
    expect(input.value).toBe('12');
    fireEvent.focus(input);
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('shows the new value from props when not editing, and uses a decimal keypad', () => {
    const { input, r, onCommit } = setup({ format: (v) => v.toFixed(1) });
    expect(input.value).toBe('12.0');
    r.rerender(<NumberField value={30} onCommit={onCommit} testId="f" format={(v) => v.toFixed(1)} />);
    expect(input.value).toBe('30.0');
    expect(input.getAttribute('inputmode')).toBe('decimal');
    expect(input.type).toBe('text');
  });

  it('does not let prop updates clobber text while focused', () => {
    const { input, r, onCommit } = setup();
    fireEvent.focus(input);
    type(input, '4');
    r.rerender(<NumberField value={13} onCommit={onCommit} testId="f" />);
    expect(input.value).toBe('4');
  });
});
