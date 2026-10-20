// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import type { FurnitureObject, JointType } from '../types/furniture';

afterEach(cleanup);

const { useProjectStore } = await import('../state/useProjectStore');
const { JoinSheet } = await import('./JoinSheet');
const { useJoinFlow } = await import('./useJoinFlow');
const { partCutters, pairContact } = await import('./joints');
const { isGhostClick } = await import('../utils/reliableTap');
const s = () => useProjectStore.getState();
const proj = () => s().projects.find((p) => p.id === s().activeProjectId)!;
const get = (id: string) => proj().objects.find((o) => o.id === id)!;

type Box = { dims: [number, number, number]; at: [number, number, number] };
/** Two flat 3/4" boards (Kaleb's Planer Table Saw Stand), plus corner/T layouts. */
const LAYOUTS: Record<string, [Box, Box]> = {
  end: [{ dims: [24, 0.75, 6], at: [0, 0.375, 0] }, { dims: [24, 0.75, 6], at: [24, 0.375, 0] }],
  edge: [{ dims: [24, 0.75, 6], at: [0, 0.375, 0] }, { dims: [24, 0.75, 6], at: [0, 0.375, 6] }],
  corner: [{ dims: [24, 0.75, 6], at: [0, 0.375, 0] }, { dims: [0.75, 12, 6], at: [11.625, 6.75, 0] }],
  tee: [{ dims: [24, 0.75, 6], at: [0, 0.375, 0] }, { dims: [0.75, 12, 6], at: [0, 6.75, 0] }],
};

function setup(layout: keyof typeof LAYOUTS) {
  s().createProject(`Join ${layout}`, 'in');
  s().addObject('board'); s().addObject('board');
  const ids = proj().objects.slice(-2).map((o) => o.id);
  const patch = new Map<string, Partial<FurnitureObject>>(LAYOUTS[layout].map((b, i) => [ids[i], {
    name: i ? 'B' : 'A', dimensions: { length: b.dims[0], height: b.dims[1], width: b.dims[2] },
    position: { x: b.at[0], y: b.at[1], z: b.at[2] }, rotation: { x: 0, y: 0, z: 0 },
  }]));
  useProjectStore.setState((st) => ({ projects: st.projects.map((p) => (p.id === st.activeProjectId
    ? { ...p, objects: p.objects.map((o) => (patch.has(o.id) ? { ...o, ...patch.get(o.id) } : o)) } : p)) }));
  return ids;
}
const tap = (el: HTMLElement) => fireEvent.click(el);
const snapshot = () => proj().objects.map((o) => ({ id: o.id, position: { ...o.position }, dimensions: { ...o.dimensions } }));

describe('Join keeps the same two parts for every joint type', () => {
  const offered: Record<string, JointType[]> = {
    end: ['butt', 'pocket', 'dowel'],
    edge: ['butt', 'pocket', 'dowel'],
    corner: ['butt', 'dado', 'rabbet', 'pocket', 'dowel'],
    tee: ['butt', 'dado', 'rabbet', 'pocket', 'dowel'],
  };
  for (const layout of Object.keys(LAYOUTS) as (keyof typeof LAYOUTS)[]) {
    it(`${layout}: each joint adds one joint, no new parts, right cuts`, () => {
      const [a, b] = setup(layout);
      const n0 = proj().objects.length; // the new project's starter part + our two boards
      expect(pairContact(get(a), get(b))).not.toBeNull();
      act(() => useJoinFlow.getState().start(a, b));
      let r = render(<JoinSheet />);
      const shown = [...r.container.querySelectorAll('[data-testid^="join-type-"]')].map((el) => el.getAttribute('data-testid')!.replace('join-type-', ''));
      expect(shown).toEqual(offered[layout]);
      if (layout === 'end' || layout === 'edge') {
        expect(r.getByTestId('join-no-groove').textContent).toContain(layout === 'end' ? 'end to end' : 'edge to edge');
      }
      cleanup();
      for (const type of offered[layout]) {
        const before = snapshot();
        act(() => useJoinFlow.getState().start(a, b));
        r = render(<JoinSheet />);
        tap(r.getByTestId(`join-type-${type}`));
        tap(r.getByTestId('join-save'));
        cleanup();
        expect(proj().objects).toHaveLength(n0);
        expect(proj().joints).toHaveLength(1);
        const j = proj().joints![0];
        expect(j.type).toBe(type);
        const grooved = type === 'dado' || type === 'rabbet';
        if (!grooved) expect(snapshot()).toEqual(before); // nothing moved or resized
        else {
          // Only the mating board changes: it grows by the depth to seat in the groove.
          const m = before.find((o) => o.id === j.materId)!, now = snapshot().find((o) => o.id === j.materId)!;
          const grew = (['length', 'height', 'width'] as const).reduce((acc, k) => acc + now.dimensions[k] - m.dimensions[k], 0);
          expect(grew).toBeCloseTo(j.depth, 6);
          expect(snapshot().filter((o) => o.id !== j.materId)).toEqual(before.filter((o) => o.id !== j.materId));
        }
        expect(useJoinFlow.getState().view).toMatchObject({ kind: 'edit', jointId: j.id }); // editor opens next
        const cR = partCutters(proj(), j.receiverId), cM = partCutters(proj(), j.materId);
        if (type === 'butt') { expect(cR).toEqual([]); expect(cM).toEqual([]); }
        if (type === 'dado' || type === 'rabbet') {
          expect(cR).toHaveLength(1); expect(cM).toEqual([]);
          // A 3/4" board gets a shallow groove (1/4"), never the 8" a 24" end used to get.
          expect(j.depth).toBeLessThanOrEqual(0.25);
        }
        if (type === 'pocket') { expect(cR).toEqual([]); expect(cM.length).toBeGreaterThanOrEqual(1); }
        if (type === 'dowel') { expect(cR.length).toBeGreaterThanOrEqual(1); expect(cM).toHaveLength(cR.length); }
        s().removeJoint(j.id);
        expect(proj().objects).toHaveLength(n0);
      }
      // Undo after a join does not bring back extra parts either.
      s().saveJoint({ type: 'dowel', receiverId: a, materId: b, face: pairContact(get(a), get(b))!.face, depth: 0.25 }, false);
      s().undo();
      expect(proj().objects).toHaveLength(n0);
    });
  }
});

describe('ghost click after a tap closes a sheet', () => {
  it('a click that lands on a different element than the touch started on is swallowed', () => {
    document.body.innerHTML = '<div id="sheet"><button id="add">Add joint</button></div><nav><button id="dup"><span id="dupLabel">Duplicate</span></button></nav>';
    const add = document.getElementById('add')!, dup = document.getElementById('dup')!, label = document.getElementById('dupLabel')!;
    const t0 = 1000;
    expect(isGhostClick({ target: add, at: t0 }, dup, t0 + 120)).toBe(true); // finger went down on Add joint
    document.getElementById('sheet')!.remove();
    expect(isGhostClick({ target: add, at: t0 }, dup, t0 + 120)).toBe(true); // sheet gone
    expect(isGhostClick({ target: label, at: t0 }, dup, t0 + 120)).toBe(false); // real tap on Duplicate
    expect(isGhostClick({ target: dup, at: t0 }, label, t0 + 120)).toBe(false);
    expect(isGhostClick({ target: add, at: t0 }, dup, t0 + 5000)).toBe(false); // long ago: not that tap
    expect(isGhostClick(null, dup, t0)).toBe(false);
  });
});
