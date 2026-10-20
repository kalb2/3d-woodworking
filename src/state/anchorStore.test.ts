import { describe, expect, it } from 'vitest';
import { useProjectStore } from './useProjectStore';
import { getHoles } from '../utils/holes';

const s = () => useProjectStore.getState();
const proj = () => s().projects.find((p) => p.id === s().activeProjectId)!;

describe('resizing a part keeps holes on their edge', () => {
  it('size field (updateObject dimensions) re-anchors; older holes get an inferred anchor', () => {
    s().createProject('Anchors', 'in');
    s().addObject('board');
    const o = proj().objects[proj().objects.length - 1];
    useProjectStore.setState((st) => ({ projects: st.projects.map((p) => (p.id === st.activeProjectId ? { ...p, objects: p.objects.map((x) => (x.id === o.id
      ? { ...x, dimensions: { length: 24, height: 0.75, width: 12 }, board: { cornerRadius: 0, edge: 'none' as const, holes: [{ id: 'h', x: -10, z: 0, diameter: 0.5 }] } } : x)) } : p)) }));
    s().updateObject(o.id, { dimensions: { length: 30, height: 0.75, width: 12 } });
    const h = getHoles(proj().objects.find((x) => x.id === o.id)!)[0];
    expect(h.x).toBe(-13); // still 2" from the left end
    expect(h.anchor).toEqual({ u: 'start', v: 'center' });
  });
});
