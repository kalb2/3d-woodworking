// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';

afterEach(cleanup);

const { useProjectStore } = await import('../../state/useProjectStore');
const { PartColorSection } = await import('./MaterialPicker');
const s = () => useProjectStore.getState();
const objs = () => s().projects.find((p) => p.id === s().activeProjectId)!.objects;
const get = (id: string) => objs().find((o) => o.id === id)!;

describe('part color stays with its own part', () => {
  it('a late color event from the previous selection does not paint the newly selected part', () => {
    s().createProject('Color test', 'in');
    s().addObject('cube'); s().addObject('cube');
    const [a, b] = objs().filter((o) => o.shape === 'cube').map((o) => o.id).slice(-2);
    act(() => s().selectObject(a));
    const r = render(<PartColorSection />);
    const stale = r.getByTestId('finish-color-wheel') as HTMLInputElement;
    const bBefore = JSON.stringify(get(b).material);
    act(() => s().selectObject(b));
    // iOS fires change on the old picker as it closes.
    fireEvent.change(stale, { target: { value: '#d6d3cd' } });
    expect(JSON.stringify(get(b).material)).toBe(bBefore);
    // The live picker still works for the selected part.
    fireEvent.change(r.getByTestId('finish-color-wheel'), { target: { value: '#ff0000' } });
    expect(get(b).material.baseColor).toBe('#ff0000');
    expect(get(a).material.baseColor).not.toBe('#d6d3cd');
  });

  it('scanned walls have no finish editor', () => {
    s().createProject('Scan color', 'in');
    s().addObject('cube');
    const id = objs()[objs().length - 1].id;
    useProjectStore.setState((st) => ({ projects: st.projects.map((p) => p.id === st.activeProjectId ? { ...p, objects: p.objects.map((o) => o.id === id ? { ...o, generator: 'room-scan' } : o) } : p) }));
    act(() => s().selectObject(id));
    const r = render(<PartColorSection />);
    expect(r.queryByTestId('part-color-section')).toBeNull();
  });
});
