// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import type { FurnitureObject } from '../types/furniture';

afterEach(cleanup);

const { useProjectStore } = await import('../state/useProjectStore');
const { JoinSheet } = await import('./JoinSheet');
const { useJoinFlow } = await import('./useJoinFlow');
const { generateCutList } = await import('../utils/exportUtils');
const { jointHardware } = await import('./joints');
const s = () => useProjectStore.getState();
const proj = () => s().projects.find((p) => p.id === s().activeProjectId)!;
const get = (id: string) => proj().objects.find((o) => o.id === id)!;

/** A side panel and a shelf butting into it 12" up (floor off so nothing gets lifted). */
function setup() {
  s().createProject('Join test', 'in');
  s().addObject('board'); s().addObject('board');
  const [a, b] = proj().objects.slice(-2).map((o) => o.id);
  const patch: Record<string, Partial<FurnitureObject>> = {
    [a]: { name: 'Side', dimensions: { length: 0.75, height: 30, width: 12 }, position: { x: 0, y: 15, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
    [b]: { name: 'Shelf', dimensions: { length: 24, height: 0.75, width: 12 }, position: { x: 12.375, y: 12.375, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
  };
  useProjectStore.setState((st) => ({ projects: st.projects.map((p) => (p.id === st.activeProjectId
    ? { ...p, objects: p.objects.map((o) => (patch[o.id] ? { ...o, ...patch[o.id] } : o)) } : p)) }));
  return { a, b };
}
const tap = (el: HTMLElement) => fireEvent.click(el);

describe('Join sheet', () => {
  it('adds a dado: groove noted on the side, shelf lengthened into it, one joint listed on both', () => {
    const { a, b } = setup();
    act(() => useJoinFlow.getState().start(b, a));
    const r = render(<JoinSheet />);
    tap(r.getByTestId('join-type-dado'));
    expect(r.getByTestId('join-where').textContent).toBe('Groove in Side, 3/4 x 1/4 @ 12"');
    tap(r.getByTestId('join-save'));
    expect(proj().joints).toHaveLength(1);
    expect(get(b).dimensions.length).toBe(24.25);
    expect(get(b).position.x).toBeCloseTo(12.25);
    const rows = generateCutList(proj());
    expect(rows.find((x) => x.name === 'Side')!.notes).toBe('dado 3/4 x 1/4 @ 12"');
    expect(rows.find((x) => x.name === 'Shelf')!.notes).toBe('into dado 1/4"');
    expect(useJoinFlow.getState().view).toBeNull();
  });

  it('editing to pocket screws undoes the lengthening; removing clears it', () => {
    const { a, b } = setup();
    const id = s().saveJoint({ type: 'dado', receiverId: a, materId: b, face: '+x', depth: 0.25 }, true)!;
    act(() => useJoinFlow.getState().list(b));
    const r = render(<JoinSheet />);
    expect(r.getAllByTestId('joint-row')).toHaveLength(1);
    tap(r.getByText(/Dado · Side/));
    tap(r.getByTestId('join-type-pocket'));
    tap(r.getByTestId('join-save'));
    expect(get(b).dimensions.length).toBe(24);
    expect(proj().joints![0]).toMatchObject({ id, type: 'pocket', extended: 0 });
    expect(jointHardware(proj())).toEqual([{ name: 'Pocket screws 1 1/4"', quantity: 3 }]);
    tap(r.getByTestId('joint-remove'));
    expect(proj().joints).toHaveLength(0);
  });

  it('removing a dado shrinks the shelf back', () => {
    const { a, b } = setup();
    const id = s().saveJoint({ type: 'rabbet', receiverId: a, materId: b, face: '+x', depth: 0.375 }, true)!;
    expect(get(b).dimensions.length).toBe(24.375);
    s().removeJoint(id);
    expect(get(b).dimensions.length).toBe(24);
    expect(get(b).position.x).toBeCloseTo(12.375);
  });
});
