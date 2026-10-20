// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';

afterEach(cleanup);
window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;

const { useProjectStore } = await import('../state/useProjectStore');
const { useAppStore } = await import('../state/useAppStore');
const { useBuiltInFlow } = await import('./useBuiltInFlow');
const { BuiltInSheet } = await import('./BuiltInSheet');
const { ObjectInspector } = await import('../components/inspector/ObjectInspector');
const { TemplatesTab } = await import('../components/sidebar/TemplatesTab');
const s = () => useProjectStore.getState();
const proj = () => s().projects.find((p) => p.id === s().activeProjectId)!;
const later = (fn: () => void) => { const t = performance.now() + 1000 * (++tick); const spy = vi.spyOn(performance, 'now').mockReturnValue(t); fn(); spy.mockRestore(); };
let tick = 0;
const tap = (el: Element) => later(() => fireEvent.click(el));
const partsOf = (gid: string) => proj().objects.filter((o) => o.parentId === gid);

describe('Templates tab → setup sheet', () => {
  it('lists the four modular templates next to the media wall; base cabinet opens prefilled to standard sizes', () => {
    s().createProject('Kitchen', 'in');
    const tab = render(<TemplatesTab isPhone onDone={() => {}} />);
    for (const id of ['media-wall', 'base-cabinet', 'upper-cabinet', 'bookshelf', 'window-bench']) expect(tab.getByTestId(`builtin-${id}`)).toBeTruthy();
    tap(tab.getByTestId('builtin-base-cabinet'));
    tab.unmount();
    const r = render(<BuiltInSheet />);
    expect(r.getByRole('heading', { level: 2 }).textContent).toBe('Base cabinet');
    expect((r.getByTestId('tpl-width') as HTMLInputElement).value).toBe('30"');
    expect((r.getByTestId('tpl-height') as HTMLInputElement).value).toBe('34 1/2"');
    expect((r.getByTestId('tpl-depth') as HTMLInputElement).value).toBe('24"');
    expect(r.getByTestId('tpl-doors-2').getAttribute('aria-pressed')).toBe('true');
    expect(r.getByTestId('tpl-drawers-value').textContent).toBe('0');
    // Steppers: − hides at the minimum instead of greying out.
    expect((r.getByTestId('tpl-drawers-less') as HTMLElement).style.visibility).toBe('hidden');
    tap(r.getByTestId('tpl-drawers-more'));
    expect(r.getByTestId('tpl-drawers-value').textContent).toBe('1');
    // Progressive disclosure: the rest is under More options.
    expect(r.queryByTestId('tpl-thickness')).toBeNull();
    tap(r.getByTestId('tpl-more'));
    expect(r.getByTestId('tpl-thickness')).toBeTruthy();
    expect(r.getByTestId('tpl-faceFrame-yes')).toBeTruthy();
    expect(r.getByTestId('tpl-summary').textContent).toMatch(/\d+ boards · \d+ joints/);
    tap(r.getByTestId('mod-generate'));
    const g = proj().objects.find((o) => o.builtIn?.template === 'base-cabinet')!;
    expect(g.builtIn!.input).toMatchObject({ width: 30, height: 34.5, depth: 24, drawers: 1, doors: '2' });
    expect(partsOf(g.id).filter((p) => /^Drawer front/.test(p.name))).toHaveLength(1);
    expect((proj().joints ?? []).length).toBeGreaterThan(5);
    expect(useBuiltInFlow.getState().mode).toBeNull();
    expect(s().selectedObjectId).toBe(g.id);
  });
});

describe('Edit template on a placed bookshelf', () => {
  it('Properties → Part shows it; changing the shelf count rebuilds in place as one undo step', () => {
    s().createProject('Den', 'in');
    const gid = s().insertBuiltIn({ template: 'bookshelf', input: { v: 2 }, at: { x: 10, z: -5 } })!;
    act(() => s().updateObject(gid, { position: { x: 30, y: 36, z: 12 } }));
    const before = proj().objects.find((o) => o.id === gid)!;
    act(() => s().selectObject(gid));
    act(() => useAppStore.getState().setOverlayOpen('inspector', true));
    const insp = render(<ObjectInspector />);
    expect(insp.getByTestId('props-template').textContent).toMatch(/Bookshelf/);
    expect(insp.getByTestId('template-summary').textContent).toBe('36" × 72" × 12" · 4 shelves');
    expect(insp.getAllByTestId('menu-edit-template')).toHaveLength(1);
    tap(insp.getByTestId('menu-edit-template'));
    insp.unmount();
    expect(useBuiltInFlow.getState().editGroupId).toBe(gid);
    const r = render(<BuiltInSheet />);
    expect(r.getByRole('heading', { level: 2 }).textContent).toBe('Edit Bookshelf');
    expect(r.getByTestId('tpl-shelves-value').textContent).toBe('4');
    tap(r.getByTestId('tpl-shelves-more'));
    tap(r.getByTestId('tpl-shelves-more'));
    const history = s().historyIndex;
    tap(r.getByTestId('mod-generate'));
    const after = proj().objects.find((o) => o.id === gid)!;
    expect(after.builtIn!.input.shelves).toBe(6);
    expect(partsOf(gid).filter((p) => /^Shelf/.test(p.name))).toHaveLength(6);
    expect(after.position).toEqual(before.position);
    expect(s().historyIndex).toBe(history + 1);
    act(() => s().undo());
    expect(partsOf(gid).filter((p) => /^Shelf/.test(p.name))).toHaveLength(4);
    expect((proj().joints ?? []).filter((j) => j.materId.includes('_') && /^Shelf/.test(proj().objects.find((o) => o.id === j.materId)?.name ?? '')).length).toBe(8);
  });

  it('warns once in plain words before replacing hand changes; Cancel keeps them, Rebuild replaces them', () => {
    s().createProject('Hand', 'in');
    const gid = s().insertBuiltIn({ template: 'bookshelf', input: { v: 2 } })!;
    const shelf = partsOf(gid).find((p) => p.name === 'Shelf 1')!;
    act(() => s().updateObject(shelf.id, { position: { ...shelf.position, y: shelf.position.y + 3 } }));
    act(() => useBuiltInFlow.getState().startEdit(gid, 'bookshelf'));
    const r = render(<BuiltInSheet />);
    tap(r.getByTestId('tpl-shelves-less'));
    tap(r.getByTestId('mod-generate'));
    expect(r.getByTestId('tpl-warn').textContent).toMatch('Rebuilding will replace your manual changes to these boards.');
    expect(r.getByTestId('tpl-rebuild').textContent).toBe('Rebuild');
    tap(r.getByTestId('tpl-warn-cancel'));
    expect(r.queryByTestId('tpl-warn')).toBeNull();
    expect(partsOf(gid).filter((p) => /^Shelf/.test(p.name))).toHaveLength(4);
    tap(r.getByTestId('mod-generate'));
    tap(r.getByTestId('tpl-rebuild'));
    expect(partsOf(gid).filter((p) => /^Shelf/.test(p.name))).toHaveLength(3);
    expect(useBuiltInFlow.getState().mode).toBeNull();
  });
});

describe('group resize on a template', () => {
  it('rebuilds to the new width (one undo step per drag) instead of stretching', () => {
    s().createProject('Resize', 'in');
    const gid = s().insertBuiltIn({ template: 'base-cabinet', input: { v: 2 } })!;
    const start = proj().objects;
    act(() => s().stretchSelection([gid], '+x', 36, start));
    act(() => s().stretchSelection([gid], '+x', 33, start));
    const g = proj().objects.find((o) => o.id === gid)!;
    expect(g.builtIn!.input.width).toBe(33);
    const doors = partsOf(gid).filter((p) => /^Door/.test(p.name));
    expect(doors.map((d) => d.dimensions.length)).toEqual([(33 - 0.375) / 2, (33 - 0.375) / 2]);
    expect(partsOf(gid).find((p) => p.name === 'Side L')!.dimensions.length).toBe(0.75);
  });
});

describe('turning a template group', () => {
  it('children turn with the same handedness as the parts, so every joint stays seated and Edit keeps the turn', async () => {
    const { jointLayout } = await import('../joinery/joints');
    const { builtInModified } = await import('./builtIns');
    s().createProject('Turn', 'in');
    const gid = s().insertBuiltIn({ template: 'bookshelf', input: { v: 2 } })!;
    act(() => s().updateObject(gid, { rotation: { x: 0, y: 90, z: 0 } }));
    const byId = new Map(proj().objects.map((o) => [o.id, o]));
    for (const j of proj().joints ?? []) expect(jointLayout(j, byId.get(j.receiverId), byId.get(j.materId))).not.toBeNull();
    expect(builtInModified(proj().objects, proj().joints ?? [], undefined, gid)).toBe(false);
    s().insertBuiltIn({ template: 'bookshelf', input: { v: 2, shelves: 2 }, editId: proj().objects.find((o) => o.id === gid)!.builtIn!.id });
    expect(proj().objects.find((o) => o.id === gid)!.rotation.y).toBe(90);
  });
});
