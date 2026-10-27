// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import type { FurnitureObject } from '../types/furniture';
import { PRESET_WOOD_MATERIALS } from '../utils/woodTextureGenerator';

afterEach(cleanup);

const { useProjectStore } = await import('../state/useProjectStore');
const { usePriceStore } = await import('./usePriceStore');
const { CutListDrawer } = await import('../components/modals/CutListDrawer');
const s = () => useProjectStore.getState();
const proj = () => s().projects.find((p) => p.id === s().activeProjectId)!;
let tick = 0;
const tap = (el: Element) => { const spy = vi.spyOn(performance, 'now').mockReturnValue(performance.now() + 1000 * ++tick); fireEvent.click(el); spy.mockRestore(); };
const type = (el: Element, v: string) => { fireEvent.change(el, { target: { value: v } }); fireEvent.blur(el); };

function seed(patches: Partial<FurnitureObject>[]) {
  act(() => s().createProject('Bench', 'in'));
  for (let i = 0; i < patches.length; i++) act(() => s().addObject('board'));
  useProjectStore.setState((st) => ({
    projects: st.projects.map((p) => (p.id === st.activeProjectId ? { ...p, objects: p.objects.slice(-patches.length).map((o, i) => ({ ...o, ...patches[i] })) } : p)),
  }));
}

describe('Cut list → Cost and Prices', () => {
  it('shows line costs and a total with the example note; Edit prices changes this device’s list', () => {
    act(() => usePriceStore.getState().resetDevice());
    seed([
      { name: 'Leg', dimensions: { length: 30, width: 3.5, height: 1.5 }, material: { ...PRESET_WOOD_MATERIALS.pine } },
      { name: 'Top', dimensions: { length: 40, width: 20, height: 0.75 }, material: { ...PRESET_WOOD_MATERIALS.plywood } },
    ]);
    const r = render(<CutListDrawer isOpen onClose={() => {}} />);
    const lines = r.getAllByTestId('cost-line').map((e) => e.textContent);
    expect(lines).toEqual(['2×4 at 8 ft · Rustic Pine · 1 × $4.50$4.50', 'Plywood · 3/4" (4×8) · 1 × $65.00$65.00']);
    expect(r.getByTestId('cost-total').textContent).toBe('Total$69.50');
    expect(r.getByTestId('cost-note').textContent).toBe('Example prices, edit to match your store.');

    tap(r.getByTestId('cost-edit-prices'));
    expect(r.getByTestId('price-example-note').textContent).toBe('Example prices, edit to match your store.');
    expect(r.getByTestId('price-scope-device').getAttribute('aria-pressed')).toBe('true');
    // Only what this project buys until All prices.
    expect(r.queryByTestId('price-stick:2×6:96')).toBeNull();
    expect((r.getByTestId('price-stick:2×4:96') as HTMLInputElement).value).toBe('4.50');
    type(r.getByTestId('price-stick:2×4:96'), '5.25');
    type(r.getByTestId('price-sheet:plywood:0.75'), '$58');
    type(r.getByTestId('price-taxPct'), '8');
    expect(usePriceStore.getState().device).toEqual({ items: { 'stick:2×4:96': 5.25, 'sheet:plywood:0.75': 58 }, taxPct: 8 });
    expect(JSON.parse(localStorage.getItem('workbench_prices_v1')!).taxPct).toBe(8);
    expect(r.getByTestId('cost-total').textContent).toBe('Total$68.31'); // 63.25 × 1.08
    expect(r.queryByTestId('cost-note')).toBeNull();
    tap(r.getByTestId('price-show-all'));
    expect(r.getByTestId('price-stick:2×6:96')).toBeTruthy();
    expect(r.getByTestId('price-hw:pull')).toBeTruthy();
  });

  it('This project overrides sit over the device list and can be cleared', () => {
    act(() => usePriceStore.getState().resetDevice());
    act(() => usePriceStore.getState().setDevicePrice('stick:2×4:96', 5));
    seed([{ name: 'Leg', dimensions: { length: 30, width: 3.5, height: 1.5 }, material: { ...PRESET_WOOD_MATERIALS.pine } }]);
    const r = render(<CutListDrawer isOpen onClose={() => {}} />);
    tap(r.getByTestId('cost-edit-prices'));
    tap(r.getByTestId('price-scope-project'));
    type(r.getByTestId('price-stick:2×4:96'), '6');
    type(r.getByTestId('price-wastePct'), '10');
    expect(proj().prices).toEqual({ items: { 'stick:2×4:96': 6 }, wastePct: 10 });
    expect(usePriceStore.getState().device.items).toEqual({ 'stick:2×4:96': 5 });
    expect(r.getByTestId('cost-total').textContent).toBe('Total$6.60');
    // Emptying a box falls back to the device price.
    type(r.getByTestId('price-stick:2×4:96'), '');
    expect((r.getByTestId('price-stick:2×4:96') as HTMLInputElement).value).toBe('5.00');
    tap(r.getByTestId('price-clear-project'));
    expect(proj().prices).toBeUndefined();
    expect(r.getByTestId('cost-total').textContent).toBe('Total$5.00');
  });
});
