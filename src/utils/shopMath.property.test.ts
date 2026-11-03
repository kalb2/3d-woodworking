import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { END_TRIM, KERF, SHEET, nestSheets, packSticks, planSticks, type SheetNest } from './stock';
import { feetInches, formatLen, inchFraction, metricNumber } from './lengthFormat';
import { parseFraction } from '../components/ui/NumberField';
import { SLIDE_REAR_CLEARANCE, drawerPlan, shakerParts, type DrawerPlanInput } from '../fittings/fittingMath';
import { buildDrawers } from '../fittings/fittings';

const inch = (min: number, max: number) => fc.double({ min, max, noNaN: true });

function panelsStayOnTheSheet(nest: SheetNest, grain: boolean) {
  const placed = nest.layouts.flatMap((l) => l.panels);
  for (const l of nest.layouts) {
    let area = 0;
    for (const p of l.panels) {
      area += p.w * p.h;
      expect(p.x).toBeGreaterThanOrEqual(-1e-6);
      expect(p.y).toBeGreaterThanOrEqual(-1e-6);
      expect(p.x + p.w).toBeLessThanOrEqual(SHEET.length + 1e-6);
      expect(p.y + p.h).toBeLessThanOrEqual(SHEET.width + 1e-6);
      expect([p.w, p.h]).toEqual(p.rotated ? [p.width, p.length] : [p.length, p.width]);
      if (grain) expect(p.rotated).toBe(false);
    }
    expect(l.used).toBeCloseTo(area / (SHEET.length * SHEET.width), 6);
    for (let i = 0; i < l.panels.length; i++) for (let j = i + 1; j < l.panels.length; j++) {
      const a = l.panels[i], b = l.panels[j];
      const apart = a.x + a.w + KERF <= b.x + 1e-6 || b.x + b.w + KERF <= a.x + 1e-6
        || a.y + a.h + KERF <= b.y + 1e-6 || b.y + b.h + KERF <= a.y + 1e-6;
      expect(apart).toBe(true);
    }
    for (const o of l.offcuts) {
      expect(o.w).toBeGreaterThanOrEqual(3 - 1e-6);
      expect(o.h).toBeGreaterThanOrEqual(3 - 1e-6);
      expect(o.x + o.w).toBeLessThanOrEqual(SHEET.length + 1e-6);
      expect(o.y + o.h).toBeLessThanOrEqual(SHEET.width + 1e-6);
      for (const p of l.panels) {
        const overlap = o.x < p.x + p.w - 1e-6 && p.x < o.x + o.w - 1e-6 && o.y < p.y + p.h - 1e-6 && p.y < o.y + o.h - 1e-6;
        expect(overlap).toBe(false);
      }
    }
  }
  return placed;
}

describe('stick packing properties', () => {
  it('cuts, kerfs, trim and leftover add up to the stick', () => {
    fc.assert(fc.property(
      fc.array(inch(0.5, 140), { maxLength: 24 }),
      fc.constantFrom(96, 120, 144),
      (lengths, stock) => {
        const { sticks, oversize } = packSticks(lengths, stock);
        for (const s of sticks) {
          const kerfs = KERF * Math.max(0, s.cuts.length - 1);
          const used = s.cuts.reduce((n, c) => n + c, 0) + kerfs + END_TRIM + s.left;
          expect(used).toBeCloseTo(stock, 5);
          expect(s.left).toBeGreaterThanOrEqual(-1e-6);
          for (const c of s.cuts) expect(c).toBeLessThanOrEqual(stock - END_TRIM + 1e-6);
        }
        for (const o of oversize) expect(o).toBeGreaterThan(stock - END_TRIM + 1e-9);
        const kept = lengths.filter((l) => l > 0 && l <= stock - END_TRIM + 1e-6).sort((a, b) => a - b);
        expect(sticks.flatMap((s) => s.cuts).sort((a, b) => a - b)).toEqual(kept);
      },
    ), { numRuns: 80 });
  });

  it('kerf and trim accumulate: n copies fit on one stick only while they still fit', () => {
    fc.assert(fc.property(
      inch(1, 40),
      fc.integer({ min: 1, max: 14 }),
      fc.constantFrom(96, 120, 144),
      (len, n, stock) => {
        const need = n * len + Math.max(0, n - 1) * KERF + END_TRIM;
        const packed = packSticks(Array(n).fill(len), stock);
        if (len > stock - END_TRIM + 1e-6) {
          expect(packed.sticks).toEqual([]);
          expect(packed.oversize).toHaveLength(n);
        } else if (need <= stock + 1e-6) {
          expect(packed.oversize).toEqual([]);
          expect(packed.sticks).toHaveLength(1);
          expect(packed.sticks[0].cuts).toHaveLength(n);
        } else if (need > stock + 1e-4) {
          expect(packed.sticks.length).toBeGreaterThan(1);
        }
      },
    ), { numRuns: 60 });
  });

  it('buys the stock length that purchases the least board', () => {
    fc.assert(fc.property(
      fc.array(inch(4, 90), { minLength: 1, maxLength: 8 }),
      (lengths) => {
        const plan = planSticks(lengths);
        const fits = lengths.filter((l) => l <= 144 - END_TRIM + 1e-6);
        expect(plan.oversize.every((l) => l > 144 - END_TRIM + 1e-9)).toBe(true);
        if (!fits.length) {
          expect(plan.sticks).toEqual([]);
          return;
        }
        let best = Infinity;
        for (const L of [96, 120, 144]) {
          const trial = packSticks(fits, L);
          if (!trial.oversize.length) best = Math.min(best, trial.sticks.length * L);
        }
        expect(plan.sticks.length * plan.stockLength).toBeCloseTo(best, 5);
        expect(plan.waste).toBeCloseTo(plan.sticks.length * plan.stockLength - fits.reduce((n, l) => n + l, 0), 5);
      },
    ), { numRuns: 40 });
  });

  it('zero, negative and empty lists do not invent sticks', () => {
    expect(planSticks([])).toMatchObject({ stockLength: 0, sticks: [], waste: 0, oversize: [] });
    expect(planSticks([0, -8, Number.NaN])).toMatchObject({ stockLength: 0, sticks: [], oversize: [] });
    expect(packSticks([], 96)).toEqual({ sticks: [], oversize: [] });
  });
});

describe('sheet nesting properties', () => {
  const panel = fc.record({
    name: fc.constantFrom('Side', 'Shelf', 'Door'),
    length: inch(2, 90),
    width: inch(2, 44),
    quantity: fc.integer({ min: 1, max: 3 }),
  });

  it('keeps every panel on the sheet, a kerf apart, grain-locked when asked', () => {
    fc.assert(fc.property(
      fc.array(panel, { minLength: 1, maxLength: 6 }),
      fc.boolean(),
      (parts, grain) => {
        const nest = nestSheets(parts, grain);
        const placed = panelsStayOnTheSheet(nest, grain);
        const wanted = parts.reduce((n, p) => n + p.quantity, 0);
        expect(placed).toHaveLength(wanted);
        expect(nest.oversize).toBe(0);
        expect(nest.sheets).toBe(nest.layouts.length);
      },
    ), { numRuns: 25 });
  });

  it('a part bigger than a sheet is listed, not drawn, including when grain forbids a turn', () => {
    fc.assert(fc.property(inch(97, 140), inch(4, 40), fc.integer({ min: 1, max: 4 }), (length, width, quantity) => {
      const nest = nestSheets([{ name: 'Huge', length, width, quantity }], true);
      expect(nest.sheets).toBe(0);
      expect(nest.oversize).toBe(quantity);
      expect(nest.layouts).toEqual([]);
    }), { numRuns: 20 });
    const locked = nestSheets([{ length: 40, width: 60, quantity: 2 }], true);
    expect(locked).toMatchObject({ sheets: 0, oversize: 2 });
    const turned = nestSheets([{ length: 40, width: 60, quantity: 2 }], false);
    expect(turned.oversize).toBe(0);
    expect(turned.layouts[0].panels.every((p) => p.rotated)).toBe(true);
  });

  it('zero and negative panels add nothing', () => {
    fc.assert(fc.property(
      fc.array(fc.record({
        length: fc.double({ min: -20, max: 20, noNaN: true }),
        width: fc.double({ min: -20, max: 20, noNaN: true }),
        quantity: fc.integer({ min: -2, max: 2 }),
      }), { maxLength: 8 }),
      (parts) => {
        const nest = nestSheets(parts, false);
        const good = parts.filter((p) => p.length > 0 && p.width > 0 && p.quantity > 0);
        const expected = good.reduce((n, p) => n + p.quantity, 0);
        expect(nest.layouts.flatMap((l) => l.panels).length + nest.oversize).toBe(expected);
        panelsStayOnTheSheet(nest, false);
      },
    ), { numRuns: 20 });
  });

  it('a few hundred panels still nest', () => {
    const parts = Array.from({ length: 160 }, (_, i) => ({
      name: `P${i}`,
      length: 6 + (i % 40),
      width: 3 + (i % 15),
      quantity: 1,
    }));
    const started = performance.now();
    const nest = nestSheets(parts, true);
    expect(performance.now() - started).toBeLessThan(2000);
    expect(nest.layouts.flatMap((l) => l.panels)).toHaveLength(parts.length);
    panelsStayOnTheSheet(nest, true);
  });
});

describe('fraction and unit properties', () => {
  it('round-trips every sixteenth, and other values snap to the nearest 1/16', () => {
    fc.assert(fc.property(fc.integer({ min: -3200, max: 8000 }), (sixteenths) => {
      const inches = sixteenths / 16;
      expect(parseFraction(inchFraction(inches))).toBeCloseTo(inches, 8);
      expect(parseFraction(formatLen(inches, 'in'))).toBeCloseTo(inches, 8);
      if (Math.abs(inches) >= 12) {
        const shown = feetInches(inches);
        expect(shown.startsWith(inches < 0 ? '-' : '') || inches === 0).toBe(true);
      }
    }), { numRuns: 80 });
    fc.assert(fc.property(inch(-80, 200), (x) => {
      const nearest = Math.round(x * 16) / 16;
      expect(parseFraction(inchFraction(x))).toBeCloseTo(nearest, 8);
    }), { numRuns: 40 });
  });

  it('millimetres are whole millimetres of the same length', () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 4000 }), (sixteenths) => {
      const inches = sixteenths / 16;
      const mm = Math.round(inches * 25.4);
      expect(metricNumber(inches, 'mm')).toBe(String(Object.is(mm, -0) ? 0 : mm));
      expect(Math.abs(mm / 25.4 - inches)).toBeLessThanOrEqual(0.5 / 25.4 + 1e-9);
      expect(formatLen(inches, 'mm')).toBe(`${metricNumber(inches, 'mm')} mm`);
      expect(formatLen(inches, 'in')).toBe(`${inchFraction(inches)}"`);
    }), { numRuns: 40 });
  });
});

const drawerBase: DrawerPlanInput = {
  width: 18, height: 12, depth: 20, count: 1, heights: 'even', mount: 'overlay', slide: 'side',
  side: 0.5, frontT: 0.75, gap: 0.125, reveal: 0.0625, sideT: 0.75,
};

describe('drawer, door and joinery properties', () => {
  it('the box stops short of the cabinet back by the slide clearance', () => {
    fc.assert(fc.property(
      inch(8, 32),
      fc.constantFrom('side' as const, 'under' as const),
      fc.constantFrom('overlay' as const, 'inset' as const),
      fc.double({ min: 0.5, max: 0.75, noNaN: true }),
      (depth, slide, mount, side) => {
        const plan = drawerPlan({ ...drawerBase, depth, slide, mount, side, count: 2, heights: 'even' });
        const available = depth + plan.boxFrontZ - SLIDE_REAR_CLEARANCE[slide];
        for (const box of plan.boxes) {
          expect(box.length).toBeCloseTo(plan.slide ?? Math.round(Math.max(4, available) * 16) / 16, 6);
          expect(box.length).toBeLessThanOrEqual(Math.max(4, available) + 1 / 32 + 1e-6);
          // No slide: the box is the cleared depth, rounded to 1/16" (at most 1/32" long).
          if (available >= 4) expect(box.length).toBeLessThanOrEqual(available + 1 / 32 + 1e-6);
        }
        if (plan.slide != null) expect(plan.slide).toBeLessThanOrEqual(available + 1e-6);
        const heights = plan.fronts.map((f) => f.height);
        expect(heights.reduce((n, h) => n + h, 0)).toBeGreaterThan(0);
        // Side-mount boxes are the opening minus 1/2" each side.
        if (slide === 'side') for (const box of plan.boxes) expect(box.width).toBeCloseTo(drawerBase.width - 1, 4);
      },
    ), { numRuns: 30 });
  });

  it('dado and rabbet corners lengthen the box into the sides', () => {
    fc.assert(fc.property(
      inch(12, 30),
      fc.constantFrom('rabbet' as const, 'dado' as const),
      fc.constantFrom('0.5', '0.75'),
      (width, joinery, box) => {
        const side = Number(box);
        const built = buildDrawers({ width, depth: 20, height: 8, joinery, box, slide: 'side' });
        const groove = Math.max(0.0625, Math.round((side / 2) * 16) / 16);
        const front = built.parts.find((p) => p.name === 'Drawer 1 front')!;
        expect(front.dimensions.length).toBeCloseTo(width - 1 - 2 * side + 2 * groove, 4);
        const corners = built.joints.filter((j) => j.type === joinery);
        expect(corners.length).toBeGreaterThan(0);
        for (const j of corners) {
          expect(j.depth).toBeGreaterThan(0);
          expect(j.extended).toBeCloseTo(j.depth, 6);
        }
      },
    ), { numRuns: 20 });
  });

  it('a shaker panel is the opening inside the stiles plus the grooves', () => {
    fc.assert(fc.property(inch(10, 36), inch(12, 80), inch(1.5, 3), (width, height, stile) => {
      const p = shakerParts(width, height, stile);
      expect(p.stile.length).toBeCloseTo(height, 3);
      expect(p.rail.length).toBeCloseTo(width - 2 * p.stile.width, 3);
      expect(p.panel.width).toBeCloseTo(width - 2 * p.stile.width + 2 * p.groove, 3);
      expect(p.panel.height).toBeCloseTo(height - 2 * p.stile.width + 2 * p.groove, 3);
      expect(p.panel.thickness).toBe(0.25);
      expect(p.stile.width).toBeGreaterThan(0);
    }), { numRuns: 30 });
  });
});
