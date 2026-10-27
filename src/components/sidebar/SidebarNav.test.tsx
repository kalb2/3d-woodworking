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

  it('a Length choice offers 8, 10 and 12 ft lumber, 8 ft by default', () => {
    const r = open();
    const group = r.getByRole('radiogroup', { name: 'Lumber length' });
    expect(group.querySelectorAll('[role=radio]')).toHaveLength(3);
    expect(r.getByTestId('lumber-length-8ft').getAttribute('aria-checked')).toBe('true');
    const ten = r.getByTestId('lumber-length-10ft');
    fireEvent.pointerUp(ten);
    fireEvent.click(ten);
    expect(ten.getAttribute('aria-checked')).toBe('true');
    const row = r.getByTestId('preset-pine_2x6_8ft');
    expect(row.getAttribute('aria-label')).toBe('2×6 Pine (10 ft)');
    expect(row.textContent).toContain('120" × 5 1/2" × 1 1/2"');
    // sheet goods keep their size
    expect(r.getByTestId('preset-plywood_4x8_3_4').textContent).toContain('96" × 48" × 3/4"');
    const before = objs().length;
    fireEvent.pointerUp(row);
    fireEvent.click(row);
    expect(objs()).toHaveLength(before + 1);
    const added = objs()[objs().length - 1];
    expect(added.dimensions).toEqual({ length: 120, width: 5.5, height: 1.5 });
    expect(added.name).toMatch(/^2×6 Pine \(10 ft\)/);
  });

  it('the length goes back to 8 ft when the panel opens again', () => {
    const r = open();
    fireEvent.click(r.getByTestId('lumber-length-12ft'));
    expect(r.getByTestId('preset-pine_2x4_8ft').getAttribute('aria-label')).toBe('2×4 Pine (12 ft)');
    act(() => useAppStore.getState().setOverlayOpen('sidebar', false));
    act(() => useAppStore.getState().setOverlayOpen('sidebar', true));
    expect(r.getByTestId('lumber-length-8ft').getAttribute('aria-checked')).toBe('true');
    expect(r.getByTestId('preset-pine_2x4_8ft').getAttribute('aria-label')).toBe('2×4 Pine (8 ft)');
  });
});
