import type { WoodMaterial } from '../types/furniture';

/** How a part is bought: from 4×8 sheets, as lumber by the board foot, or not wood stock at all. */
export type StockKind = 'sheet' | 'lumber' | 'other';

/** A 4×8 sheet, length (the grain/long side) first. */
export const SHEET = { length: 96, width: 48 } as const;
/** Saw kerf allowed between parts on a sheet. */
export const KERF = 1 / 8;
/** Extra lumber to buy for defects, snipe and mistakes. */
export const LUMBER_WASTE = 0.15;

/**
 * Plywood and MDF come in sheets; metal isn't wood stock. Paint-grade parts up
 * to 1" thick are assumed cut from sheet goods, thicker ones from lumber.
 */
export function stockKind(material: Pick<WoodMaterial, 'species'> | undefined, thickness: number): StockKind {
  const s = material?.species;
  if (s === 'plywood' || s === 'mdf') return 'sheet';
  if (s === 'metal_accent') return 'other';
  if (s === 'custom_paint') return thickness <= 1 + 1e-6 ? 'sheet' : 'lumber';
  return 'lumber';
}

/** Sheet goods with a face grain (plywood) keep part length along the sheet's 8' side. */
export function sheetHasGrain(material: Pick<WoodMaterial, 'species'> | undefined): boolean {
  return material?.species === 'plywood';
}

const QUARTERS = [4, 5, 6, 8, 10, 12, 16];

/**
 * Rough lumber thickness, in quarters, a finished thickness is milled from
 * (about 1/4" for surfacing): 3/4" → 4/4, 1" → 5/4, 1 1/2" → 8/4.
 */
export function roughQuarters(thickness: number): number {
  const need = (thickness + 0.25) * 4 - 1e-6;
  return QUARTERS.find((q) => q >= need) ?? Math.ceil(need);
}

/** Board feet of rough stock for one finished part (length × width × rough thickness / 144). */
export function boardFeet(length: number, width: number, thickness: number): number {
  return (length * width * (roughQuarters(thickness) / 4)) / 144;
}

/** Surfaced softwood sizes and the nominal size they're sold as (3/4" is a 1×, 1 1/2" a 2×, 5 1/2" a 6). */
const NOMINAL: Array<[number, number]> = [[0.75, 1], [1.5, 2], [2.5, 3], [3.5, 4], [5.5, 6], [7.25, 8], [9.25, 10], [11.25, 12]];
const NOMINAL_THICKNESSES = new Set([1, 2, 4]);
const nominalOf = (actual: number) => NOMINAL.find(([a]) => Math.abs(a - actual) < 1 / 32)?.[1];

/**
 * Pine at a standard surfaced cross-section is dimensional lumber, bought by its
 * nominal size: 1 1/2" × 3 1/2" is a 2×4. Returns null for anything else.
 */
export function dimensionalNominal(
  material: { species?: WoodMaterial['species'] } | undefined, thickness: number, width: number,
): { thickness: number; width: number } | null {
  if (material?.species !== 'pine') return null;
  const t = nominalOf(Math.min(thickness, width)), w = nominalOf(Math.max(thickness, width));
  if (!t || !w || !NOMINAL_THICKNESSES.has(t)) return null;
  return { thickness: t, width: w };
}

/**
 * Board feet as the lumberyard counts them: dimensional lumber by nominal size
 * (an 8' 2×4 is 5 1/3 bd ft), other lumber by rough thickness.
 */
export function lumberBoardFeet(material: { species?: WoodMaterial['species'] } | undefined, length: number, width: number, thickness: number): number {
  const n = dimensionalNominal(material, thickness, width);
  return n ? (length * n.width * n.thickness) / 144 : boardFeet(length, width, thickness);
}

/** Inches to the nearest 1/8 as 12" or 5 1/2". */
function inchLabel(inches: number): string {
  const eighths = Math.round(inches * 8);
  const whole = Math.floor(eighths / 8);
  let num = eighths % 8, den = 8;
  while (num && num % 2 === 0) { num /= 2; den /= 2; }
  return num ? `${whole ? `${whole} ` : ''}${num}/${den}"` : `${whole}"`;
}

/** What the stock is called when buying it: '2×4' for dimensional lumber, else rough thickness ('8/4'). */
export function lumberStock(material: { species?: WoodMaterial['species'] } | undefined, width: number, thickness: number): { label: string; order: number } {
  const n = dimensionalNominal(material, thickness, width);
  if (n) return { label: `${n.thickness}×${n.width}`, order: n.thickness * 4 * 100 + n.width };
  const q = roughQuarters(thickness);
  // Past 16/4 nobody sells quarter-sawn stock by that name: call it what it is, a glued-up blank.
  if (q > 16) return { label: `${inchLabel(thickness)} glued-up blank`, order: q * 100 };
  return { label: `${q}/4`, order: q * 100 };
}

export interface SheetPart { length: number; width: number; quantity: number; name?: string }

/** A rectangle on a sheet: x along the 8' side, y along the 4' side (inches from a corner). */
export interface SheetRect { x: number; y: number; w: number; h: number }

/** A panel placed on a sheet. `w`/`h` are its footprint; `rotated` means its length runs across the sheet. */
export interface PlacedPanel extends SheetRect {
  name?: string;
  /** The part's own length (grain) and width. */
  length: number;
  width: number;
  rotated: boolean;
}

export interface SheetLayout {
  panels: PlacedPanel[];
  /** Leftover rectangles big enough to keep (both sides at least 3"), after kerfs. */
  offcuts: SheetRect[];
  /** Share of this sheet the panels cover (0–1). */
  used: number;
}

export interface SheetNest {
  /** 4×8 sheets needed for the parts that fit. */
  sheets: number;
  /** Parts too big for one sheet (listed, not nested). */
  oversize: number;
  /** Share of the sheets' area the parts cover (0–1). */
  yield: number;
  /** Where each panel goes, one entry per sheet. */
  layouts: SheetLayout[];
  /** The parts counted in `oversize`, one entry per piece. */
  oversizeParts: { name?: string; length: number; width: number }[];
}

/** Offcuts smaller than this on either side are scrap. */
const MIN_OFFCUT = 3;

type Piece = { name?: string; length: number; width: number; turn: boolean };
type Candidate = { sheet: number; free: number; rotated: boolean; fit: number; side: number };

/**
 * Guillotine nesting of one sort order and split rule. Each panel goes in the
 * free rectangle it fills best (least area left, then the shorter side left),
 * on any open sheet, before a new sheet is started. A placed panel splits its
 * rectangle with one straight cut, so every layout can be cut edge to edge on
 * a table or track saw. Panels carry a kerf on their far edges; the sheet gets
 * one kerf of slack so panels can run right to its edges.
 */
function guillotine(pieces: Piece[], splitShorter: boolean, sheet: { length: number; width: number }, kerf: number) {
  const sheets: { free: SheetRect[]; panels: PlacedPanel[] }[] = [];
  const W = sheet.length + kerf, H = sheet.width + kerf;
  for (const pc of pieces) {
    const tryOn = (si: number): Candidate | null => {
      let best: Candidate | null = null;
      sheets[si].free.forEach((fr, fi) => {
        for (const rotated of pc.turn ? [false, true] : [false]) {
          const w = (rotated ? pc.width : pc.length) + kerf, h = (rotated ? pc.length : pc.width) + kerf;
          if (w > fr.w + 1e-6 || h > fr.h + 1e-6) continue;
          const fit = fr.w * fr.h - w * h, side = Math.min(fr.w - w, fr.h - h);
          if (!best || fit < best.fit - 1e-6 || (Math.abs(fit - best.fit) <= 1e-6 && side < best.side)) best = { sheet: si, free: fi, rotated, fit, side };
        }
      });
      return best;
    };
    let pick: Candidate | null = null;
    for (let si = 0; si < sheets.length; si++) {
      const c = tryOn(si);
      if (c && (!pick || c.fit < pick.fit - 1e-6 || (Math.abs(c.fit - pick.fit) <= 1e-6 && c.side < pick.side))) pick = c;
    }
    if (!pick) {
      sheets.push({ free: [{ x: 0, y: 0, w: W, h: H }], panels: [] });
      pick = tryOn(sheets.length - 1)!;
    }
    const sh = sheets[pick.sheet];
    const fr = sh.free.splice(pick.free, 1)[0];
    const pw = pick.rotated ? pc.width : pc.length, ph = pick.rotated ? pc.length : pc.width;
    sh.panels.push({ name: pc.name, x: fr.x, y: fr.y, w: pw, h: ph, length: pc.length, width: pc.width, rotated: pick.rotated });
    const rw = fr.w - pw - kerf, rh = fr.h - ph - kerf;
    // Cut across the shorter leftover (or the longer, for the other rule), keeping the bigger offcut whole.
    const horizontal = splitShorter ? rw <= rh : rw > rh;
    const right = { x: fr.x + pw + kerf, y: fr.y, w: rw, h: horizontal ? ph + kerf : fr.h };
    const below = { x: fr.x, y: fr.y + ph + kerf, w: horizontal ? fr.w : pw + kerf, h: rh };
    for (const r of [right, below]) if (r.w > 1e-6 && r.h > 1e-6) sh.free.push(r);
  }
  return sheets;
}

const SORTS: Array<(a: Piece, b: Piece) => number> = [
  (a, b) => b.length * b.width - a.length * a.width || b.length - a.length,
  (a, b) => Math.max(b.length, b.width) - Math.max(a.length, a.width) || b.width - a.width,
  (a, b) => b.width - a.width || b.length - a.length,
  (a, b) => b.length - a.length || b.width - a.width,
];

/**
 * Nest panels on 4×8 sheets with a saw kerf (guillotine cuts, see above). It
 * tries four sort orders (area, longest side, width, length) and both split
 * rules, and keeps the layout with the fewest sheets; ties go to the one whose
 * last sheet is emptiest (the biggest offcut left over).
 * With grain (plywood) a part's length stays on the sheet's 8' side; without
 * (MDF) a part may turn 90°.
 */
export function nestSheets(parts: SheetPart[], grain: boolean, sheet = SHEET, kerf = KERF): SheetNest {
  const pieces: Piece[] = [];
  const oversizeParts: SheetNest['oversizeParts'] = [];
  const fits = (l: number, w: number) => l <= sheet.length + 1e-6 && w <= sheet.width + 1e-6;
  for (const p of parts) {
    const ok = fits(p.length, p.width) || (!grain && fits(p.width, p.length));
    for (let i = 0; i < p.quantity; i++) {
      if (ok) pieces.push({ name: p.name, length: p.length, width: p.width, turn: !grain });
      else oversizeParts.push({ name: p.name, length: p.length, width: p.width });
    }
  }
  const sheetArea = sheet.length * sheet.width;
  const area = pieces.reduce((n, pc) => n + pc.length * pc.width, 0);
  let best: ReturnType<typeof guillotine> = [];
  if (pieces.length) {
    let bestLast = Infinity;
    for (const sort of SORTS) for (const splitShorter of [true, false]) {
      const run = guillotine([...pieces].sort(sort), splitShorter, sheet, kerf);
      const last = run[run.length - 1].panels.reduce((n, pn) => n + pn.w * pn.h, 0);
      if (!best.length || run.length < best.length || (run.length === best.length && last < bestLast - 1e-6)) { best = run; bestLast = last; }
    }
  }
  const layouts: SheetLayout[] = best.map((sh) => ({
    panels: [...sh.panels].sort((a, b) => a.y - b.y || a.x - b.x),
    offcuts: sh.free
      .map((r) => ({ x: r.x, y: r.y, w: Math.min(r.w, sheet.length - r.x), h: Math.min(r.h, sheet.width - r.y) }))
      .filter((r) => r.w >= MIN_OFFCUT && r.h >= MIN_OFFCUT),
    used: sh.panels.reduce((n, pn) => n + pn.w * pn.h, 0) / sheetArea,
  }));
  return { sheets: layouts.length, oversize: oversizeParts.length, yield: layouts.length ? area / (layouts.length * sheetArea) : 0, layouts, oversizeParts };
}

/** '2.4' / '12' — board feet to one decimal. */
export function formatBoardFeet(bf: number): string {
  const r = Math.round(bf * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/** Stock lengths dimensional lumber is sold in: 8, 10 and 12 ft (inches). */
export const STICK_LENGTHS = [96, 120, 144] as const;

/** One stock stick and the parts cut from it, longest first. */
export interface Stick {
  length: number;
  cuts: number[];
  /** Offcut left after the cuts and kerfs. */
  left: number;
}

/**
 * First-fit decreasing: parts longest first, each into the first stick with
 * room, else a new stick. Every cut after the first on a stick also costs a
 * saw kerf. Parts longer than the stock come back as `oversize`.
 */
export function packSticks(lengths: number[], stockLength: number, kerf = KERF): { sticks: Stick[]; oversize: number[] } {
  const sticks: Stick[] = [];
  const oversize: number[] = [];
  for (const len of [...lengths].sort((a, b) => b - a)) {
    if (len > stockLength + 1e-6) { oversize.push(len); continue; }
    const fit = sticks.find((s) => s.left + 1e-6 >= len + kerf);
    if (fit) { fit.cuts.push(len); fit.left -= len + kerf; continue; }
    sticks.push({ length: stockLength, cuts: [len], left: stockLength - len });
  }
  for (const s of sticks) s.left = Math.max(0, s.left);
  return { sticks, oversize };
}

export interface StickPlan {
  /** Chosen stock length (inches); 0 when every part is oversize. */
  stockLength: number;
  sticks: Stick[];
  /** Stock bought minus parts cut (inches), kerf and offcuts included. */
  waste: number;
  /** Parts longer than the longest stock (12 ft): splice or buy special-order. */
  oversize: number[];
}

/**
 * Sticks to buy for one profile (e.g. all the pine 2×4 parts). Packs the parts
 * onto each stock length that can hold the longest one and keeps the plan that
 * wastes least, which is the one that buys the least total length. Ties go to
 * fewer sticks, then the shorter stock. One stock length per profile.
 */
export function planSticks(lengths: number[], options: readonly number[] = STICK_LENGTHS, kerf = KERF): StickPlan {
  const longest = Math.max(...options);
  const oversize = lengths.filter((l) => l > longest + 1e-6).sort((a, b) => b - a);
  const fits = lengths.filter((l) => l <= longest + 1e-6);
  if (!fits.length) return { stockLength: 0, sticks: [], waste: 0, oversize };
  const used = fits.reduce((n, l) => n + l, 0);
  let best: StickPlan | null = null;
  for (const L of [...options].sort((a, b) => a - b)) {
    const { sticks, oversize: over } = packSticks(fits, L, kerf);
    if (over.length) continue;
    const plan = { stockLength: L, sticks, waste: sticks.length * L - used, oversize };
    if (!best || plan.waste < best.waste - 1e-6 || (Math.abs(plan.waste - best.waste) <= 1e-6 && plan.sticks.length < best.sticks.length)) best = plan;
  }
  return best!;
}

/** '8 ft' / '10 ft' for a stock length in inches. */
export const stickFeet = (inches: number) => `${Math.round((inches / 12) * 100) / 100} ft`;
