import type { CutListSection, HardwareItem, StickBuy } from '../utils/exportUtils';
import type { WoodSpecies } from '../types/furniture';
import { LUMBER_WASTE, dimensionalNominal, lumberBoardFeet, stickFeet } from '../utils/stock';
import { formatSmallLen } from '../utils/lengthFormat';

/**
 * A price list: what one stick, sheet, board foot or piece of hardware costs,
 * plus the extras on the total. Keys:
 * - `stick:2×4:96` one 8 ft 2×4
 * - `sheet:plywood:0.75` one 4×8 sheet of 3/4" plywood
 * - `bf:oak` one board foot of oak (lumber that isn't dimensional pine)
 * - `hw:pull` one pull (see HARDWARE)
 */
export interface PriceSettings {
  items?: Record<string, number>;
  /** Sales tax, % of the total. */
  taxPct?: number;
  /** Waste / contingency, % added before tax. */
  wastePct?: number;
  /** One flat line, e.g. finish and glue. */
  flat?: number;
}

export interface ResolvedPrices {
  items: Record<string, number>;
  taxPct: number;
  wastePct: number;
  flat: number;
  /** Keys still at the app's example price (nobody has set them). */
  example: Set<string>;
}

export const FLAT_LABEL = 'Finish & glue';
export const EXAMPLE_NOTE = 'Example prices, edit to match your store.';

export const STICK_PROFILES = ['1×2', '2×2', '2×4', '2×6'] as const;
export const STICK_STOCK = [96, 120, 144] as const;

/** Hardware priced per unit, matched on the hardware list's names. */
export const HARDWARE: Array<{ key: string; label: string; unit: string; match: RegExp }> = [
  { key: 'hw:slide-under', label: 'Drawer slides, undermount', unit: 'pair', match: /^Drawer slides\b.*undermount/i },
  { key: 'hw:slide-side', label: 'Drawer slides, side-mount', unit: 'pair', match: /^Drawer slides\b/i },
  { key: 'hw:hinge-concealed', label: 'Hinges, 35 mm concealed', unit: 'each', match: /^Hinges\b/i },
  { key: 'hw:hinge-butt', label: 'Butt hinges', unit: 'each', match: /^Butt hinges\b/i },
  { key: 'hw:pocket-screw', label: 'Pocket screws', unit: 'each', match: /^Pocket screws\b/i },
  { key: 'hw:dowel', label: 'Dowels', unit: 'each', match: /^Dowels\b/i },
  { key: 'hw:shelf-pin', label: 'Shelf pins', unit: 'each', match: /^Shelf pins\b/i },
  { key: 'hw:pull', label: 'Pulls / knobs', unit: 'each', match: /^Pulls\b/i },
];

export const hardwareKey = (name: string) => HARDWARE.find((h) => h.match.test(name))?.key ?? null;

/** Sheet thickness as a key: to 1/32". */
const tKey = (t: number) => String(Math.round(t * 32) / 32);
export const sheetKey = (species: WoodSpecies | undefined, thickness: number) => `sheet:${species ?? 'plywood'}:${tKey(thickness)}`;
export const stickKey = (profile: string, length: number) => `stick:${profile}:${length}`;

const SPECIES_NAME: Partial<Record<WoodSpecies, string>> = {
  oak: 'Oak', walnut: 'Walnut', mahogany: 'Mahogany', pine: 'Pine', teak: 'Teak', cherry: 'Cherry', ebony: 'Ebony', birch: 'Birch',
  plywood: 'Plywood', mdf: 'MDF', custom_paint: 'Paint-grade',
};
export const speciesName = (s: string) => SPECIES_NAME[s as WoodSpecies] ?? s;

/**
 * Example prices only, so a new install shows a plausible total. They are not
 * any store's prices and are labeled that way wherever they show.
 */
export const DEFAULT_PRICES: Required<Omit<PriceSettings, 'items'>> & { items: Record<string, number> } = {
  items: {
    [stickKey('1×2', 96)]: 2.5, [stickKey('1×2', 120)]: 3.25, [stickKey('1×2', 144)]: 4,
    [stickKey('2×2', 96)]: 4, [stickKey('2×2', 120)]: 5.25, [stickKey('2×2', 144)]: 6.5,
    [stickKey('2×4', 96)]: 4.5, [stickKey('2×4', 120)]: 6.5, [stickKey('2×4', 144)]: 8,
    [stickKey('2×6', 96)]: 7.5, [stickKey('2×6', 120)]: 10, [stickKey('2×6', 144)]: 12.5,
    [sheetKey('plywood', 0.75)]: 65, [sheetKey('plywood', 0.5)]: 50, [sheetKey('plywood', 0.25)]: 32,
    [sheetKey('mdf', 0.75)]: 45, [sheetKey('mdf', 0.5)]: 38,
    [sheetKey('custom_paint', 0.75)]: 55,
    'bf:oak': 7, 'bf:walnut': 14, 'bf:cherry': 10, 'bf:mahogany': 12, 'bf:birch': 6, 'bf:pine': 4, 'bf:custom_paint': 5, 'bf:teak': 30, 'bf:ebony': 90,
    'hw:slide-side': 12, 'hw:slide-under': 35, 'hw:hinge-concealed': 4, 'hw:hinge-butt': 3,
    'hw:pocket-screw': 0.08, 'hw:dowel': 0.1, 'hw:shelf-pin': 0.15, 'hw:pull': 4,
  },
  taxPct: 0,
  wastePct: 0,
  flat: 0,
};

const money = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.round(n * 10000) / 10000 : undefined);

/** A price list from storage or a file: unknown fields and bad numbers dropped. */
export function sanitizePrices(raw: unknown): PriceSettings | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const out: PriceSettings = {};
  if (r.items && typeof r.items === 'object') {
    const items: Record<string, number> = {};
    for (const [k, v] of Object.entries(r.items as Record<string, unknown>)) { const m = money(v); if (m !== undefined && k.length < 80) items[k] = m; }
    if (Object.keys(items).length) out.items = items;
  }
  for (const f of ['taxPct', 'wastePct', 'flat'] as const) { const m = money(r[f]); if (m !== undefined) out[f] = Math.min(m, f === 'flat' ? 1e7 : 100); }
  return Object.keys(out).length ? out : undefined;
}

/** Defaults ← this device's prices ← this project's. */
export function resolvePrices(device?: PriceSettings, project?: PriceSettings): ResolvedPrices {
  const set = { ...(device?.items ?? {}), ...(project?.items ?? {}) };
  const items = { ...DEFAULT_PRICES.items, ...set };
  return {
    items,
    taxPct: project?.taxPct ?? device?.taxPct ?? DEFAULT_PRICES.taxPct,
    wastePct: project?.wastePct ?? device?.wastePct ?? DEFAULT_PRICES.wastePct,
    flat: project?.flat ?? device?.flat ?? DEFAULT_PRICES.flat,
    example: new Set(Object.keys(DEFAULT_PRICES.items).filter((k) => !(k in set))),
  };
}

export type CostGroup = 'Lumber' | 'Sheets' | 'Hardware' | 'Other';

export interface CostLine {
  group: CostGroup;
  /** Price list key; null when nothing in the list can price it. */
  key: string | null;
  label: string;
  quantity: number;
  /** 'stick', 'sheet', 'bd ft', 'pair', 'each'. */
  unit: string;
  unitPrice: number | null;
  total: number | null;
  /** Priced at the app's example price. */
  example: boolean;
}

export interface ProjectCost {
  lines: CostLine[];
  /** Priced lines plus the flat line. */
  subtotal: number;
  flat: number;
  waste: number;
  wastePct: number;
  tax: number;
  taxPct: number;
  total: number;
  /** Lines with no price (left out of the total). */
  unpriced: number;
  /** Some line uses an example price. */
  anyExample: boolean;
}

export const cents = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** '$1,234.50' */
export function formatMoney(n: number): string {
  return `$${cents(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function line(group: CostGroup, key: string | null, label: string, quantity: number, unit: string, prices: ResolvedPrices): CostLine {
  const unitPrice = key != null && key in prices.items ? prices.items[key] : null;
  return { group, key, label, quantity, unit, unitPrice, total: unitPrice == null ? null : cents(unitPrice * quantity), example: key != null && unitPrice != null && prices.example.has(key) };
}

function stickLines(b: StickBuy, prices: ResolvedPrices): CostLine[] {
  const out: CostLine[] = [];
  if (b.sticks.length) out.push(line('Lumber', stickKey(b.profile, b.stockLength), `${b.profile} at ${stickFeet(b.stockLength)} · ${b.material}`, b.sticks.length, 'stick', prices));
  if (b.oversize.length) out.push({ ...line('Lumber', null, `${b.profile} longer than 12 ft · ${b.material}`, b.oversize.length, 'part', prices) });
  return out;
}

/**
 * What the buy list costs: sticks per profile and length, sheets per material
 * and thickness, other lumber by the board foot (with the usual 15% waste),
 * hardware per unit. Then the flat line, waste/contingency % and tax %.
 * Anything the price list can't price is listed with no price and left out.
 */
export function projectCost(sections: CutListSection[], hardware: HardwareItem[], prices: ResolvedPrices): ProjectCost {
  const lines: CostLine[] = [];
  for (const s of sections) {
    if (s.kind === 'lumber') {
      for (const b of s.sticks ?? []) lines.push(...stickLines(b, prices));
      const other = s.items.filter((it) => !dimensionalNominal({ species: it.species }, it.thicknessIn, it.widthIn));
      if (other.length) {
        const bf = other.reduce((n, it) => n + it.quantity * lumberBoardFeet({ species: it.species }, it.lengthIn, it.widthIn, it.thicknessIn), 0) * (1 + LUMBER_WASTE);
        const species = other[0].species ?? 'custom_paint';
        lines.push(line('Lumber', `bf:${species}`, `${s.title} (with ${Math.round(LUMBER_WASTE * 100)}% waste)`, Math.ceil(bf * 10) / 10, 'bd ft', prices));
      }
    } else if (s.kind === 'sheet' && s.sheets) {
      const t = s.items[0]?.thicknessIn ?? 0.75;
      if (s.sheets.sheets) lines.push(line('Sheets', sheetKey(s.items[0]?.species, t), `${s.title} (4×8)`, s.sheets.sheets, 'sheet', prices));
      if (s.sheets.oversize) lines.push(line('Sheets', null, `${s.title} panels bigger than a sheet`, s.sheets.oversize, 'part', prices));
    } else if (s.kind === 'other') {
      lines.push(line('Other', null, s.title, s.pieces, 'part', prices));
    }
  }
  for (const h of hardware) lines.push(line('Hardware', hardwareKey(h.name), h.name, h.quantity, HARDWARE.find((x) => x.key === hardwareKey(h.name))?.unit ?? 'each', prices));

  const order: CostGroup[] = ['Lumber', 'Sheets', 'Hardware', 'Other'];
  lines.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
  const flat = cents(prices.flat);
  const subtotal = cents(lines.reduce((n, l) => n + (l.total ?? 0), 0) + flat);
  const waste = cents(subtotal * prices.wastePct / 100);
  const tax = cents((subtotal + waste) * prices.taxPct / 100);
  return {
    lines, subtotal, flat, waste, wastePct: prices.wastePct, tax, taxPct: prices.taxPct,
    total: cents(subtotal + waste + tax),
    unpriced: lines.filter((l) => l.unitPrice == null).length,
    anyExample: lines.some((l) => l.example),
  };
}

/** '2×4 · 8 ft', '3/4" Plywood', 'Oak', 'Pulls / knobs' for a price key. */
export function priceLabel(key: string): string {
  const [kind, a, b] = key.split(':');
  if (kind === 'stick') return `${a} · ${stickFeet(Number(b))}`;
  if (kind === 'sheet') return `${speciesName(a)} · ${formatSmallLen(Number(b), 'in')}`;
  if (kind === 'bf') return speciesName(a);
  return HARDWARE.find((h) => h.key === key)?.label ?? key;
}
