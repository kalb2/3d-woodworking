// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';

afterEach(cleanup);
window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;

const { useProjectStore } = await import('../../state/useProjectStore');
const { MoveFloorRow } = await import('./SizeBar');
const { bottomOf } = await import('../../utils/resizeRules');
const s = () => useProjectStore.getState();
const objs = () => s().projects.find((p) => p.id === s().activeProjectId)!.objects;

describe('Move → Floor reads the bottom of the part, rotation included', () => {
  it('a stood-up 48" panel 6" off the floor reads 6", not its center height minus 3/8"', () => {
    s().createProject('Floor row', 'in');
    act(() => { s().addObject('board'); });
    const id = objs().slice(-1)[0].id;
    act(() => {
      s().updateObject(id, { dimensions: { length: 24, height: 0.75, width: 48 }, rotation: { x: 90, y: 0, z: 0 } });
      s().updateObject(id, { position: { ...objs().find((o) => o.id === id)!.position, y: 30 } });
      s().selectObject(id);
      s().setGizmoMode('move');
    });
    const part = () => objs().find((o) => o.id === id)!;
    expect(bottomOf(part())).toBeCloseTo(6, 6);
    const r = render(<MoveFloorRow />);
    expect(Number(r.getByTestId('floor-distance-drag').getAttribute('aria-valuenow'))).toBeCloseTo(6, 6);
  });
});
