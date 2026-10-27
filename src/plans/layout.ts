import { KERF } from '../utils/stock';

/** Paper sizes in points (72 per inch), portrait. */
export const PAPER = {
  letter: { w: 612, h: 792, label: 'Letter' },
  a4: { w: 595.28, h: 841.89, label: 'A4' },
} as const;
export type PaperSize = keyof typeof PAPER;

export const MARGIN = 40;
/** Space under the running header and above the footer. */
export const HEADER = 34;
export const FOOTER = 30;

/** The printable content box of a page. */
export function contentBox(paper: PaperSize) {
  const p = PAPER[paper];
  return { x: MARGIN, y: MARGIN + HEADER, w: p.w - 2 * MARGIN, h: p.h - 2 * MARGIN - HEADER - FOOTER };
}

/**
 * Split blocks of the given heights over pages of height `avail`, in order,
 * with `gap` between blocks. A block taller than a page gets a page alone.
 */
export function paginate(heights: number[], avail: number, gap = 12): number[][] {
  const pages: number[][] = [];
  let cur: number[] = [], used = 0;
  heights.forEach((h, i) => {
    const need = (cur.length ? gap : 0) + h;
    if (cur.length && used + need > avail + 1e-6) { pages.push(cur); cur = []; used = 0; }
    used += (cur.length ? gap : 0) + h;
    cur.push(i);
  });
  if (cur.length) pages.push(cur);
  return pages;
}

/**
 * Rows for dimension lines along one side of a drawing so no two overlap:
 * each span [a, b] (with room for its text) goes in the first row where it
 * fits. Returns the row index per span.
 */
export function stackRows(spans: Array<[number, number]>, pad = 4): number[] {
  const rows: Array<Array<[number, number]>> = [];
  return spans.map(([a0, b0]) => {
    const a = Math.min(a0, b0) - pad, b = Math.max(a0, b0) + pad;
    let r = rows.findIndex((row) => row.every(([x, y]) => b <= x || a >= y));
    if (r < 0) { rows.push([]); r = rows.length - 1; }
    rows[r].push([a, b]);
    return r;
  });
}

/** Cuts along a stick as [start, end] inches from its end, kerf between them. */
export function stickSegments(cuts: number[], kerf = KERF): Array<[number, number]> {
  let x = 0;
  return cuts.map((c) => { const seg: [number, number] = [x, x + c]; x += c + kerf; return seg; });
}

/** Height of a block of text lines plus a title. */
export const textBlockHeight = (lines: number, lineH = 10.5, title = 0) => title + lines * lineH;

/** Part card height: the drawing or the text column, whichever is taller. */
export function cardHeight(drawingH: number, textLines: number, lineH = 10.5): number {
  return Math.max(drawingH, 30 + textLines * lineH) + 16;
}
