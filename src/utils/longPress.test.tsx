// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { LONG_PRESS_MS, createPress } from './longPress';

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('long press', () => {
  const run = () => {
    vi.useFakeTimers();
    const cb = { onTap: vi.fn(), onLongPress: vi.fn(), onCancel: vi.fn() };
    return { cb, press: createPress(100, 100, cb) };
  };

  it('a quick lift is a tap', () => {
    const { cb, press } = run();
    vi.advanceTimersByTime(200);
    press.up();
    expect(cb.onTap).toHaveBeenCalledOnce();
    expect(cb.onLongPress).not.toHaveBeenCalled();
  });

  it('holding still for 400ms is a long press, and the lift does nothing more', () => {
    const { cb, press } = run();
    press.move(104, 103); // finger jitter
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(cb.onLongPress).toHaveBeenCalledOnce();
    press.up();
    expect(cb.onTap).not.toHaveBeenCalled();
  });

  it('moving first means orbit: no tap, no long press', () => {
    const { cb, press } = run();
    press.move(130, 100);
    vi.advanceTimersByTime(LONG_PRESS_MS * 2);
    press.up();
    expect(cb.onCancel).toHaveBeenCalledOnce();
    expect(cb.onTap).not.toHaveBeenCalled();
    expect(cb.onLongPress).not.toHaveBeenCalled();
  });
});

describe('long-press tip and adding to the selection', () => {
  it('shows once with a part selected, Got it remembers; long-press add toggles a second part and Join appears', async () => {
    localStorage.clear();
    const { useProjectStore } = await import('../state/useProjectStore');
    const { GroupBar } = await import('../components/layout/GroupBar');
    const { useSelectTip } = await import('./longPress');
    const s = () => useProjectStore.getState();
    s().createProject('Tip', 'in');
    s().addObject('board'); s().addObject('board');
    const [a, b] = s().projects.find((p) => p.id === s().activeProjectId)!.objects.slice(-2).map((o) => o.id);
    // Two touching boards: a side and a shelf butting into it.
    useProjectStore.setState((st) => ({ projects: st.projects.map((p) => (p.id === st.activeProjectId ? { ...p, objects: p.objects.map((o) =>
      o.id === a ? { ...o, dimensions: { length: 0.75, height: 30, width: 12 }, position: { x: 0, y: 15, z: 0 }, rotation: { x: 0, y: 0, z: 0 } }
        : o.id === b ? { ...o, dimensions: { length: 24, height: 0.75, width: 12 }, position: { x: 12.375, y: 12.375, z: 0 }, rotation: { x: 0, y: 0, z: 0 } } : o) } : p)) }));
    act(() => s().selectObject(a));
    const r = render(<GroupBar />);
    expect(r.getByTestId('select-tip').textContent).toContain('Tip: long-press another part to add it');
    fireEvent.click(r.getByTestId('select-tip-ok'));
    expect(r.queryByTestId('select-tip')).toBeNull();
    expect(useSelectTip.getState().seen).toBe(true);
    expect(localStorage.getItem('wb.tip.longPressAdd')).toBe('1');
    // What the canvas does on a long press: additive toggle.
    act(() => s().selectObject(b, { additive: true }));
    expect(s().selectedObjectIds).toEqual([a, b]);
    expect(r.getByTestId('multi-join')).toBeTruthy();
    act(() => s().selectObject(b, { additive: true }));
    expect(s().selectedObjectIds).toEqual([a]);
  });
});
