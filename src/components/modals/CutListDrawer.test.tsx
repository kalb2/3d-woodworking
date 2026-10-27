// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import type { FurnitureObject } from '../../types/furniture';
import { PRESET_WOOD_MATERIALS } from '../../utils/woodTextureGenerator';

afterEach(cleanup);

const { useProjectStore } = await import('../../state/useProjectStore');
const { CutListDrawer } = await import('./CutListDrawer');
const s = () => useProjectStore.getState();

function seed(unit: 'in' | 'mm', patches: Partial<FurnitureObject>[]) {
  act(() => s().createProject('Cut list', unit));
  for (let i = 0; i < patches.length; i++) act(() => s().addObject('board'));
  useProjectStore.setState((st) => ({
    projects: st.projects.map((p) => (p.id === st.activeProjectId
      ? { ...p, objects: p.objects.slice(-patches.length).map((o, i) => ({ ...o, ...patches[i] })) } : p)),
  }));
}

describe('CutListDrawer', () => {
  it('shows buying sections, true sizes as fractions and the footnote', () => {
    seed('in', [
      { name: 'Side', dimensions: { length: 0.75, height: 30, width: 23.625 }, material: { ...PRESET_WOOD_MATERIALS.plywood } },
      { name: 'Side', dimensions: { length: 0.75, height: 30, width: 23.625 }, material: { ...PRESET_WOOD_MATERIALS.plywood } },
      { name: 'Leg', dimensions: { length: 1.5, height: 29.25, width: 1.5 }, material: { ...PRESET_WOOD_MATERIALS.oak } },
    ]);
    const r = render(<CutListDrawer isOpen onClose={() => {}} />);
    const headers = r.getAllByTestId('cut-material-row').map((e) => e.textContent);
    expect(headers[0]).toContain('Natural Oak · 1 pcs');
    expect(headers[0]).toContain('bd ft of 8/4');
    expect(headers[1]).toContain('Plywood · 3/4" · 2 pcs');
    expect(headers[1]).toContain('1 sheet (4×8)');
    const sizes = r.getAllByTestId('cut-part-size').map((e) => e.textContent!.replace(/\u00a0/g, ' '));
    expect(sizes).toContain('30" × 23 5/8" × 3/4"');
    expect(sizes).toContain('29 1/4" × 1 1/2" × 1 1/2"');
    expect(r.getAllByTestId('cut-part-size')[0].textContent).toContain('1\u00a01/2"'); // fractions never split
    expect(r.getByTestId('cut-footnote').textContent).toMatch(/Length runs with the grain/);
    expect(r.getByTestId('cut-export-csv')).toBeTruthy();
    // Short header that fits a phone: labeled CSV button, readable footnote contrast.
    expect(r.getByRole('heading', { level: 2 }).textContent).toBe('Cut list');
    expect(r.getByTestId('cut-export-csv').textContent?.trim()).toBe('CSV');
    expect(r.getByTestId('cut-footnote').style.color).toBe('rgb(71, 85, 105)');
  });

  it('metric projects show one unit per size', () => {
    seed('mm', [{ name: 'Shelf', dimensions: { length: 30, height: 0.75, width: 12 }, material: { ...PRESET_WOOD_MATERIALS.mdf } }]);
    const r = render(<CutListDrawer isOpen onClose={() => {}} />);
    expect(r.getByTestId('cut-part-size').textContent).toBe('762 × 305 × 19 mm');
    expect(r.getByTestId('cut-material-row').textContent).toContain('MDF · 19 mm');
  });
});

describe('CutListDrawer buy list', () => {
  const pine = () => ({ ...PRESET_WOOD_MATERIALS.pine });
  it('says how many sticks to buy and shows the cut layout on request', () => {
    seed('in', [
      { name: 'Rail', shape: 'cube', dimensions: { length: 60, height: 1.5, width: 3.5 }, material: pine() },
      { name: 'Rail', shape: 'cube', dimensions: { length: 60, height: 1.5, width: 3.5 }, material: pine() },
      { name: 'Top', shape: 'cube', dimensions: { length: 100, height: 1.5, width: 5.5 }, material: pine() },
      { name: 'Beam', shape: 'cube', dimensions: { length: 160, height: 1.5, width: 5.5 }, material: pine() },
      { name: 'Side', dimensions: { length: 0.75, height: 30, width: 23.625 }, material: { ...PRESET_WOOD_MATERIALS.plywood } },
    ]);
    const r = render(<CutListDrawer isOpen onClose={() => {}} />);
    expect(r.getAllByTestId('cut-buy-line').map((e) => e.textContent)).toEqual(['1 × 2×4 at 12 ft · Rustic Pine', '1 × 2×6 at 10 ft · Rustic Pine']);
    expect(r.getByTestId('cut-buy-oversize').textContent).toContain('1 2×6 part is longer than 12 ft (160")');
    expect(r.queryByTestId('cut-layout')).toBeNull();
    const toggle = r.getByTestId('cut-layout-toggle');
    fireEvent.pointerUp(toggle);
    fireEvent.click(toggle); // the tap's click doesn't toggle it back
    const sticks = r.getAllByTestId('cut-layout-stick').map((e) => e.textContent!.replace(/\u00a0/g, ' '));
    expect(sticks).toEqual(['2×4 #1 (12 ft): 60" + 60" · 23 7/8" left', '2×6 #1 (10 ft): 100" · 20" left']);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    // sheet goods unchanged
    expect(r.getAllByTestId('cut-material-row').map((e) => e.textContent).join('|')).toContain('1 sheet (4×8)');
  });

  it('no buy list without dimensional lumber', () => {
    seed('in', [{ name: 'Leg', dimensions: { length: 1.5, height: 29.25, width: 1.5 }, material: { ...PRESET_WOOD_MATERIALS.oak } }]);
    const r = render(<CutListDrawer isOpen onClose={() => {}} />);
    expect(r.queryByTestId('cut-buy-list')).toBeNull();
    expect(r.getByTestId('cut-footnote').textContent).toContain('Other lumber: buy amount adds 15%');
  });
});

describe('CutListDrawer sheet layout', () => {
  const ply = () => ({ ...PRESET_WOOD_MATERIALS.plywood });
  it('lists sheets to buy and draws each sheet on request', () => {
    seed('in', [
      ...Array.from({ length: 7 }, () => ({ name: 'Side', dimensions: { length: 0.75, height: 30, width: 23.875 }, material: ply() })),
      { name: 'Toe kick', dimensions: { length: 0.75, height: 4, width: 20 }, material: ply() },
      { name: 'Toe kick', dimensions: { length: 0.75, height: 4, width: 20 }, material: ply() },
      { name: 'Top', dimensions: { length: 0.75, height: 100, width: 30 }, material: ply() },
    ]);
    const r = render(<CutListDrawer isOpen onClose={() => {}} />);
    expect(r.getAllByTestId('cut-sheet-line').map((e) => e.textContent)).toEqual([expect.stringMatching(/^2 × Plywood · 3\/4" 4×8 · \d+% used$/)]);
    expect(r.getByTestId('cut-sheet-oversize').textContent).toContain('1 Plywood · 3/4" panel is bigger than a 4×8 sheet (Top 100" × 30")');
    expect(r.queryByTestId('sheet-diagram')).toBeNull();
    const toggle = r.getByTestId('sheet-layout-toggle');
    fireEvent.pointerUp(toggle);
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const diagrams = r.getAllByTestId('sheet-diagram');
    expect(diagrams.map((d) => d.querySelector('figcaption')!.textContent)).toEqual([
      expect.stringMatching(/^Plywood · 3\/4" · sheet 1 of 2 · \d+% used · grain along 8 ft$/),
      expect.stringMatching(/^Plywood · 3\/4" · sheet 2 of 2 · \d+% used · grain along 8 ft$/),
    ]);
    expect(r.getAllByTestId('sheet-panel')).toHaveLength(9);
    // big panels carry their name and size; a 20" × 4" strip is numbered and keyed below, both toe kicks as one key
    expect(diagrams[0].textContent).toContain('Side');
    expect(diagrams[0].textContent).toContain('30" × 23 7/8"');
    expect(r.getByTestId('sheet-key').textContent).toBe('1: Toe kick 20" × 4"');
    expect(r.getAllByTestId('sheet-offcut').length).toBeGreaterThan(0);
    // lumber's cut layout is a separate toggle
    expect(r.queryByTestId('cut-layout-toggle')).toBeNull();
  });

  it('MDF captions skip the grain note', () => {
    seed('in', [{ name: 'Door', dimensions: { length: 0.75, height: 30, width: 15 }, material: { ...PRESET_WOOD_MATERIALS.mdf } }]);
    const r = render(<CutListDrawer isOpen onClose={() => {}} />);
    fireEvent.click(r.getByTestId('sheet-layout-toggle'));
    expect(r.getByTestId('sheet-diagram').querySelector('figcaption')!.textContent).toMatch(/^MDF · 3\/4" · sheet 1 of 1 · \d+% used$/);
  });
});
