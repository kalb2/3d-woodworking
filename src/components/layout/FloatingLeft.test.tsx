// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';

afterEach(cleanup);

const { useProjectStore } = await import('../../state/useProjectStore');
const { useAppStore } = await import('../../state/useAppStore');
const { FloatingLeft } = await import('./FloatingLeft');
const { EditorOverflowList } = await import('./EditorOverflow');
const s = () => useProjectStore.getState();

describe('Properties button (bottom-left)', () => {
  it('only shows with a selection; tap opens Properties, tap again closes', () => {
    s().createProject('Props', 'in');
    s().addObject('board');
    act(() => s().selectObject(null));
    const r = render(<FloatingLeft placement="phone" />);
    expect(r.queryByTestId('properties-fab')).toBeNull(); // no ghost button
    const id = s().projects.find((p) => p.id === s().activeProjectId)!.objects.slice(-1)[0].id;
    act(() => s().selectObject(id));
    const btn = r.getByTestId('properties-fab');
    expect(btn.textContent).toBe('Properties');
    fireEvent.click(btn);
    expect(useAppStore.getState().overlays.inspector).toBe(true);
    expect(r.getByTestId('properties-fab').getAttribute('aria-pressed')).toBe('true');
    // A second, separate tap (taps within 400ms are one gesture).
    const later = performance.now() + 1000;
    const spy = vi.spyOn(performance, 'now').mockReturnValue(later);
    fireEvent.click(r.getByTestId('properties-fab'));
    spy.mockRestore();
    expect(useAppStore.getState().overlays.inspector).toBe(false);
  });

  it('is the only entry point: the ••• menu no longer lists Properties', () => {
    s().createProject('Menu', 'in');
    s().addObject('board');
    const r = render(<EditorOverflowList onOpenCutList={() => {}} onShareProject={() => {}} onClose={() => {}} />);
    expect(r.queryByTestId('overlay-launch-properties')).toBeNull();
    expect(r.queryByText('Properties')).toBeNull();
  });
});
