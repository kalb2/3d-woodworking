// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';

afterEach(cleanup);
window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;

const { useProjectStore } = await import('../../state/useProjectStore');
const { useAppStore } = await import('../../state/useAppStore');
const { SidebarNav } = await import('./SidebarNav');
const s = () => useProjectStore.getState();
const objs = () => s().projects.find((p) => p.id === s().activeProjectId)!.objects;

function open() {
  act(() => {
    s().createProject('Add menu', 'in');
    useAppStore.getState().setSidebarPanel('shapes');
    useAppStore.getState().setOverlayOpen('sidebar', true);
  });
  return render(<SidebarNav />);
}

describe('Add menu lumber', () => {
  it('lists 1×2, 2×2, 2×4 and 2×6 under Lumber with real sizes', () => {
    const r = open();
    for (const [id, size] of [['1x2', '96" × 1 1/2" × 3/4"'], ['2x2', '96" × 1 1/2" × 1 1/2"'], ['2x4', '96" × 3 1/2" × 1 1/2"'], ['2x6', '96" × 5 1/2" × 1 1/2"']]) {
      const row = r.getByTestId(`preset-pine_${id}_8ft`);
      expect(row.getAttribute('aria-label')).toBe(`${id.replace('x', '×')} Pine (8 ft)`);
      expect(row.textContent).toContain(size);
    }
    expect(r.getAllByLabelText('2×4 Pine (8 ft)')).toHaveLength(1);
  });

  it('one tap adds one stick (pointerup and its click count once) and closes the sheet', () => {
    const r = open();
    const before = objs().length;
    const row = r.getByTestId('preset-pine_2x2_8ft');
    fireEvent.pointerUp(row);
    fireEvent.click(row);
    expect(objs()).toHaveLength(before + 1);
    expect(objs()[objs().length - 1].dimensions).toEqual({ length: 96, width: 1.5, height: 1.5 });
    expect(useAppStore.getState().overlays.sidebar).toBe(false);
  });
});
