// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useMeasure } from './useMeasure';

const p = (x: number) => ({ x, y: 0, z: 0, kind: 'floor' as const });

describe('measure flow', () => {
  it('place: from, to, then a new measurement starts over', () => {
    const m = () => useMeasure.getState();
    m().start();
    m().setHover(p(1));
    m().place(p(1));
    expect(m().a?.x).toBe(1);
    expect(m().hover).toBeNull();
    m().place(p(5));
    expect(m().b?.x).toBe(5);
    m().place(p(9));
    expect([m().a?.x, m().b]).toEqual([9, null]);
  });
  it('the first-use tip shows once and is remembered after Got it', () => {
    localStorage.clear();
    useMeasure.getState().start();
    expect(useMeasure.getState().showTip).toBe(true);
    useMeasure.getState().dismissTip();
    useMeasure.getState().stop();
    useMeasure.getState().start();
    expect(useMeasure.getState().showTip).toBe(false);
  });
});
