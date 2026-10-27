// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
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
  });

  it('metric projects show one unit per size', () => {
    seed('mm', [{ name: 'Shelf', dimensions: { length: 30, height: 0.75, width: 12 }, material: { ...PRESET_WOOD_MATERIALS.mdf } }]);
    const r = render(<CutListDrawer isOpen onClose={() => {}} />);
    expect(r.getByTestId('cut-part-size').textContent).toBe('762 × 305 × 19 mm');
    expect(r.getByTestId('cut-material-row').textContent).toContain('MDF · 19 mm');
  });
});
