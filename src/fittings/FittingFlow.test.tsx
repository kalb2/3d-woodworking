// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';

afterEach(cleanup);
window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;

const { useProjectStore } = await import('../state/useProjectStore');
const { useAppStore } = await import('../state/useAppStore');
const { useBuiltInFlow } = await import('../builtins/useBuiltInFlow');
const { BuiltInSheet } = await import('../builtins/BuiltInSheet');
const { SidebarNav } = await import('../components/sidebar/SidebarNav');
const { ObjectInspector } = await import('../components/inspector/ObjectInspector');
const { TemplatesTab } = await import('../components/sidebar/TemplatesTab');
const { projectHardware } = await import('../utils/exportUtils');
const s = () => useProjectStore.getState();
const proj = () => s().projects.find((p) => p.id === s().activeProjectId)!;
let tick = 0;
const later = (fn: () => void) => { const t = performance.now() + 1000 * (++tick); const spy = vi.spyOn(performance, 'now').mockReturnValue(t); fn(); spy.mockRestore(); };
const tap = (el: Element) => later(() => fireEvent.click(el));

function openAdd() {
  act(() => { useAppStore.getState().setSidebarPanel('shapes'); useAppStore.getState().setOverlayOpen('sidebar', true); });
  return render(<SidebarNav />);
}

describe('Add → Drawer / Door', () => {
  it('fills a selected cabinet with a drawer stack in one undo step, taking out its doors and shelf', () => {
    s().createProject('Kitchen', 'in');
    const cab = s().insertBuiltIn({ template: 'base-cabinet', input: { v: 2 }, at: { x: 0, z: 0 } })!;
    act(() => s().selectObject(cab));
    const nav = openAdd();
    tap(nav.getByTestId('add-fitting'));
    nav.unmount();
    expect(useBuiltInFlow.getState().step).toBe('fitting');
    const r = render(<BuiltInSheet />);
    expect(r.getByRole('heading', { level: 2 }).textContent).toBe('Drawer / Door');
    expect(r.getByTestId('fitting-opening').textContent).toBe('Fits base cabinet: 28 1/2" × 29" × 23 3/4"');
    tap(r.getByTestId('fitting-drawers'));
    expect((r.getByTestId('tpl-width') as HTMLInputElement).value).toBe('28 1/2"');
    expect((r.getByTestId('tpl-depth') as HTMLInputElement).value).toBe('23 3/4"');
    expect(r.queryByTestId('tpl-heights-even')).toBeNull();
    tap(r.getByTestId('tpl-count-more'));
    tap(r.getByTestId('tpl-count-more'));
    expect(r.getByTestId('tpl-heights-even')).toBeTruthy();
    tap(r.getByTestId('tpl-heights-graduated'));
    expect(r.getByTestId('tpl-summary').textContent).toMatch(/Box 27 1\/2" wide × 22" deep · 22" side-mount slides/);
    expect(r.getByTestId('tpl-host-note').textContent).toBe("Also takes out base cabinet's own doors and shelf.");
    const history = s().historyIndex;
    tap(r.getByTestId('mod-generate'));
    expect(s().historyIndex).toBe(history + 1);
    const g = proj().objects.find((o) => o.builtIn?.template === 'drawers')!;
    expect(s().selectedObjectId).toBe(g.id);
    expect(proj().objects.filter((o) => o.parentId === g.id && /^Drawer front/.test(o.name))).toHaveLength(3);
    const host = proj().objects.find((o) => o.id === cab)!;
    expect(host.builtIn!.input).toMatchObject({ doors: 'none', shelves: 0 });
    expect(proj().objects.some((o) => o.parentId === cab && /^Door/.test(o.name))).toBe(false);
    expect(projectHardware(proj())).toContainEqual({ name: 'Drawer slides 22" side-mount (pairs)', quantity: 3 });
    r.unmount();

    // Re-open from Properties to edit.
    act(() => useAppStore.getState().setOverlayOpen('inspector', true));
    const insp = render(<ObjectInspector />);
    expect(insp.getByTestId('template-summary').textContent).toBe('28 1/2" × 29" × 23 3/4" · 3 drawers · overlay · 22" slides');
    tap(insp.getByTestId('menu-edit-template'));
    insp.unmount();
    const e = render(<BuiltInSheet />);
    expect(e.getByRole('heading', { level: 2 }).textContent).toBe('Edit Drawers');
    tap(e.getByTestId('tpl-mount-inset'));
    tap(e.getByTestId('mod-generate'));
    expect(proj().objects.find((o) => o.id === g.id)!.builtIn!.input.mount).toBe('inset');
  });

  it('nothing selected: a free-standing door; Back returns to the choice; templates list leaves them out', () => {
    s().createProject('Shop', 'in');
    act(() => s().selectObject(null));
    const nav = openAdd();
    tap(nav.getByTestId('add-fitting'));
    nav.unmount();
    const r = render(<BuiltInSheet />);
    expect(r.getByTestId('fitting-opening').textContent).toMatch(/^Free-standing/);
    tap(r.getByTestId('fitting-door'));
    tap(r.getByLabelText('Back'));
    expect(useBuiltInFlow.getState().step).toBe('fitting');
    tap(r.getByTestId('fitting-door'));
    tap(r.getByTestId('tpl-doors-2'));
    expect(r.queryByTestId('tpl-hingeSide-left')).toBeNull();
    tap(r.getByTestId('mod-generate'));
    const g = proj().objects.find((o) => o.builtIn?.template === 'door')!;
    const doors = proj().objects.filter((o) => o.parentId === g.id);
    expect(doors).toHaveLength(2);
    expect(Math.min(...doors.map((d) => d.position.y - d.dimensions.height / 2))).toBeCloseTo(0, 3);
    expect(doors.every((d) => d.board!.holes.length === 2)).toBe(true);
    r.unmount();
    const tab = render(<TemplatesTab isPhone onDone={() => {}} />);
    expect(tab.queryByTestId('builtin-drawers')).toBeNull();
    expect(tab.queryByTestId('builtin-door')).toBeNull();
  });
});
