import { describe, expect, it } from 'vitest';
import { DEFAULT_PRICES, formatMoney, hardwareKey, priceLabel, projectCost, resolvePrices, sanitizePrices, sheetKey } from './cost';
import { editPrices } from './usePriceStore';
import { costOf, costTotals, cutListCSV, cutListSections, generateCutList, importProjectData, projectHardware } from '../utils/exportUtils';
import { templateProject } from '../plans/testProjects';
import { buildPlansPdf } from '../plans/pdf';
import { PRESET_WOOD_MATERIALS } from '../utils/woodTextureGenerator';
import type { FurnitureObject, FurnitureProject } from '../types/furniture';

const board = (name: string, l: number, w: number, t: number, material = PRESET_WOOD_MATERIALS.pine, extra: Partial<FurnitureObject> = {}): FurnitureObject => ({
  id: `${name}_${Math.random()}`, name, shape: 'board', position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
  dimensions: { length: l, width: w, height: t }, material: { ...material }, ...extra,
} as FurnitureObject);
const project = (objects: FurnitureObject[], more: Partial<FurnitureProject> = {}): FurnitureProject =>
  ({ id: 'p', name: 'Bench', createdAt: 0, updatedAt: 0, unit: 'in', objects, joints: [], snapSettings: { enabled: true }, showFloor: true, floorOpacity: 0.4, ...more }) as unknown as FurnitureProject;
const cost = (p: FurnitureProject, prices = resolvePrices()) => projectCost(cutListSections(generateCutList(p), 'in'), projectHardware(p), prices);

describe('price list', () => {
  it('layers examples ← device ← project, and tracks which are still examples', () => {
    const r = resolvePrices({ items: { 'stick:2×4:96': 5 }, taxPct: 8 }, { items: { 'hw:pull': 6 }, taxPct: 7.25, wastePct: 10 });
    expect(r.items['stick:2×4:96']).toBe(5);
    expect(r.items['hw:pull']).toBe(6);
    expect(r.items['stick:2×6:96']).toBe(DEFAULT_PRICES.items['stick:2×6:96']);
    expect(r.taxPct).toBe(7.25);
    expect(r.wastePct).toBe(10);
    expect(r.flat).toBe(0);
    expect(r.example.has('stick:2×4:96')).toBe(false);
    expect(r.example.has('stick:2×6:96')).toBe(true);
  });
  it('sanitizes stored lists and edits / clears single prices', () => {
    expect(sanitizePrices({ items: { a: 2, b: -1, c: 'x', d: NaN }, taxPct: 250, flat: 12.5, junk: 1 })).toEqual({ items: { a: 2 }, taxPct: 100, flat: 12.5 });
    expect(sanitizePrices('nope')).toBeUndefined();
    let p = editPrices(undefined, 'sheet:plywood:0.75', 58);
    p = editPrices(p, 'taxPct', 6);
    expect(p).toEqual({ items: { 'sheet:plywood:0.75': 58 }, taxPct: 6 });
    p = editPrices(p, 'sheet:plywood:0.75', null);
    expect(p).toEqual({ taxPct: 6 });
    expect(editPrices(p, 'taxPct', null)).toBeUndefined();
  });
  it('matches hardware names and labels keys', () => {
    expect(hardwareKey('Drawer slides 22" side-mount (pairs)')).toBe('hw:slide-side');
    expect(hardwareKey('Drawer slides 18" undermount (pairs)')).toBe('hw:slide-under');
    expect(hardwareKey('Drawer slides 20" (pairs)')).toBe('hw:slide-side');
    expect(hardwareKey('Hinges 35 mm concealed (full overlay)')).toBe('hw:hinge-concealed');
    expect(hardwareKey('Hinges (concealed)')).toBe('hw:hinge-concealed');
    expect(hardwareKey('Pocket screws 1 1/4"')).toBe('hw:pocket-screw');
    expect(hardwareKey('Dowels 3/8" x 1 1/2"')).toBe('hw:dowel');
    expect(hardwareKey('Shelf pins 1/4"')).toBe('hw:shelf-pin');
    expect(hardwareKey('Pulls / knobs')).toBe('hw:pull');
    expect(hardwareKey('Lag bolts')).toBeNull();
    expect(priceLabel('stick:2×4:120')).toBe('2×4 · 10 ft');
    expect(priceLabel(sheetKey('plywood', 0.75))).toBe('Plywood · 3/4"');
    expect(priceLabel('bf:oak')).toBe('Oak');
    expect(formatMoney(1234.5)).toBe('$1,234.50');
  });
});

describe('project cost', () => {
  it('prices sticks by profile and length, sheets by material and thickness, lumber by the board foot', () => {
    const p = project([
      board('Leg', 30, 3.5, 1.5), board('Leg', 30, 3.5, 1.5), board('Leg', 30, 3.5, 1.5), // 3 × 30" 2×4 → one 8 ft stick
      board('Rail', 110, 5.5, 1.5), // one 10 ft 2×6
      board('Top', 40, 20, 0.75, PRESET_WOOD_MATERIALS.plywood),
      board('Cleat', 24, 2, 1, PRESET_WOOD_MATERIALS.oak), // 5/4 oak: 24 × 2 × 1.25 / 144 = 0.4167 bd ft
    ]);
    const c = cost(p, resolvePrices({ items: { 'stick:2×4:96': 4, 'stick:2×6:120': 11, 'sheet:plywood:0.75': 60, 'bf:oak': 8 } }));
    const by = (re: RegExp) => c.lines.find((l) => re.test(l.label))!;
    expect(by(/^2×4 at 8 ft/)).toMatchObject({ key: 'stick:2×4:96', quantity: 1, unitPrice: 4, total: 4, example: false });
    expect(by(/^2×6 at 10 ft/)).toMatchObject({ quantity: 1, total: 11 });
    expect(by(/Plywood · 3\/4"/)).toMatchObject({ key: 'sheet:plywood:0.75', quantity: 1, unit: 'sheet', total: 60 });
    // 0.4167 bd ft × 1.15 waste = 0.479 → buy 0.5 bd ft.
    expect(by(/Oak/)).toMatchObject({ key: 'bf:oak', quantity: 0.5, unit: 'bd ft', total: 4 });
    expect(c.subtotal).toBe(79);
    expect(c.total).toBe(79);
    expect(c.anyExample).toBe(false);
    expect(c.unpriced).toBe(0);
  });

  it('adds the flat line, then waste %, then tax % on top, to the cent', () => {
    const p = project([board('Leg', 30, 3.5, 1.5)]);
    const c = cost(p, resolvePrices({ items: { 'stick:2×4:96': 4.99 }, flat: 15, wastePct: 10, taxPct: 8.25 }));
    expect(c.subtotal).toBe(19.99);
    expect(c.waste).toBe(2); // 1.999
    expect(c.tax).toBe(1.81); // 21.99 × 8.25% = 1.814
    expect(c.total).toBe(23.8);
    expect(costTotals(c)).toEqual([['Subtotal', 4.99], ['Finish & glue', 15], ['Waste / contingency 10%', 2], ['Tax 8.25%', 1.81], ['Total', 23.8]]);
    expect(costTotals(cost(p, resolvePrices({ items: { 'stick:2×4:96': 4.99 } })))).toEqual([['Total', 4.99]]);
  });

  it('leaves out what it cannot price, and flags example prices', () => {
    const p = project([board('Odd', 30, 3.5, 0.75), board('Bracket', 6, 2, 0.25, PRESET_WOOD_MATERIALS.metal_accent)]);
    const c = cost(p);
    expect(c.lines.find((l) => l.label.startsWith('1×4'))).toMatchObject({ key: 'stick:1×4:96', unitPrice: null, total: null });
    expect(c.lines.find((l) => l.group === 'Other')).toMatchObject({ unitPrice: null });
    expect(c.unpriced).toBe(2);
    expect(c.total).toBe(0);
    const ex = cost(project([board('Leg', 30, 3.5, 1.5)]));
    expect(ex.anyExample).toBe(true);
    expect(ex.total).toBe(DEFAULT_PRICES.items['stick:2×4:96']);
  });

  it('prices template hardware: a drawer stack and doors', () => {
    const drawers = templateProject('drawers', 'Drawers', { count: 3 });
    const doors = templateProject('door', 'Doors', { doors: '2' });
    const p = { ...drawers, objects: [...drawers.objects, ...doors.objects], joints: [...(drawers.joints ?? []), ...(doors.joints ?? [])] };
    const c = costOf(p, resolvePrices());
    expect(c.lines.find((l) => l.key === 'hw:slide-side')).toMatchObject({ quantity: 3, unit: 'pair', total: 36 });
    expect(c.lines.find((l) => l.key === 'hw:hinge-concealed')).toMatchObject({ quantity: 4, total: 16 });
    expect(c.lines.find((l) => l.key === 'hw:pull')).toMatchObject({ quantity: 5, total: 20 });
    expect(c.lines.some((l) => l.group === 'Sheets' && l.total! > 0)).toBe(true);
  });
});

describe('cost in exports', () => {
  it('CSV has a cost table, totals and the example note', () => {
    const p = project([board('Leg', 30, 3.5, 1.5), board('Leg', 30, 3.5, 1.5)]);
    const csv = cutListCSV(p, resolvePrices({ taxPct: 10 }));
    expect(csv).toContain('\nCost,Quantity,Unit,Unit price,Line total\n"2×4 at 8 ft · Rustic Pine",1,"stick",4.50,4.50\n');
    expect(csv).toContain('"Subtotal",,,,4.50\n"Tax 10%",,,,0.45\n"Total",,,,4.95\n"Example prices, edit to match your store.",,,,\n');
    expect(cutListCSV(p, resolvePrices({ items: { 'stick:2×4:96': 5 } }))).not.toContain('Example prices');
  });
  it('the build plans PDF prints the estimated cost', () => {
    const { doc } = buildPlansPdf(templateProject('base-cabinet', 'Base cabinet'), { prices: resolvePrices({ flat: 20 }) });
    const text = (doc.internal as unknown as { pages: string[][] }).pages.flat().join('\n');
    expect(text).toContain('ESTIMATED COST');
    expect(text).toContain('(Finish & glue)');
    expect(text).toMatch(/\(Total\)/);
    expect(text).toContain('Example prices, edit to match your store.');
  });
  it('a project file keeps its own prices (sanitized)', () => {
    const p = importProjectData({ ...project([]), prices: { items: { 'hw:pull': 7, bad: -2 }, taxPct: 6 } })!;
    expect(p.prices).toEqual({ items: { 'hw:pull': 7 }, taxPct: 6 });
    expect(importProjectData(project([]))!.prices).toBeUndefined();
  });
});
