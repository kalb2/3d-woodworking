// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import type { FurnitureObject } from '../types/furniture';

afterEach(cleanup);

const { useProjectStore } = await import('../state/useProjectStore');
const { JoinSheet } = await import('./JoinSheet');
const { useJoinFlow } = await import('./useJoinFlow');
const { fitCheck } = await import('./fitCheck');
const { generateCutList } = await import('../utils/exportUtils');
const s = () => useProjectStore.getState();
const proj = () => s().projects.find((p) => p.id === s().activeProjectId)!;
const get = (id: string) => proj().objects.find((o) => o.id === id)!;
const fitOf = (id: string) => {
  const j = proj().joints!.find((x) => x.id === id)!;
  return fitCheck(j, get(j.receiverId), get(j.materId), 'in').status;
};

/** Two sides, a shelf dadoed between them 12" up, and a divider standing on the shelf. */
function setup(shelfY = 12.375) {
  s().createProject('Edit test', 'in');
  for (let i = 0; i < 4; i++) s().addObject('board');
  const [a, b, c, d] = proj().objects.slice(-4).map((o) => o.id);
  const rot = { x: 0, y: 0, z: 0 };
  const patch: Record<string, Partial<FurnitureObject>> = {
    [a]: { name: 'Left side', dimensions: { length: 0.75, height: 30, width: 12 }, position: { x: 0, y: 15, z: 0 }, rotation: rot },
    [b]: { name: 'Shelf', dimensions: { length: 24, height: 0.75, width: 12 }, position: { x: 12.375, y: shelfY, z: 0 }, rotation: rot },
    [c]: { name: 'Right side', dimensions: { length: 0.75, height: 30, width: 12 }, position: { x: 24.75, y: 15, z: 0 }, rotation: rot },
    [d]: { name: 'Divider', dimensions: { length: 0.75, height: 6, width: 12 }, position: { x: 12.375, y: shelfY + 0.375 + 3, z: 0 }, rotation: rot },
  };
  useProjectStore.setState((st) => ({ projects: st.projects.map((p) => (p.id === st.activeProjectId
    ? { ...p, objects: p.objects.map((o) => (patch[o.id] ? { ...o, ...patch[o.id] } : o)) } : p)) }));
  s().pushHistoryState();
  return { a, b, c, d };
}
const type = (el: HTMLElement, text: string) => { fireEvent.focus(el); fireEvent.change(el, { target: { value: text } }); fireEvent.blur(el); };

describe('Editing where a joint is cut', () => {
  it('"From bottom end" moves the dado; the shelf and what sits on it follow, the other side stays; still fits', () => {
    const { a, b, c, d } = setup();
    const id = s().saveJoint({ type: 'dado', receiverId: a, materId: b, face: '+x', depth: 0.25 }, true)!;
    const id2 = s().saveJoint({ type: 'dado', receiverId: c, materId: b, face: '-x', depth: 0.25 }, true)!;
    s().saveJoint({ type: 'butt', receiverId: b, materId: d, face: '+y', depth: 0 }, false);
    act(() => useJoinFlow.getState().edit(id));
    const r = render(<JoinSheet />);
    const off = r.getByTestId('joint-offset') as HTMLInputElement;
    expect(off.value).toBe('12"');
    const before = generateCutList(proj()).find((x) => x.name === 'Left side')!.notes;
    expect(before).toContain('@ 12"');
    type(off, '16 1/2');
    expect(get(b).position.y).toBeCloseTo(16.875);
    expect(get(d).position.y).toBeCloseTo(20.25);
    expect(get(a).position).toEqual({ x: 0, y: 15, z: 0 });
    expect(get(c).position).toEqual({ x: 24.75, y: 15, z: 0 });
    expect(fitOf(id)).toBe('fits');
    expect(fitOf(id2)).toBe('fits');
    expect((r.getByTestId('joint-offset') as HTMLInputElement).value).toBe('16 1/2"');
    expect(generateCutList(proj()).find((x) => x.name === 'Left side')!.notes).toContain('@ 16 1/2"');
    // One undo step puts everything back.
    act(() => s().undo());
    expect(get(b).position.y).toBeCloseTo(12.375);
    expect(get(d).position.y).toBeCloseTo(15.75);
  });

  it('keeps the groove on the board', () => {
    const { a, b } = setup();
    const id = s().saveJoint({ type: 'dado', receiverId: a, materId: b, face: '+x', depth: 0.25 }, true)!;
    expect(s().slideJoint(id, 100)).toBe(true);
    expect(get(b).position.y).toBeCloseTo(30 - 0.375);
    expect(s().slideJoint(id, 1)).toBe(false);
  });

  it('rabbet Edge switches the cut to the other end of the receiver and the board follows', () => {
    const { a, b } = setup(29.625);
    const id = s().saveJoint({ type: 'rabbet', receiverId: a, materId: b, face: '+x', depth: 0.375 }, true)!;
    act(() => useJoinFlow.getState().edit(id));
    const r = render(<JoinSheet />);
    expect(r.getByTestId('joint-edge-end').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(r.getByTestId('joint-edge-start'));
    expect(get(b).position.y).toBeCloseTo(0.375);
    expect(fitOf(id)).toBe('fits');
    expect(r.getByTestId('joint-edge-start').getAttribute('aria-pressed')).toBe('true');
  });
});

describe('Undo covers joint edits', () => {
  it('undoing a depth change restores the depth and the shelf length together', () => {
    const { a, b } = setup();
    const id = s().saveJoint({ type: 'dado', receiverId: a, materId: b, face: '+x', depth: 0.25 }, true)!;
    s().saveJoint({ id, type: 'dado', receiverId: a, materId: b, face: '+x', depth: 0.375 }, true);
    expect(get(b).dimensions.length).toBe(24.375);
    act(() => s().undo());
    expect(proj().joints!.find((j) => j.id === id)!.depth).toBe(0.25);
    expect(get(b).dimensions.length).toBe(24.25);
    expect(fitOf(id)).toBe('fits');
    act(() => s().redo());
    expect(proj().joints!.find((j) => j.id === id)!.depth).toBe(0.375);
  });

  it('undoing Add joint removes the joint and the lengthening; Remove can be undone', () => {
    const { a, b } = setup();
    const id = s().saveJoint({ type: 'dado', receiverId: a, materId: b, face: '+x', depth: 0.25 }, true)!;
    s().removeJoint(id);
    expect(proj().joints ?? []).toHaveLength(0);
    act(() => s().undo());
    expect(proj().joints).toHaveLength(1);
    expect(get(b).dimensions.length).toBe(24.25);
    act(() => s().undo());
    expect(proj().joints ?? []).toHaveLength(0);
    expect(get(b).dimensions.length).toBe(24);
  });
});
