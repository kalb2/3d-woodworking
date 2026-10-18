// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import type { FurnitureObject } from '../../types/furniture';

afterEach(cleanup);

const { useProjectStore } = await import('../../state/useProjectStore');
const { ResizeSizeRow } = await import('./SizeBar');
const s = () => useProjectStore.getState();
const proj = () => s().projects.find((p) => p.id === s().activeProjectId)!;
const get = (id: string) => proj().objects.find((o) => o.id === id)!;

function legsOnBase() {
  s().createProject('Group size', 'in');
  s().addObject('board'); s().addObject('board');
  const [base, leg] = proj().objects.slice(-2).map((o) => o.id);
  const patch: Record<string, Partial<FurnitureObject>> = {
    [base]: { dimensions: { length: 20, height: 0.75, width: 20 }, position: { x: 0, y: 0.375, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
    [leg]: { dimensions: { length: 1.5, height: 29.25, width: 1.5 }, position: { x: 0, y: 15.375, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
  };
  useProjectStore.setState((st) => ({ projects: st.projects.map((p) => (p.id === st.activeProjectId
    ? { ...p, objects: p.objects.map((o) => (patch[o.id] ? { ...o, ...patch[o.id] } : o)) } : p)) }));
  act(() => { s().selectObject(base); s().selectObject(leg, { additive: true }); });
  return { base, leg };
}

describe('group / multi-selection size fields', () => {
  it('typing a height stretches the leg, keeps the base, and is one undo step', () => {
    const { base, leg } = legsOnBase();
    act(() => s().groupSelected());
    act(() => s().setGizmoMode('resize'));
    const r = render(<ResizeSizeRow />);
    const field = r.getByTestId('group-size-y') as HTMLInputElement;
    expect(field.value).toBe('30');
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: '36' } });
    fireEvent.blur(field);
    expect(get(leg).dimensions.height).toBe(35.25);
    expect(get(base).dimensions.height).toBe(0.75);
    act(() => s().undo());
    expect(get(leg).dimensions.height).toBe(29.25);
  });
});
