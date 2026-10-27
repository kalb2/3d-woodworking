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

/** What the stock is called when buying it: '2×4' for dimensional lumber, else rough thickness ('8/4'). */
export function lumberStock(material: { species?: WoodMaterial['species'] } | undefined, width: number, thickness: number): { label: string; order: number } {
  const n = dimensionalNominal(material, thickness, width);
  if (n) return { label: `${n.thickness}×${n.width}`, order: n.thickness * 4 * 100 + n.width };
  const q = roughQuarters(thickness);
  return { label: `${q}/4`, order: q * 100 };
}

export interface SheetPart { length: number; width: number; quantity: number }
export interface SheetNest {
  /** 4×8 sheets needed for the parts that fit. */
  sheets: number;
  /** Parts too big for one sheet (listed, not nested). */
  oversize: number;
  /** Share of the sheets' area the parts cover (0–1). */
  yield: number;
}

/**
 * Rip-first nesting on 4×8 sheets: parts sorted widest first, ripped into
 * full-length strips, crosscut along the strip, with a saw kerf between cuts.
 * With grain (plywood) a part's length stays on the sheet's long side;
 * without (MDF) a part may turn if that's the only way it fits.
 */
export function nestSheets(parts: SheetPart[], grain: boolean, sheet = SHEET, kerf = KERF): SheetNest {
  const pieces: { l: number; w: number }[] = [];
  let oversize = 0;
  for (const p of parts) {
    let l = Math.max(p.length, p.width), w = Math.min(p.length, p.width);
    if (grain) { l = p.length; w = p.width; }
    if (l > sheet.length + 1e-6 || w > sheet.width + 1e-6) {
      if (!grain && l <= sheet.width + 1e-6 && w <= sheet.length + 1e-6) [l, w] = [w, l];
      else { oversize += p.quantity; continue; }
    }
    for (let i = 0; i < p.quantity; i++) pieces.push({ l, w });
  }
  pieces.sort((a, b) => b.w - a.w || b.l - a.l);

  type Strip = { w: number; left: number };
  const sheets: { left: number; strips: Strip[] }[] = [];
  let area = 0;
  for (const pc of pieces) {
    area += pc.l * pc.w;
    let placed = false;
    for (const s of sheets) {
      const strip = s.strips.find((st) => st.w + 1e-6 >= pc.w && st.left + 1e-6 >= pc.l);
      if (strip) { strip.left -= pc.l + kerf; placed = true; break; }
    }
    if (placed) continue;
    let s = sheets.find((sh) => sh.left + 1e-6 >= pc.w);
    if (!s) { s = { left: sheet.width, strips: [] }; sheets.push(s); }
    s.left -= pc.w + kerf;
    s.strips.push({ w: pc.w, left: sheet.length - pc.l - kerf });
  }
  return { sheets: sheets.length, oversize, yield: sheets.length ? area / (sheets.length * sheet.length * sheet.width) : 0 };
}

/** '2.4' / '12' — board feet to one decimal. */
export function formatBoardFeet(bf: number): string {
  const r = Math.round(bf * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}
