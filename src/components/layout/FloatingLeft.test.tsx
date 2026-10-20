// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';

afterEach(cleanup);
window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;

const { useProjectStore } = await import('../../state/useProjectStore');
const { useAppStore } = await import('../../state/useAppStore');
const { FloatingLeft } = await import('./FloatingLeft');
const { EditorOverflowList } = await import('./EditorOverflow');
const { ObjectInspector } = await import('../inspector/ObjectInspector');
const s = () => useProjectStore.getState();
const later = (fn: () => void) => { const t = performance.now() + 1000; const spy = vi.spyOn(performance, 'now').mockReturnValue(t); fn(); spy.mockRestore(); };

describe('Properties button (bottom-left)', () => {
  it('always shows in the editor; tap opens Properties, tap again closes', () => {
    s().createProject('Props', 'in');
    act(() => s().selectObject(null));
    useAppStore.getState().setOverlayOpen('inspector', false);
    const r = render(<FloatingLeft placement="phone" />);
    const btn = r.getByTestId('properties-fab');
    expect(btn.textContent).toBe('Properties');
    fireEvent.click(btn);
    expect(useAppStore.getState().overlays.inspector).toBe(true);
    expect(r.getByTestId('properties-fab').getAttribute('aria-pressed')).toBe('true');
    later(() => fireEvent.click(r.getByTestId('properties-fab')));
    expect(useAppStore.getState().overlays.inspector).toBe(false);
  });
});

describe('Properties sheet', () => {
  it('opens on Project with nothing selected, and on the part when one is', () => {
    s().createProject('Sheet', 'in');
    act(() => s().selectObject(null));
    act(() => useAppStore.getState().setOverlayOpen('inspector', true));
    const r = render(<ObjectInspector />);
    expect(r.getByTestId('props-project')).toBeTruthy();
    expect(r.queryByTestId('props-tab-part')).toBeNull();
    // Project settings live here now.
    expect(r.getByTestId('style-clean')).toBeTruthy();
    expect(r.getByTestId('project-units-mm')).toBeTruthy();
    expect(r.getByTestId('tool-magnet')).toBeTruthy();
    act(() => { s().addObject('board'); });
    const id = s().projects.find((p) => p.id === s().activeProjectId)!.objects.slice(-1)[0].id;
    act(() => s().selectObject(id));
    expect(r.getByTestId('props-tab-part').getAttribute('aria-selected')).toBe('true');
    expect(r.getByTestId('part-name')).toBeTruthy();
    expect(r.queryByTestId('props-project')).toBeNull();
    fireEvent.click(r.getByTestId('props-tab-project'));
    expect(r.getByTestId('props-project')).toBeTruthy();
  });

  it('units and style change from Project', () => {
    s().createProject('Units', 'in');
    act(() => s().selectObject(null));
    act(() => useAppStore.getState().setOverlayOpen('inspector', true));
    const r = render(<ObjectInspector />);
    fireEvent.click(r.getByTestId('project-units-mm'));
    expect(s().projects.find((p) => p.id === s().activeProjectId)!.unit).toBe('mm');
    later(() => fireEvent.click(r.getByTestId('style-clean')));
    expect(useAppStore.getState().preferences.viewStyle).toBe('clean');
  });
});

describe('••• menu', () => {
  it('keeps only export/share and cross-project items', () => {
    s().createProject('Menu', 'in');
    s().addObject('board');
    const r = render(<EditorOverflowList onOpenCutList={() => {}} onShareProject={() => {}} onClose={() => {}} />);
    for (const gone of ['overlay-launch-properties', 'menu-view-style', 'tool-settings', 'menu-measure', 'menu-parts', 'menu-rename', 'menu-select-area', 'menu-square-walls'])
      expect(r.queryByTestId(gone)).toBeNull();
    for (const kept of ['menu-cut-list', 'menu-share', 'menu-export-csv', 'menu-export-png', 'menu-export-json', 'menu-templates'])
      expect(r.getByTestId(kept)).toBeTruthy();
  });
});

describe('phone dock while Properties is open', () => {
  it('hides the transform bar, and brings it back on close', async () => {
    const { PhoneBottomSheet } = await import('./PhoneCanvasChrome');
    s().createProject('Dock', 'in');
    act(() => useAppStore.getState().setOverlayOpen('inspector', false));
    const r = render(<PhoneBottomSheet />);
    expect(r.queryByTestId('transform-menu')).toBeTruthy();
    act(() => useAppStore.getState().setOverlayOpen('inspector', true));
    expect(r.queryByTestId('transform-menu')).toBeNull();
    act(() => useAppStore.getState().setOverlayOpen('inspector', false));
    expect(r.queryByTestId('transform-menu')).toBeTruthy();
  });
});
