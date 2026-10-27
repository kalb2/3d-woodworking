// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { LengthField } from './LengthField';

afterEach(cleanup);

describe('LengthField', () => {
  it('shows 23 5/8", takes a typed fraction and returns inches', () => {
    const onCommit = vi.fn();
    const r = render(<LengthField testId="f" aria-label="Width" inches={23.625} unit="in" onCommit={onCommit} />);
    const f = r.getByTestId('f') as HTMLInputElement;
    expect(f.value).toBe('23 5/8"');
    fireEvent.focus(f);
    expect(r.getByTestId('fraction-bar')).toBeTruthy();
    fireEvent.change(f, { target: { value: '24 1/16' } });
    fireEvent.blur(f);
    expect(onCommit).toHaveBeenCalledWith(24.0625);
  });
  it('opening and closing the field without typing never rounds an off-grid value', () => {
    const onCommit = vi.fn();
    const r = render(<LengthField testId="f" aria-label="Width" inches={19 / 25.4} unit="in" onCommit={onCommit} />);
    const f = r.getByTestId('f') as HTMLInputElement;
    expect(f.value).toBe('3/4"');
    fireEvent.focus(f);
    fireEvent.blur(f);
    expect(onCommit).not.toHaveBeenCalled();
  });
  it('feet projects edit in inches (same as the joint and template sheets)', () => {
    const onCommit = vi.fn();
    const r = render(<LengthField testId="f" aria-label="Height" inches={30.5} unit="ft" onCommit={onCommit} />);
    const f = r.getByTestId('f') as HTMLInputElement;
    expect(f.value).toBe('30 1/2"');
    fireEvent.focus(f);
    fireEvent.change(f, { target: { value: '36' } });
    fireEvent.blur(f);
    expect(onCommit).toHaveBeenCalledWith(36);
  });
  it('metric shows whole mm with the unit and no fraction bar', () => {
    const onCommit = vi.fn();
    const r = render(<LengthField testId="f" aria-label="Depth" inches={24} unit="mm" onCommit={onCommit} />);
    const f = r.getByTestId('f') as HTMLInputElement;
    expect(f.value).toBe('610');
    expect(r.container.textContent).toContain('mm');
    fireEvent.focus(f);
    expect(r.queryByTestId('fraction-bar')).toBeNull();
    fireEvent.change(f, { target: { value: '300' } });
    fireEvent.blur(f);
    expect(onCommit.mock.calls[0][0]).toBeCloseTo(300 / 25.4, 6);
  });
  it('allows negative offsets when there is no lower limit', () => {
    const onCommit = vi.fn();
    const r = render(<LengthField testId="f" aria-label="X offset" inches={2} unit="in" onCommit={onCommit} />);
    const f = r.getByTestId('f') as HTMLInputElement;
    fireEvent.focus(f);
    fireEvent.change(f, { target: { value: '-1 1/4' } });
    fireEvent.blur(f);
    expect(onCommit).toHaveBeenCalledWith(-1.25);
  });
});
