import { describe, expect, it } from 'vitest';
import { clusterLabel, clusterTags, tagWidth, worstStatus } from './tagClusters';

const box = (id: string, x: number, y: number, w = 120) => ({ id, x, y, w, h: 36 });

describe('joint tag clustering', () => {
  it('leaves tags that are apart alone', () => {
    expect(clusterTags([box('a', 0, 0), box('b', 200, 0), box('c', 0, 100)])).toEqual([['a'], ['b'], ['c']]);
  });
  it('groups overlapping tags, transitively, sorted top to bottom', () => {
    const g = clusterTags([box('a', 0, 60), box('b', 20, 30), box('c', 40, 0), box('far', 400, 400)]);
    expect(g).toEqual([['c', 'b', 'a'], ['far']]);
  });
  it('touching within the gap counts as overlapping', () => {
    expect(clusterTags([box('a', 0, 0), box('b', 122, 0)])).toEqual([['a', 'b']]);
    expect(clusterTags([box('a', 0, 0), box('b', 130, 0)])).toEqual([['a'], ['b']]);
  });
  it('labels and colours the chip', () => {
    expect(clusterLabel(['fits', 'fits'])).toBe('2 joints');
    expect(clusterLabel(['fits', 'check', 'broken'])).toBe('3 joints · 2 to check');
    expect(worstStatus(['fits', 'check'])).toBe('check');
    expect(worstStatus(['check', 'broken'])).toBe('broken');
    expect(tagWidth('Dado 3/4"')).toBeGreaterThan(80);
  });
});
