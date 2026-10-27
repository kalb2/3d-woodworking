// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';

afterEach(() => { cleanup(); localStorage.removeItem('workbench_ai_mock'); vi.unstubAllGlobals(); });
window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;

const { useProjectStore } = await import('../state/useProjectStore');
const { useAppStore } = await import('../state/useAppStore');
const { useDescribeFlow } = await import('./useDescribeFlow');
const { DescribeSheet } = await import('./DescribeSheet');
const { GroupBar } = await import('../components/layout/GroupBar');
const { SidebarNav } = await import('../components/sidebar/SidebarNav');
const s = () => useProjectStore.getState();
const objs = () => s().projects.find((p) => p.id === s().activeProjectId)!.objects;
let tick = 0;
const tap = (el: Element) => { const spy = vi.spyOn(performance, 'now').mockReturnValue(performance.now() + 1000 * (++tick)); fireEvent.click(el); spy.mockRestore(); };
const type = (el: Element, value: string) => fireEvent.change(el, { target: { value } });

describe('Describe it', () => {
  it('is a labeled row in the Add menu that opens the sheet', () => {
    act(() => {
      s().createProject('AI', 'in');
      useAppStore.getState().setSidebarPanel('shapes');
      useAppStore.getState().setOverlayOpen('sidebar', true);
    });
    const r = render(<SidebarNav />);
    const row = r.getByTestId('add-describe');
    expect(row.textContent).toContain('Describe it');
    tap(row);
    expect(useDescribeFlow.getState()).toMatchObject({ open: true, targetId: null });
    expect(useAppStore.getState().overlays.sidebar).toBe(false);
    act(() => useDescribeFlow.getState().close());
  });

  it('mock: generates a bookshelf group with fix notes in one undo step, then Change it rebuilds it in place', async () => {
    localStorage.setItem('workbench_ai_mock', '1');
    act(() => { s().createProject('AI mock', 'in'); useDescribeFlow.getState().openNew(); });
    const r = render(<><DescribeSheet /><GroupBar /></>);
    const go = r.getByTestId('describe-generate') as HTMLButtonElement;
    expect(go.disabled).toBe(true);
    expect(r.getByText(/Tap the mic on the keyboard/)).toBeTruthy();
    type(r.getByTestId('describe-input'), 'a bookshelf about 30 in wide and 4 ft tall');
    tap(r.getByTestId('describe-generate'));
    expect(r.getByTestId('describe-generate').textContent).toBe('Generating…');
    await waitFor(() => expect(r.getByRole('heading', { level: 2 }).textContent).toBe('Bookshelf added'), { timeout: 3000 });
    expect(r.getByTestId('describe-notes').textContent).toContain('Set it on the floor');
    const group = objs().find((o) => o.shape === 'group')!;
    expect(group.ai?.prompt).toBe('a bookshelf about 30 in wide and 4 ft tall');
    expect(objs().filter((o) => o.parentId === group.id)).toHaveLength(7);
    expect(s().selectedObjectId).toBe(group.id);

    // The group bar offers Change it for the AI-made group.
    expect(r.getByTestId('group-change-ai').textContent).toBe('Change it');
    tap(r.getByTestId('describe-change'));
    expect(r.getByRole('heading', { level: 2 }).textContent).toBe('Change Bookshelf');
    type(r.getByTestId('describe-input'), 'make it 6 in taller');
    tap(r.getByTestId('describe-generate'));
    await waitFor(() => expect(r.getByRole('heading', { level: 2 }).textContent).toBe('Bookshelf changed'), { timeout: 3000 });
    const after = objs().find((o) => o.id === group.id)!;
    expect(after.dimensions.height).toBe(54);
    expect(objs().filter((o) => o.shape === 'group')).toHaveLength(1);

    act(() => s().undo());
    expect(objs().find((o) => o.id === group.id)!.dimensions.height).toBe(48);
    act(() => s().undo());
    expect(objs().some((o) => o.id === group.id)).toBe(false);
  });

  it('without the server route it says it is not set up yet and adds nothing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Not found.' }), { status: 404 })));
    act(() => { s().createProject('AI off', 'in'); useDescribeFlow.getState().openNew(); });
    const before = objs().length;
    const r = render(<DescribeSheet />);
    type(r.getByTestId('describe-input'), 'a bench');
    tap(r.getByTestId('describe-generate'));
    await waitFor(() => expect(r.getByRole('alert').textContent).toMatch(/isn't set up yet/));
    expect(objs()).toHaveLength(before);
    expect(r.getByTestId('describe-generate').textContent).toBe('Generate');
  });
});
