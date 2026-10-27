import { describe, expect, it } from 'vitest';
import { buildPlansPdf, placeBalloons, plansFileName } from './pdf';
import { templateProject } from './testProjects';

describe('build plans PDF', () => {
  it('lays out every section for a bookshelf on Letter paper', () => {
    const { doc, pages, pageCount } = buildPlansPdf(templateProject('bookshelf', 'Bookshelf'), { date: new Date(2026, 9, 27) });
    expect(pages.map((p) => p.title)).toEqual([
      'Cover', 'Front, side and top views', 'Exploded view and parts', 'Parts', 'Cut list', 'Shopping list', 'Sheet layouts', 'Assembly',
    ]);
    expect(pageCount).toBeGreaterThanOrEqual(8);
    const size = doc.internal.pageSize;
    expect([Math.round(size.getWidth()), Math.round(size.getHeight())]).toEqual([612, 792]);
    const bytes = new Uint8Array(doc.output('arraybuffer'));
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    // Pages are in order.
    for (let i = 1; i < pages.length; i++) expect(pages[i].page).toBeGreaterThanOrEqual(pages[i - 1].page);
  });
  it('does A4 too, and a base cabinet with doors and hardware', () => {
    const { doc, pageCount } = buildPlansPdf(templateProject('base-cabinet', 'Base cabinet'), { paper: 'a4' });
    expect(Math.round(doc.internal.pageSize.getWidth())).toBe(595);
    expect(pageCount).toBeGreaterThanOrEqual(8);
  });
  it('still makes a cover for an empty project', () => {
    const p = { ...templateProject('bookshelf', 'Empty'), objects: [], joints: [] };
    expect(buildPlansPdf(p).pageCount).toBe(1);
  });
  it('names the file after the project', () => {
    expect(plansFileName({ name: 'Hall bench ' })).toBe('Hall bench build plans.pdf');
    expect(plansFileName({ name: '' })).toBe('Workbench build plans.pdf');
  });
  it('keeps exploded-view balloons apart and inside the frame', () => {
    const frame = { x: 0, y: 0, w: 400, h: 400 };
    const anchors = Array.from({ length: 12 }, (_, i) => ({ n: i + 1, at: [200 + (i % 3) * 4, 200 + i * 3] as [number, number] }));
    const placed = placeBalloons(anchors, [200, 220], frame);
    for (const a of placed) {
      expect(a.ball[0]).toBeGreaterThanOrEqual(7); expect(a.ball[0]).toBeLessThanOrEqual(393);
      for (const b of placed) if (a !== b) expect(Math.hypot(a.ball[0] - b.ball[0], a.ball[1] - b.ball[1])).toBeGreaterThan(14);
    }
  });
});
