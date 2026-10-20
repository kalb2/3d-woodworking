// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import type { FurnitureObject } from '../types/furniture';

afterEach(cleanup);

const { useProjectStore } = await import('../state/useProjectStore');
const { JoinSheet } = await import('./JoinSheet');
const { useJoinFlow } = await import('./useJoinFlow');
const { generateCutList } = await import('../utils/exportUtils');
const { jointHardware, partCutters } = await import('./joints');
const s = () => useProjectStore.getState();
const proj = () => s().projects.find((p) => p.id === s().activeProjectId)!;
const get = (id: string) => proj().objects.find((o) => o.id === id)!;

/** A side panel and a shelf butting into it 12" up. */
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
const type = (el: HTMLElement, text: string) => { fireEvent.focus(el); fireEvent.change(el, { target: { value: text } }); fireEvent.blur(el); };

describe('Join sheet + joint editor', () => {
  it('adds a dado, then the editor shows it fits; cut list notes both parts', () => {
    const { a, b } = setup();
    act(() => useJoinFlow.getState().start(b, a));
    const r = render(<JoinSheet />);
    tap(r.getByTestId('join-type-dado'));
    tap(r.getByTestId('join-save'));
    expect(proj().joints).toHaveLength(1);
    expect(get(b).dimensions.length).toBe(24.25);
    expect(get(b).position.x).toBeCloseTo(12.25);
    expect(r.getByTestId('joint-fit').textContent).toBe('Fits: 3/4" Shelf in a 3/4" dado, 1/4" deep (1/3 of the board)');
    expect(r.getByTestId('diagram-width').textContent).toBe('3/4" wide');
    const rows = generateCutList(proj());
    expect(rows.find((x) => x.name === 'Side')!.notes).toBe('dado 3/4 x 1/4 @ 12"');
    expect(rows.find((x) => x.name === 'Shelf')!.notes).toBe('into dado 1/4"');
    tap(r.getByTestId('join-done'));
    expect(useJoinFlow.getState().view).toBeNull();
  });

  it('depth in fractions re-seats the shelf; too deep warns; the diagram follows as you type', () => {
    const { a, b } = setup();
    const id = s().saveJoint({ type: 'dado', receiverId: a, materId: b, face: '+x', depth: 0.25 }, true)!;
    act(() => useJoinFlow.getState().edit(id));
    const r = render(<JoinSheet />);
    const depth = r.getByTestId('joint-depth') as HTMLInputElement;
    expect(depth.value).toBe('1/4"');
    fireEvent.focus(depth); fireEvent.change(depth, { target: { value: '5/16' } });
    expect(r.getByTestId('diagram-depth').textContent).toBe('5/16" deep'); // live, before commit
    fireEvent.blur(depth);
    expect(proj().joints![0].depth).toBeCloseTo(0.3125);
    expect(get(b).dimensions.length).toBeCloseTo(24.3125);
    expect(r.getByTestId('joint-fit').className).toContain('is-fits');
    type(r.getByTestId('joint-depth'), '1/2');
    expect(get(b).dimensions.length).toBeCloseTo(24.5);
    expect(r.getByTestId('joint-fit').textContent).toBe('Check: Too deep: 1/2" is more than half of Side\'s 3/4"');
    expect(partCutters(proj(), a)).toHaveLength(1);
  });

  it('a narrow groove warns; turning seating off warns; moving the shelf away breaks it and Re-seat fixes it', () => {
    const { a, b } = setup();
    const id = s().saveJoint({ type: 'dado', receiverId: a, materId: b, face: '+x', depth: 0.25 }, true)!;
    act(() => useJoinFlow.getState().edit(id));
    const r = render(<JoinSheet />);
    type(r.getByTestId('joint-width'), '5/8');
    expect(r.getByTestId('joint-fit').textContent).toBe('Check: Tight: the dado is 5/8" wide but Shelf is 3/4" thick');
    type(r.getByTestId('joint-width'), '3/4');
    expect(r.getByTestId('joint-fit').className).toContain('is-fits');
    act(() => s().updateObject(b, { position: { ...get(b).position, x: 20 } }));
    expect(r.getByTestId('joint-fit').textContent).toBe("Shelf isn't touching Side anymore.");
    tap(r.getByTestId('joint-reseat'));
    expect(get(b).position.x).toBeCloseTo(12.25);
    expect(r.getByTestId('joint-fit').className).toContain('is-fits');
    tap(r.getByTestId('joint-seat'));
    expect(get(b).dimensions.length).toBe(24);
    expect(r.getByTestId('joint-fit').textContent).toBe('Check: Shelf sits 1/4" short of the bottom of the dado');
  });

  it('switching to pocket screws undoes the lengthening; count and screw length; Remove clears it', () => {
    const { a, b } = setup();
    const id = s().saveJoint({ type: 'dado', receiverId: a, materId: b, face: '+x', depth: 0.25 }, true)!;
    act(() => useJoinFlow.getState().list(b));
    const r = render(<JoinSheet />);
    expect(r.getAllByTestId('joint-row')).toHaveLength(1);
    expect(r.getByTestId('joint-status').textContent).toBe('Fits');
    tap(r.getByTestId('joint-row'));
    tap(r.getByTestId('joint-type-pocket'));
    expect(get(b).dimensions.length).toBe(24);
    expect(proj().joints![0]).toMatchObject({ id, type: 'pocket', extended: 0 });
    expect(jointHardware(proj())).toEqual([{ name: 'Pocket screws 1 1/4"', quantity: 3 }]);
    type(r.getByTestId('joint-count'), '2');
    expect(partCutters(proj(), b)).toHaveLength(2);
    type(r.getByTestId('joint-screw'), '2 1/2');
    expect(r.getByTestId('joint-fit').textContent).toBe('Check: 2 1/2" screws would poke out of Side');
    tap(r.getByTestId('join-remove'));
    expect(proj().joints).toHaveLength(0);
    expect(useJoinFlow.getState().view).toMatchObject({ kind: 'list', partId: b }); // back to the list
  });
});
