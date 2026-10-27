import { jsPDF } from 'jspdf';
import type { FurnitureObject, FurnitureProject, LengthUnit } from '../types/furniture';
import { cutListSections, lumberBuyList, projectHardware, sheetBuyList, type CutListSection } from '../utils/exportUtils';
import { stickFeet, type SheetLayout } from '../utils/stock';
import { assemblySteps, type Step } from './assembly';
import { dim, dimBare, niceScale, overallSize, partSize, planDate } from './format';
import { explodeOffsets, isoParts, levelLines, orthoView, pieceBox, planParts, type Bounds2, type IsoPart, type OrthoView, type P2 } from './geometry';
import { PAPER, MARGIN, contentBox, paginate, stackRows, stickSegments, type PaperSize } from './layout';
import { faceDrawing, finishText, grainText, groupParts, handedNote, partNumbers, type DimSpec, type FaceDrawing, type PartGroup } from './parts';

export interface PlanOptions {
  paper?: PaperSize;
  date?: Date;
  /** Cover picture (data URL, JPEG or PNG) rendered from the scene; a vector view is drawn without one. */
  coverImage?: { dataUrl: string; width: number; height: number };
}

type RGB = [number, number, number];
const INK: RGB = [20, 20, 20];
const MUTED: RGB = [105, 105, 105];
const LIGHT: RGB = [160, 160, 160];
const RULE: RGB = [205, 205, 205];
/** The one accent: the app's amber. */
export const ACCENT: RGB = [217, 119, 6];

export interface PlanPage { title: string; page: number }

/** What the plans hold (for the contents list and the report). */
export interface PlanResult { doc: jsPDF; pages: PlanPage[]; pageCount: number }

class Pen {
  doc: jsPDF;
  paper: PaperSize;
  W: number;
  H: number;
  constructor(paper: PaperSize) {
    this.paper = paper;
    this.doc = new jsPDF({ unit: 'pt', format: paper, orientation: 'portrait', compress: true });
    this.W = PAPER[paper].w; this.H = PAPER[paper].h;
    this.doc.setLineCap('butt');
    this.doc.setLineJoin('miter');
  }
  font(size: number, style: 'normal' | 'bold' | 'italic' = 'normal', color: RGB = INK) {
    this.doc.setFont('helvetica', style); this.doc.setFontSize(size); this.doc.setTextColor(...color);
  }
  stroke(color: RGB = INK, width = 0.6, dash: number[] = []) {
    this.doc.setDrawColor(...color); this.doc.setLineWidth(width); this.doc.setLineDashPattern(dash, 0);
  }
  fill(gray: number | RGB) {
    if (typeof gray === 'number') { const g = Math.round(gray * 255); this.doc.setFillColor(g, g, g); } else this.doc.setFillColor(...gray);
  }
  text(s: string, x: number, y: number, opts: { align?: 'left' | 'center' | 'right'; angle?: number } = {}) {
    if (opts.angle === 90) {
      const w = this.doc.getTextWidth(s);
      const start = opts.align === 'center' ? y + w / 2 : opts.align === 'right' ? y + w : y;
      this.doc.text(s, x, start, { angle: 90 });
      return;
    }
    this.doc.text(s, x, y, { align: opts.align ?? 'left' });
  }
  width(s: string) { return this.doc.getTextWidth(s); }
  wrap(s: string, w: number): string[] { return this.doc.splitTextToSize(s, w) as string[]; }
  poly(pts: P2[], style: 'S' | 'F' | 'FD') {
    if (pts.length < 2) return;
    this.doc.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts.slice(1)) this.doc.lineTo(p[0], p[1]);
    this.doc.close();
    if (style === 'S') this.doc.stroke(); else if (style === 'F') this.doc.fill(); else this.doc.fillStroke();
  }
  arrow(x: number, y: number, dx: number, dy: number, size = 4) {
    const len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
    const bx = x - ux * size, by = y - uy * size, w = size * 0.35;
    this.doc.setFillColor(...INK);
    this.doc.triangle(x, y, bx - uy * w, by + ux * w, bx + uy * w, by - ux * w, 'F');
  }
  /** Horizontal dimension from x1 to x2 at height y (extension lines from `fromY`). */
  dimH(x1: number, x2: number, y: number, label: string, fromY?: number) {
    const [a, b] = x1 <= x2 ? [x1, x2] : [x2, x1];
    this.stroke(INK, 0.35);
    if (fromY !== undefined) {
      const dir = y > fromY ? 1 : -1;
      for (const x of [a, b]) this.doc.line(x, fromY + dir * 2, x, y + dir * 3);
    }
    this.doc.line(a, y, b, y);
    if (b - a > 9) { this.arrow(a, y, -1, 0); this.arrow(b, y, 1, 0); }
    this.font(6.5, 'normal', INK);
    const tw = this.width(label);
    const fits = tw + 4 < b - a;
    const tx = fits ? (a + b) / 2 : b + 3 + tw / 2;
    if (fits) { this.fill(1); this.doc.rect(tx - tw / 2 - 1.5, y - 3.6, tw + 3, 7.2, 'F'); }
    this.text(label, tx, y + 2.3, { align: 'center' });
  }
  /** Vertical dimension from y1 to y2 at x (extension lines from `fromX`). */
  dimV(y1: number, y2: number, x: number, label: string, fromX?: number) {
    const [a, b] = y1 <= y2 ? [y1, y2] : [y2, y1];
    this.stroke(INK, 0.35);
    if (fromX !== undefined) {
      const dir = x > fromX ? 1 : -1;
      for (const y of [a, b]) this.doc.line(fromX + dir * 2, y, x + dir * 3, y);
    }
    this.doc.line(x, a, x, b);
    if (b - a > 9) { this.arrow(x, a, 0, -1); this.arrow(x, b, 0, 1); }
    this.font(6.5, 'normal', INK);
    const tw = this.width(label);
    const fits = tw + 4 < b - a;
    const cy = fits ? (a + b) / 2 : a - 3 - tw / 2;
    if (fits) { this.fill(1); this.doc.rect(x - 3.6, cy - tw / 2 - 1.5, 7.2, tw + 3, 'F'); }
    this.text(label, x + 2.3, cy, { angle: 90, align: 'center' });
  }
  balloon(x: number, y: number, n: number | string, r = 6.5) {
    this.stroke(ACCENT, 0.8);
    this.fill(1);
    this.doc.circle(x, y, r, 'FD');
    this.font(n.toString().length > 2 ? 5.5 : 7, 'bold', ACCENT);
    this.text(String(n), x, y + 2.4, { align: 'center' });
  }
}

const IN = (unit: LengthUnit) => (v: number) => dimBare(v, unit);

/** Screen mapping for a view drawn at `s` points per inch with its bounds' min corner at (x, bottom). */
function mapper(b: Bounds2, s: number, x: number, bottom: number) {
  return (p: P2): P2 => [x + (p[0] - b.minX) * s, bottom - (p[1] - b.minY) * s];
}

function drawOrtho(pen: Pen, v: OrthoView, s: number, x: number, bottom: number) {
  const m = mapper(v.bounds, s, x, bottom);
  const hidden = v.strokes.filter((st) => st.hidden), seen = v.strokes.filter((st) => !st.hidden);
  pen.stroke(LIGHT, 0.4, [2.2, 1.6]);
  for (const st of hidden) { const a = m(st.a), b = m(st.b); pen.doc.line(a[0], a[1], b[0], b[1]); }
  pen.stroke(INK, 0.7);
  for (const st of seen) { const a = m(st.a), b = m(st.b); pen.doc.line(a[0], a[1], b[0], b[1]); }
  pen.stroke(INK, 0.6);
  return m;
}

function header(pen: Pen, project: FurnitureProject, section: string) {
  pen.font(8.5, 'bold', INK);
  pen.text(project.name.trim() || 'Untitled project', MARGIN, MARGIN + 6);
  pen.font(8.5, 'bold', ACCENT);
  pen.text(section.toUpperCase(), pen.W - MARGIN, MARGIN + 6, { align: 'right' });
  pen.stroke(RULE, 0.5);
  pen.doc.line(MARGIN, MARGIN + 12, pen.W - MARGIN, MARGIN + 12);
}

function newPage(pen: Pen, project: FurnitureProject, section: string, pages: PlanPage[], first = false) {
  if (!first) pen.doc.addPage(pen.paper, 'portrait');
  const page = pen.doc.getNumberOfPages();
  if (!pages.some((p) => p.title === section)) pages.push({ title: section, page });
  header(pen, project, section);
  return contentBox(pen.paper);
}

/** Vector isometric drawing (filled faces, back to front). */
function drawIso(pen: Pen, iso: IsoPart[], box: { x: number; y: number; w: number; h: number }) {
  const all = iso.flatMap((p) => p.faces.flatMap((f) => f.pts));
  if (!all.length) return null;
  const minX = Math.min(...all.map((p) => p[0])), maxX = Math.max(...all.map((p) => p[0]));
  const minY = Math.min(...all.map((p) => p[1])), maxY = Math.max(...all.map((p) => p[1]));
  const s = Math.min(box.w / Math.max(maxX - minX, 1e-6), box.h / Math.max(maxY - minY, 1e-6));
  const ox = box.x + (box.w - (maxX - minX) * s) / 2, oy = box.y + (box.h + (maxY - minY) * s) / 2;
  const m = (p: P2): P2 => [ox + (p[0] - minX) * s, oy - (p[1] - minY) * s];
  pen.stroke(INK, 0.55);
  for (const part of iso) for (const f of part.faces) { pen.fill(f.shade); pen.poly(f.pts.map(m), 'FD'); }
  return { map: m, bounds: { x: ox, y: oy - (maxY - minY) * s, w: (maxX - minX) * s, h: (maxY - minY) * s } };
}

function coverPage(pen: Pen, project: FurnitureProject, parts: FurnitureObject[], groups: PartGroup[], sections: CutListSection[], pages: PlanPage[], opts: PlanOptions) {
  pen.doc.setPage(1);
  const unit = project.unit;
  const box = pieceBox(parts);
  const x = MARGIN, w = pen.W - 2 * MARGIN;
  pen.font(9, 'bold', ACCENT);
  pen.text('BUILD PLANS', x, MARGIN + 14);
  pen.font(26, 'bold', INK);
  const title = pen.wrap(project.name.trim() || 'Untitled project', w);
  title.slice(0, 2).forEach((t, i) => pen.text(t, x, MARGIN + 44 + i * 28));
  let y = MARGIN + 44 + Math.min(2, title.length) * 28 - 6;
  pen.font(13, 'normal', INK);
  pen.text(overallSize(box.size, unit), x, y + 8);
  pen.font(9.5, 'normal', MUTED);
  pen.text(planDate(opts.date ?? new Date()), x, y + 24);
  y += 40;
  pen.stroke(RULE, 0.5); pen.doc.line(x, y, x + w, y);
  const imgBox = { x, y: y + 14, w, h: Math.min(390, pen.H - y - 260) };
  if (opts.coverImage) {
    const r = Math.min(imgBox.w / opts.coverImage.width, imgBox.h / opts.coverImage.height);
    const iw = opts.coverImage.width * r, ih = opts.coverImage.height * r;
    const fmt = opts.coverImage.dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
    pen.doc.addImage(opts.coverImage.dataUrl, fmt, imgBox.x + (imgBox.w - iw) / 2, imgBox.y + (imgBox.h - ih) / 2, iw, ih, undefined, 'FAST');
  } else {
    drawIso(pen, isoParts(parts), { x: imgBox.x + 40, y: imgBox.y + 10, w: imgBox.w - 80, h: imgBox.h - 20 });
  }
  y = imgBox.y + imgBox.h + 18;
  pen.stroke(RULE, 0.5); pen.doc.line(x, y, x + w, y);
  // Summary
  const pieces = groups.reduce((n, g) => n + g.item.quantity, 0);
  const sheets = sections.filter((s) => s.kind === 'sheet').reduce((n, s) => n + (s.sheets?.sheets ?? 0), 0);
  const bf = sections.filter((s) => s.kind === 'lumber').reduce((n, s) => n + (s.boardFeet ?? 0), 0);
  const stats: Array<[string, string]> = [
    ['Parts', `${pieces} (${groups.length} unique)`],
    ['Joints', String((project.joints ?? []).length)],
    ...(sheets ? [['Sheets', `${sheets} × 4×8`] as [string, string]] : []),
    ...(bf > 0.05 ? [['Lumber', `${Math.round(bf * 10) / 10} bd ft`] as [string, string]] : []),
  ];
  const colW = w / Math.max(stats.length, 1);
  stats.forEach(([k, v], i) => {
    pen.font(7.5, 'bold', MUTED); pen.text(k.toUpperCase(), x + i * colW, y + 18);
    pen.font(11, 'normal', INK); pen.text(v, x + i * colW, y + 33);
  });
  y += 52;
  pen.font(7.5, 'bold', MUTED); pen.text('CONTENTS', x, y);
  y += 6;
  pen.font(9.5, 'normal', INK);
  const rows = pages.filter((p) => p.page > 1);
  const half = Math.ceil(rows.length / 2);
  rows.forEach((p, i) => {
    const cx = x + (i < half ? 0 : w / 2 + 10), cy = y + 14 * ((i % half) + 1);
    const cw = w / 2 - 10;
    pen.font(9.5, 'normal', INK); pen.text(p.title, cx, cy);
    pen.font(9.5, 'normal', MUTED); pen.text(String(p.page), cx + cw, cy, { align: 'right' });
    pen.stroke(RULE, 0.3, [0.5, 1.5]);
    pen.doc.line(cx + pen.width(p.title) + 4, cy, cx + cw - pen.width(String(p.page)) - 4, cy);
  });
  pen.stroke();
  pen.font(7, 'italic', MUTED);
  pen.text(`Sizes are finished sizes in ${unit === 'mm' ? 'millimeters' : unit === 'cm' ? 'centimeters' : 'inches'}. Check them against your stock before cutting.`, x, pen.H - MARGIN - 22);
}

function viewsPage(pen: Pen, project: FurnitureProject, parts: FurnitureObject[], pages: PlanPage[]) {
  const unit = project.unit, f = IN(unit);
  const cb = newPage(pen, project, 'Front, side and top views', pages);
  const box = pieceBox(parts);
  const front = orthoView(parts, 'front'), side = orthoView(parts, 'side'), top = orthoView(parts, 'top');
  const W = box.size.w, H = box.size.h, D = box.size.d;
  const gap = 56, padL = 66, padB = 40;
  const sc = niceScale({ w: W + D, h: H + D }, { w: cb.w - padL - gap - 40, h: cb.h - padB - gap - 60 });
  const s = sc.ptPerIn;
  pen.font(8, 'normal', MUTED);
  pen.text(`${sc.label} on ${PAPER[pen.paper].label} paper · hidden edges dashed`, cb.x, cb.y + 4);
  const used = { w: (W + D) * s + gap, h: (H + D) * s + gap };
  const x0 = cb.x + padL + Math.max(0, (cb.w - padL - 40 - used.w) / 2);
  const yTop = cb.y + 30 + Math.max(0, (cb.h - 60 - padB - used.h) / 2);
  // Top view above the front, right side to its right (third-angle).
  const topBottom = yTop + D * s;
  const frontBottom = topBottom + gap + H * s;
  const sideX = x0 + W * s + gap;
  drawOrtho(pen, top, s, x0, topBottom);
  drawOrtho(pen, front, s, x0, frontBottom);
  drawOrtho(pen, side, s, sideX, frontBottom);
  const label = (t: string, cx: number, y: number) => { pen.font(7.5, 'bold', MUTED); pen.text(t, cx, y, { align: 'center' }); };
  // Front: overall width below, overall height far left, levels (shelf / panel faces) near left.
  pen.dimH(x0, x0 + W * s, frontBottom + 16, f(W), frontBottom);
  label('FRONT', x0 + (W * s) / 2, frontBottom + 32);
  pen.dimV(frontBottom - H * s, frontBottom, x0 - 46, f(H), x0);
  const levels = levelLines(parts, box);
  if (levels.length > 2 && levels.length <= 24) {
    for (let i = 0; i + 1 < levels.length; i++) {
      const a = levels[i], b = levels[i + 1];
      // Only spaces big enough to label (panel thicknesses would crowd the chain).
      pen.font(6.5);
      if ((b - a) * s < pen.width(f(b - a)) + 8) continue;
      pen.dimV(frontBottom - (b - box.min.y) * s, frontBottom - (a - box.min.y) * s, x0 - 20, f(b - a), x0);
    }
  }
  // Side: depth below, height right.
  pen.dimH(sideX, sideX + D * s, frontBottom + 16, f(D), frontBottom);
  label('RIGHT SIDE', sideX + (D * s) / 2, frontBottom + 32);
  pen.dimV(frontBottom - H * s, frontBottom, sideX + D * s + 18, f(H), sideX + D * s);
  // Top: width above, depth left.
  pen.dimH(x0, x0 + W * s, yTop - 14, f(W), yTop);
  pen.dimV(yTop, topBottom, x0 - 20, f(D), x0);
  label('TOP', x0 + (W * s) / 2, topBottom + 14);
}

/** Balloons around an exploded drawing: pushed outward from the center, nudged until they don't overlap. */
export function placeBalloons(anchors: Array<{ n: number; at: P2 }>, center: P2, frame: { x: number; y: number; w: number; h: number }, r = 7, reach = 26): Array<{ n: number; at: P2; ball: P2 }> {
  const placed: Array<{ n: number; at: P2; ball: P2 }> = [];
  for (const a of anchors) {
    let ang = Math.atan2(a.at[1] - center[1], a.at[0] - center[0]);
    if (!Number.isFinite(ang) || (a.at[0] === center[0] && a.at[1] === center[1])) ang = -Math.PI / 2;
    let best: P2 | null = null;
    for (let k = 0; k < 36 && !best; k++) {
      const t = ang + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 18);
      for (const d of [reach, reach * 1.6, reach * 2.2]) {
        const p: P2 = [a.at[0] + Math.cos(t) * d, a.at[1] + Math.sin(t) * d];
        const inFrame = p[0] - r >= frame.x && p[0] + r <= frame.x + frame.w && p[1] - r >= frame.y && p[1] + r <= frame.y + frame.h;
        if (inFrame && placed.every((q) => Math.hypot(q.ball[0] - p[0], q.ball[1] - p[1]) > 2 * r + 2)) { best = p; break; }
      }
    }
    placed.push({ ...a, ball: best ?? [a.at[0], a.at[1] - reach] });
  }
  return placed;
}

function explodedPage(pen: Pen, project: FurnitureProject, parts: FurnitureObject[], groups: PartGroup[], pages: PlanPage[]) {
  const unit = project.unit;
  let cb = newPage(pen, project, 'Exploded view and parts', pages);
  const numbers = partNumbers(groups);
  const iso = isoParts(parts, explodeOffsets(parts));
  const drawH = Math.min(cb.h * 0.58, 420);
  const frame = { x: cb.x, y: cb.y, w: cb.w, h: drawH };
  const drawn = drawIso(pen, iso, { x: frame.x + 40, y: frame.y + 34, w: frame.w - 80, h: frame.h - 68 });
  if (drawn) {
    // Every instance of a pair (lefts and rights); one balloon for bigger sets.
    const qty = new Map(groups.map((g) => [g.no, g.item.quantity]));
    const seen = new Set<number>();
    const anchors = [...iso].reverse().flatMap((p) => {
      const n = numbers.get(p.id);
      if (n === undefined || (seen.has(n) && ((qty.get(n) ?? 1) > 2 || parts.length > 40))) return [];
      seen.add(n);
      return [{ n, at: drawn.map(p.center) }];
    });
    const c: P2 = [drawn.bounds.x + drawn.bounds.w / 2, drawn.bounds.y + drawn.bounds.h / 2];
    for (const b of placeBalloons(anchors, c, frame)) {
      pen.stroke(ACCENT, 0.4);
      const dx = b.at[0] - b.ball[0], dy = b.at[1] - b.ball[1], len = Math.hypot(dx, dy) || 1;
      pen.doc.line(b.ball[0] + (dx / len) * 6.5, b.ball[1] + (dy / len) * 6.5, b.at[0], b.at[1]);
      pen.fill(ACCENT); pen.doc.circle(b.at[0], b.at[1], 1.1, 'F');
      pen.balloon(b.ball[0], b.ball[1], b.n);
    }
  }
  // Part list
  let y = cb.y + drawH + 14;
  const cols = [0, 26, 230, 262, 400];
  const headerRow = () => {
    pen.font(7.5, 'bold', MUTED);
    ['NO.', 'PART', 'QTY', 'FINISHED SIZE (L × W × T)', 'MATERIAL'].forEach((t, i) => pen.text(t, cb.x + cols[i], y));
    pen.stroke(RULE, 0.5); pen.doc.line(cb.x, y + 4, cb.x + cb.w, y + 4);
    y += 16;
  };
  headerRow();
  for (const g of groups) {
    if (y > cb.y + cb.h - 6) { cb = newPage(pen, project, 'Exploded view and parts', pages); y = cb.y + 6; headerRow(); }
    pen.font(8.5, 'bold', ACCENT); pen.text(String(g.no), cb.x + cols[0], y);
    pen.font(8.5, 'normal', INK);
    pen.text(pen.wrap(g.item.name, cols[2] - cols[1] - 6)[0], cb.x + cols[1], y);
    pen.text(String(g.item.quantity), cb.x + cols[2], y);
    pen.text(partSize(g.item.lengthIn, g.item.widthIn, g.item.thicknessIn, unit), cb.x + cols[3], y);
    pen.text(pen.wrap(g.item.material, cb.w - cols[4])[0], cb.x + cols[4], y);
    y += 13;
  }
}

function faceDims(d: FaceDrawing, axis: 'u' | 'v'): DimSpec[] {
  const seen = new Set<string>();
  const out: DimSpec[] = [];
  for (const f of d.features) for (const dm of f.dims) {
    if (dm.axis !== axis || dm.from === 'center') continue;
    const k = `${dm.from}|${Math.round(dm.value * 64)}`;
    if (seen.has(k)) continue;
    seen.add(k); out.push(dm);
  }
  return out.slice(0, 8);
}

const DRAW_W = 292;
const TEXT_X = 312;

type CardLine = { t: string; style: 'normal' | 'bold'; color: RGB; letter?: string; indent?: boolean };

function cardText(pen: Pen, g: PartGroup, d: FaceDrawing, unit: LengthUnit, w: number): CardLine[] {
  const o = g.parts[0];
  const out: CardLine[] = [];
  const add = (t: string, style: 'normal' | 'bold' = 'normal', color: RGB = INK, letter?: string) => {
    pen.font(8, style);
    pen.wrap(t, w - (letter ? 12 : 0)).forEach((line, i) => out.push({ t: line, style, color, ...(letter ? (i === 0 ? { letter } : { indent: true }) : {}) }));
  };
  add(`Finished: ${partSize(g.item.lengthIn, g.item.widthIn, g.item.thicknessIn, unit)}`, 'bold');
  add(`Material: ${finishText(o)}`);
  add(`Grain: ${grainText(o)}`);
  if (g.item.usedIn) add(`Used in: ${g.item.usedIn}`, 'normal', MUTED);
  const b = o.board;
  if (b?.cornerRadius && b.cornerRadius > 0) add(`Corners: ${dim(b.cornerRadius, unit)} radius`);
  if (b?.edge && b.edge !== 'none') add(`Edges: ${b.edge}${b.edgeSize ? ` ${dim(b.edgeSize, unit)}` : ''}`);
  const hand = handedNote(g);
  if (hand) add(hand, 'normal', MUTED);
  if (d.features.length) out.push({ t: '', style: 'normal', color: INK });
  for (const f of d.features) add(f.text, 'normal', INK, f.letter);
  for (const n of d.notes) add(`• ${n}`, 'normal', MUTED);
  return out;
}

/** Drawing size for a face inside the card's drawing column. */
function faceScale(d: FaceDrawing): { s: number; h: number; uRows: number; vRows: number } {
  const uRows = Math.min(8, faceDims(d, 'u').length), vRows = Math.min(8, faceDims(d, 'v').length);
  const availW = DRAW_W - 40 - vRows * 12;
  const s = Math.min(availW / Math.max(d.u, 1e-6), (d.features.length ? 150 : 84) / Math.max(d.v, 1e-6));
  return { s, h: 40 + d.v * s + uRows * 12 + 18, uRows, vRows };
}

function drawCard(pen: Pen, g: PartGroup, d: FaceDrawing, unit: LengthUnit, x: number, y: number, w: number, lines: CardLine[], height: number) {
  pen.stroke(RULE, 0.6);
  pen.doc.roundedRect(x, y, w, height, 4, 4, 'S');
  pen.balloon(x + 14, y + 14, g.no);
  pen.font(11, 'bold', INK);
  pen.text(pen.wrap(g.item.name, w - 120)[0], x + 26, y + 18);
  pen.font(10, 'bold', ACCENT);
  pen.text(`×${g.item.quantity}`, x + w - 12, y + 18, { align: 'right' });
  // Text column
  let ty = y + 40;
  for (const l of lines) {
    if (l.letter) { pen.font(8, 'bold', ACCENT); pen.text(l.letter, x + TEXT_X, ty); }
    pen.font(8, l.style, l.color);
    pen.text(l.t, x + TEXT_X + (l.letter || l.indent ? 12 : 0), ty);
    ty += 10.5;
  }
  // Drawing
  const f = IN(unit);
  const sc = faceScale(d);
  const fx = x + 30, fy = y + 44;
  const fw = d.u * sc.s, fh = d.v * sc.s;
  if (d.round) {
    pen.stroke(INK, 0.8);
    pen.doc.rect(fx, fy, fw, fh, 'S');
    pen.dimH(fx, fx + fw, fy + fh + 14, f(d.u), fy + fh);
    pen.dimV(fy, fy + fh, fx - 14, f(d.v), fx);
    return;
  }
  const U = (u: number) => fx + u * sc.s, V = (v: number) => fy + fh - v * sc.s;
  pen.stroke(INK, 0.9); pen.fill(1);
  pen.doc.rect(fx, fy, fw, fh, 'FD');
  // Grain arrow just above the face.
  if (!/No grain|Metal/.test(grainText(g.parts[0]))) {
    const gy = fy - 8, gx0 = fx + fw / 2 - Math.min(40, fw / 3), gx1 = fx + fw / 2 + Math.min(40, fw / 3);
    pen.stroke(MUTED, 0.5); pen.doc.line(gx0, gy, gx1, gy);
    pen.doc.setFillColor(...MUTED);
    pen.doc.triangle(gx0, gy, gx0 + 4, gy - 1.6, gx0 + 4, gy + 1.6, 'F');
    pen.doc.triangle(gx1, gy, gx1 - 4, gy - 1.6, gx1 - 4, gy + 1.6, 'F');
    pen.font(6, 'bold', MUTED); pen.text('GRAIN', gx1 + 4, gy + 2);
  }
  for (const feat of d.features) {
    feat.elements.forEach((e, i) => {
      const solid = e.side === 'near' || e.side === 'through';
      pen.stroke(INK, 0.6, solid ? [] : [2, 1.5]);
      if (e.shape === 'rect') {
        const x0 = U(e.u0), x1 = U(e.u1), y0 = V(e.v1), y1 = V(e.v0);
        if (solid) { pen.fill(e.side === 'through' ? 1 : 0.86); pen.doc.rect(x0, y0, x1 - x0, y1 - y0, 'FD'); }
        else pen.doc.rect(x0, y0, x1 - x0, y1 - y0, 'S');
        if (i === 0) { pen.font(7, 'bold', ACCENT); pen.text(feat.letter, (x0 + x1) / 2, (y0 + y1) / 2 + 2.4, { align: 'center' }); }
      } else {
        const cx = U(e.u), cy = V(e.v), r = Math.max(0.8, e.r * sc.s);
        if (solid) { pen.fill(e.side === 'through' ? 1 : 0.86); pen.doc.circle(cx, cy, r, 'FD'); } else pen.doc.circle(cx, cy, r, 'S');
        pen.stroke(INK, 0.25); pen.doc.line(cx - r - 1.5, cy, cx + r + 1.5, cy); pen.doc.line(cx, cy - r - 1.5, cx, cy + r + 1.5);
        if (i === 0) { pen.font(7, 'bold', ACCENT); pen.text(feat.letter, cx + r + 2, cy - r - 1); }
      }
    });
  }
  pen.stroke();
  // Overall size: length below everything, width at the left.
  const uDims = faceDims(d, 'u'), vDims = faceDims(d, 'v');
  const uRows = stackRows(uDims.map((dm) => [U(dm.from === 'left' ? 0 : d.u), U(dm.at)] as [number, number]));
  uDims.forEach((dm, i) => pen.dimH(U(dm.from === 'left' ? 0 : d.u), U(dm.at), fy + fh + 12 + uRows[i] * 12, f(dm.value), fy + fh));
  const uBottom = fy + fh + 12 + (uRows.length ? Math.max(...uRows) + 1 : 0) * 12;
  pen.dimH(fx, fx + fw, uBottom + 2, f(d.u), fy + fh);
  const vRows = stackRows(vDims.map((dm) => [V(dm.from === 'bottom' ? 0 : d.v), V(dm.at)] as [number, number]));
  vDims.forEach((dm, i) => pen.dimV(V(dm.from === 'bottom' ? 0 : d.v), V(dm.at), fx + fw + 12 + vRows[i] * 12, f(dm.value), fx + fw));
  pen.dimV(fy, fy + fh, fx - 14, f(d.v), fx);
  pen.font(6.5, 'normal', MUTED);
  pen.text(`${f(d.thickness)} thick`, fx, uBottom + 16);
}

function partPages(pen: Pen, project: FurnitureProject, groups: PartGroup[], pages: PlanPage[]) {
  const unit = project.unit;
  const cb0 = contentBox(pen.paper);
  const textW = cb0.w - TEXT_X - 12;
  const cards = groups.map((g) => {
    const d = faceDrawing(project, g.parts[0]);
    const lines = cardText(pen, g, d, unit, textW);
    const h = Math.max(faceScale(d).h + 24, 46 + lines.length * 10.5) + 6;
    return { g, d, lines, h };
  });
  const layout = paginate(cards.map((c) => c.h), cb0.h, 10);
  for (const idx of layout) {
    const cb = newPage(pen, project, 'Parts', pages);
    let y = cb.y;
    for (const i of idx) {
      const c = cards[i];
      drawCard(pen, c.g, c.d, unit, cb.x, y, cb.w, c.lines, Math.min(c.h, cb.h));
      y += c.h + 10;
    }
  }
}

function cutListPages(pen: Pen, project: FurnitureProject, groups: PartGroup[], pages: PlanPage[]) {
  const unit = project.unit;
  let cb = newPage(pen, project, 'Cut list', pages);
  const cols = [0, 24, 160, 186, 236, 286, 330, 418];
  let y = cb.y + 6;
  const head = () => {
    pen.font(7.5, 'bold', MUTED);
    ['NO.', 'PART', 'QTY', 'LENGTH', 'WIDTH', 'THICK', 'MATERIAL', 'JOINERY / NOTES'].forEach((t, i) => pen.text(t, cb.x + cols[i], y));
    pen.stroke(RULE, 0.5); pen.doc.line(cb.x, y + 4, cb.x + cb.w, y + 4);
    y += 15;
  };
  head();
  let last = '';
  for (const g of groups) {
    const it = g.item;
    pen.font(7.5, 'normal');
    const notes = pen.wrap(it.notes ?? '', cb.w - cols[7]);
    const mat = pen.wrap(it.material, cols[7] - cols[6] - 4);
    const nameLines = pen.wrap(it.name, cols[2] - cols[1] - 4);
    const rows = Math.max(1, notes.length, mat.length, nameLines.length);
    const h = rows * 9.5 + 4;
    if (y + h > cb.y + cb.h) { cb = newPage(pen, project, 'Cut list', pages); y = cb.y + 6; head(); last = ''; }
    if (last && last !== it.material) { pen.stroke(RULE, 0.3); pen.doc.line(cb.x, y - 8, cb.x + cb.w, y - 8); }
    last = it.material;
    pen.font(8, 'bold', ACCENT); pen.text(String(g.no), cb.x + cols[0], y);
    pen.font(8, 'normal', INK);
    nameLines.forEach((t, i) => pen.text(t, cb.x + cols[1], y + i * 9.5));
    pen.text(String(it.quantity), cb.x + cols[2], y);
    pen.text(dim(it.lengthIn, unit), cb.x + cols[3], y);
    pen.text(dim(it.widthIn, unit), cb.x + cols[4], y);
    pen.text(dim(it.thicknessIn, unit), cb.x + cols[5], y);
    pen.font(7.5, 'normal', INK);
    mat.forEach((t, i) => pen.text(t, cb.x + cols[6], y + i * 9.5));
    pen.font(7.5, 'normal', MUTED);
    notes.forEach((t, i) => pen.text(t, cb.x + cols[7], y + i * 9.5));
    y += h + 4;
  }
  return { cb, y };
}

type Cursor = { cb: ReturnType<typeof contentBox>; y: number };

function buyPages(pen: Pen, project: FurnitureProject, sections: CutListSection[], pages: PlanPage[], after?: Cursor) {
  const unit = project.unit;
  let cb: Cursor['cb'], y: number;
  if (after && after.cb.y + after.cb.h - after.y > 160) {
    // Room left under the cut list: carry on there.
    cb = after.cb; y = after.y + 18;
    pages.push({ title: 'Shopping list', page: pen.doc.getNumberOfPages() });
  } else {
    cb = newPage(pen, project, 'Shopping list', pages);
    y = cb.y + 6;
  }
  const room = (h: number) => { if (y + h > cb.y + cb.h) { cb = newPage(pen, project, 'Shopping list', pages); y = cb.y + 6; } };
  const heading = (t: string) => { room(30); pen.font(9, 'bold', ACCENT); pen.text(t.toUpperCase(), cb.x, y); y += 6; pen.stroke(RULE, 0.5); pen.doc.line(cb.x, y, cb.x + cb.w, y); y += 14; };
  const buy = sections.filter((s) => s.summary);
  if (buy.length) {
    heading('Stock');
    for (const s of buy) {
      room(14);
      pen.font(9, 'bold', INK); pen.text(s.title, cb.x, y);
      pen.font(9, 'normal', INK); pen.text(s.summary, cb.x + 190, y);
      y += 14;
    }
    y += 8;
  }
  const sticks = lumberBuyList(sections);
  if (sticks.some((b) => b.sticks.length || b.oversize.length)) {
    heading('Lumber: sticks to buy and how to cut them');
    const barW = cb.w - 150;
    for (const b of sticks) {
      room(30);
      pen.font(9, 'bold', INK); pen.text(`${b.material} · ${b.profile}`, cb.x, y);
      pen.font(9, 'normal', INK); pen.text(b.text, cb.x + 190, y);
      y += 12;
      b.sticks.forEach((st, i) => {
        room(26);
        const s = barW / st.length;
        const bx = cb.x + 70, by = y;
        pen.font(7.5, 'normal', MUTED); pen.text(`#${i + 1} · ${stickFeet(st.length)}`, cb.x, by + 8);
        pen.stroke(INK, 0.6); pen.fill(1); pen.doc.rect(bx, by, barW, 12, 'S');
        for (const [a, c] of stickSegments(st.cuts)) {
          pen.fill(0.88); pen.stroke(INK, 0.5); pen.doc.rect(bx + a * s, by, (c - a) * s, 12, 'FD');
          pen.font(6.5, 'normal', INK);
          const lab = dimBare(c - a, unit);
          if (pen.width(lab) + 3 < (c - a) * s) pen.text(lab, bx + ((a + c) / 2) * s, by + 8.3, { align: 'center' });
        }
        pen.font(7, 'normal', MUTED); pen.text(`${dim(st.left, unit)} left`, bx + barW + 6, by + 8);
        y += 18;
      });
      for (const o of b.oversize) { room(12); pen.font(8, 'normal', MUTED); pen.text(`One part is ${dim(o, unit)}, longer than 12 ft stock: splice it or special-order.`, cb.x + 70, y); y += 12; }
      y += 6;
    }
  }
  const hardware = projectHardware(project);
  if (hardware.length) {
    heading('Hardware');
    for (const h of hardware) {
      room(13);
      pen.font(9, 'normal', INK); pen.text(h.name, cb.x, y);
      pen.text(`×${h.quantity}`, cb.x + 300, y, { align: 'right' });
      y += 13;
    }
  }
  if (!buy.length && !hardware.length) { pen.font(9, 'normal', MUTED); pen.text('Nothing to buy: the project has no stock parts yet.', cb.x, y); }
}

function sheetDiagram(pen: Pen, unit: LengthUnit, layout: SheetLayout, x: number, y: number, w: number, grain: boolean) {
  const s = w / 96, h = 48 * s;
  pen.stroke(INK, 0.9); pen.fill(1); pen.doc.rect(x, y, w, h, 'S');
  for (const o of layout.offcuts) {
    pen.stroke(LIGHT, 0.4, [2, 2]); pen.doc.rect(x + o.x * s, y + o.y * s, o.w * s, o.h * s, 'S');
    pen.font(6, 'italic', LIGHT);
    if (o.w * s > 50 && o.h * s > 14) pen.text(`offcut ${dimBare(o.w, unit)} × ${dimBare(o.h, unit)}`, x + (o.x + o.w / 2) * s, y + (o.y + o.h / 2) * s + 2, { align: 'center' });
  }
  pen.stroke();
  for (const p of layout.panels) {
    const px = x + p.x * s, py = y + p.y * s, pw = p.w * s, ph = p.h * s;
    pen.stroke(INK, 0.6); pen.fill(0.92); pen.doc.rect(px, py, pw, ph, 'FD');
    if (grain && pw > 24 && ph > 10) {
      // Faint grain strokes along the part's length.
      pen.stroke([215, 215, 215], 0.3);
      const along = !p.rotated;
      const n = 3;
      for (let k = 1; k <= n; k++) {
        if (along) { const gy = py + (ph * k) / (n + 1); pen.doc.line(px + pw * 0.15, gy, px + pw * 0.35, gy); }
        else { const gx = px + (pw * k) / (n + 1); pen.doc.line(gx, py + ph * 0.15, gx, py + ph * 0.35); }
      }
    }
    const name = p.name ?? '';
    const size = `${dimBare(p.length, unit)} × ${dimBare(p.width, unit)}`;
    let fs = 7.5;
    pen.font(fs, 'bold', INK);
    while (fs > 4.5 && (pen.width(name) > pw - 4 || pen.width(size) > pw - 4)) { fs -= 0.5; pen.font(fs, 'bold', INK); }
    const lines = ph > fs * 2.6 ? [name, size] : ph > fs * 1.3 ? [`${name} ${size}`] : [];
    lines.forEach((t, i) => {
      pen.font(fs, i === 0 && lines.length === 2 ? 'bold' : 'normal', INK);
      const cy = py + ph / 2 + (i - (lines.length - 1) / 2) * fs * 1.15 + fs * 0.35;
      if (pen.width(t) <= pw - 3) pen.text(t, px + pw / 2, cy, { align: 'center' });
    });
  }
  // Sheet size
  pen.dimH(x, x + w, y + h + 12, dimBare(96, unit), y + h);
  pen.dimV(y, y + h, x - 12, dimBare(48, unit), x);
  return h;
}

function sheetPages(pen: Pen, project: FurnitureProject, sections: CutListSection[], pages: PlanPage[]) {
  const unit = project.unit;
  const secs = sheetBuyList(sections).filter((s) => s.sheets.layouts.length || s.sheets.oversize);
  if (!secs.length) return;
  const blocks = secs.flatMap((s) => s.sheets.layouts.map((l, i) => ({ s, l, i, n: s.sheets.layouts.length })));
  const cb0 = contentBox(pen.paper);
  const w = cb0.w - 20;
  const blockH = 48 * (w / 96) + 58;
  const pagesIdx = paginate(blocks.map(() => blockH), cb0.h, 14);
  for (const idx of pagesIdx) {
    const cb = newPage(pen, project, 'Sheet layouts', pages);
    let y = cb.y + 4;
    for (const k of idx) {
      const b = blocks[k];
      pen.font(9.5, 'bold', INK); pen.text(`${b.s.title} — sheet ${b.i + 1} of ${b.n}`, cb.x, y + 6);
      pen.font(8, 'normal', MUTED);
      pen.text(`${Math.round(b.l.used * 100)}% used · 4×8 · 1/8" kerf · ${b.s.items[0]?.species === 'plywood' ? 'face grain runs the 8 ft way' : 'no grain'}`, cb.x + cb.w, y + 6, { align: 'right' });
      sheetDiagram(pen, unit, b.l, cb.x + 20, y + 16, w, b.s.items[0]?.species === 'plywood');
      y += blockH + 14;
    }
    const over = secs.flatMap((s) => s.sheets.oversizeParts.map((o) => `${s.title}: ${o.name ?? 'part'} ${dim(o.length, unit)} × ${dim(o.width, unit)} is bigger than a sheet`));
    if (over.length && idx === pagesIdx[pagesIdx.length - 1]) {
      pen.font(8, 'normal', MUTED);
      over.forEach((t, i) => pen.text(t, cb.x, cb.y + cb.h - 10 - (over.length - 1 - i) * 11));
    }
  }
}

function stepHeight(pen: Pen, st: Step, w: number): number {
  pen.font(8.5, 'normal');
  const joints = st.joints.reduce((n, j) => n + pen.wrap(`• ${j}`, w).length, 0);
  const lines = pen.wrap(st.hint, w).length + 1 + Math.ceil(st.parts.length / 2) + joints + (st.hardware?.length ?? 0) + (st.joints.length ? 1 : 0) + (st.hardware?.length ? 1 : 0);
  return 24 + lines * 11;
}

function assemblyPages(pen: Pen, project: FurnitureProject, steps: Step[], pages: PlanPage[]) {
  const cb0 = contentBox(pen.paper);
  const tw = cb0.w - 34;
  const heights = steps.map((st) => stepHeight(pen, st, tw));
  const note = 34;
  const layout = paginate([note, ...heights], cb0.h, 10);
  for (const idx of layout) {
    const cb = newPage(pen, project, 'Assembly', pages);
    let y = cb.y + 4;
    for (const k of idx) {
      if (k === 0) {
        pen.font(8.5, 'italic', MUTED);
        pen.wrap('A suggested order, worked out from the joints and how the parts sit. Change it to suit your clamps and shop; dry-fit each step before glue.', cb.w).forEach((t, i) => pen.text(t, cb.x, y + 6 + i * 11));
        y += note + 10;
        continue;
      }
      const st = steps[k - 1];
      const x = cb.x + 34;
      pen.stroke(ACCENT, 0.8); pen.fill(ACCENT); pen.doc.circle(cb.x + 11, y + 6, 10, 'F');
      pen.font(10, 'bold', [255, 255, 255]); pen.text(String(st.n), cb.x + 11, y + 9.5, { align: 'center' });
      pen.font(11, 'bold', INK); pen.text(st.title, x, y + 10);
      let ly = y + 24;
      pen.font(8.5, 'italic', MUTED);
      for (const t of pen.wrap(st.hint, tw)) { pen.text(t, x, ly); ly += 11; }
      ly += 2;
      pen.font(8.5, 'normal', INK);
      const names = st.parts.map((p) => `${p.no !== undefined ? `#${p.no} ` : ''}${p.name}`);
      for (let i = 0; i < names.length; i += 2) {
        pen.text(names[i], x, ly);
        if (names[i + 1]) pen.text(names[i + 1], x + tw / 2, ly);
        ly += 11;
      }
      if (st.joints.length) {
        pen.font(7.5, 'bold', MUTED); pen.text('JOINTS', x, ly + 2); ly += 13;
        pen.font(8.5, 'normal', INK);
        for (const j of st.joints) pen.wrap(`• ${j}`, tw).forEach((t, i) => { pen.text(i ? `  ${t}` : t, x, ly); ly += 11; });
      }
      if (st.hardware?.length) {
        pen.font(7.5, 'bold', MUTED); pen.text('HARDWARE', x, ly + 2); ly += 13;
        pen.font(8.5, 'normal', INK);
        for (const h of st.hardware) { pen.text(`• ${h}`, x, ly); ly += 11; }
      }
      y += heights[k - 1] + 10;
      pen.stroke(RULE, 0.4); pen.doc.line(cb.x, y - 6, cb.x + cb.w, y - 6);
    }
  }
}

function footers(pen: Pen, opts: PlanOptions) {
  const n = pen.doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    pen.doc.setPage(i);
    pen.stroke(RULE, 0.5);
    pen.doc.line(MARGIN, pen.H - MARGIN + 6, pen.W - MARGIN, pen.H - MARGIN + 6);
    pen.font(7.5, 'normal', MUTED);
    pen.text(`Made with The Workbench · ${planDate(opts.date ?? new Date())}`, MARGIN, pen.H - MARGIN + 18);
    pen.text(`Page ${i} of ${n}`, pen.W - MARGIN, pen.H - MARGIN + 18, { align: 'right' });
  }
}

/**
 * The whole set of build plans as one PDF: cover, three views, exploded view
 * with the part list, a card per unique part, cut list, shopping list with
 * stick layouts, sheet layouts, and a suggested assembly order.
 */
export function buildPlansPdf(project: FurnitureProject, opts: PlanOptions = {}): PlanResult {
  const pen = new Pen(opts.paper ?? 'letter');
  const parts = planParts(project);
  const groups = groupParts(project);
  const sections = cutListSections(groups.map((g) => g.item), project.unit);
  const pages: PlanPage[] = [{ title: 'Cover', page: 1 }];
  if (parts.length) {
    viewsPage(pen, project, parts, pages);
    explodedPage(pen, project, parts, groups, pages);
    partPages(pen, project, groups, pages);
    const end = cutListPages(pen, project, groups, pages);
    buyPages(pen, project, sections, pages, end);
    sheetPages(pen, project, sections, pages);
    assemblyPages(pen, project, assemblySteps(project, partNumbers(groups)), pages);
  }
  coverPage(pen, project, parts, groups, sections, pages, opts);
  footers(pen, opts);
  return { doc: pen.doc, pages, pageCount: pen.doc.getNumberOfPages() };
}

export function plansFileName(project: Pick<FurnitureProject, 'name'>): string {
  return `${project.name.trim() || 'Workbench'} build plans.pdf`;
}
