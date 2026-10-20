// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { boxCovered, boxSamples, clusterLabel, clusterTags, pointCovered, tagWidth, worstStatus } from './tagClusters';

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

describe('tags under app UI', () => {
  const root = document.createElement('div');
  const tag = document.createElement('button'); root.appendChild(tag);
  const sheet = document.createElement('div');
  const backdrop = document.createElement('div'); backdrop.className = 'overlay-backdrop';
  const pass = (el: Element) => el.classList.contains('overlay-backdrop');

  it('a point is open when the 3D view (or the tag) is on top, through a see-through backdrop', () => {
    expect(pointCovered([tag, root], root, pass)).toBe(false);
    expect(pointCovered([backdrop, root], root, pass)).toBe(false);
    expect(pointCovered([], root, pass)).toBe(false);
  });
  it('a sheet, bar or button on top covers it', () => {
    expect(pointCovered([sheet, tag, root], root, pass)).toBe(true);
    expect(pointCovered([backdrop, sheet, root], root, pass)).toBe(true);
  });
  it('a tag half under a sheet edge hides; one clear of it stays', () => {
    const sheetTop = 400;
    const covered = (_x: number, y: number) => y >= sheetTop;
    expect(boxCovered({ x: 100, y: 390, w: 120, h: 36 }, covered)).toBe(true);
    expect(boxCovered({ x: 100, y: 360, w: 120, h: 36 }, covered)).toBe(false);
    expect(boxSamples({ x: 0, y: 0, w: 20, h: 10 }, 3)).toContainEqual([7, 2]);
  });
});
