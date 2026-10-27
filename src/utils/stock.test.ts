import { describe, expect, it } from 'vitest';
import { boardFeet, dimensionalNominal, formatBoardFeet, lumberBoardFeet, lumberStock, nestSheets, roughQuarters, sheetHasGrain, stockKind } from './stock';

describe('stock kinds', () => {
  it('sheet goods, lumber, metal; paint-grade by thickness', () => {
    expect(stockKind({ species: 'plywood' }, 0.75)).toBe('sheet');
    expect(stockKind({ species: 'mdf' }, 0.75)).toBe('sheet');
    expect(stockKind({ species: 'oak' }, 0.75)).toBe('lumber');
    expect(stockKind({ species: 'metal_accent' }, 0.25)).toBe('other');
    expect(stockKind({ species: 'custom_paint' }, 0.75)).toBe('sheet');
    expect(stockKind({ species: 'custom_paint' }, 1.5)).toBe('lumber');
    expect(sheetHasGrain({ species: 'plywood' })).toBe(true);
    expect(sheetHasGrain({ species: 'mdf' })).toBe(false);
  });
});

describe('board feet', () => {
  it('uses rough thickness in quarters', () => {
    expect(roughQuarters(0.75)).toBe(4);
    expect(roughQuarters(0.5)).toBe(4);
    expect(roughQuarters(1)).toBe(5);
    expect(roughQuarters(1.5)).toBe(8);
    expect(roughQuarters(1.75)).toBe(8);
    expect(boardFeet(96, 6, 0.75)).toBe(4); // an 8' 1×6 from 4/4
    expect(boardFeet(29.25, 1.5, 1.5)).toBeCloseTo(0.609, 3);
    expect(formatBoardFeet(2.4375)).toBe('2.4');
    expect(formatBoardFeet(4)).toBe('4');
  });
});

describe('sheet nesting (rip-first, 1/8" kerf)', () => {
  it('fits six 30 × 23 7/8 parts on one sheet, a seventh needs a second', () => {
    const p = (quantity: number) => [{ length: 30, width: 23.875, quantity }];
    expect(nestSheets(p(6), true).sheets).toBe(1);
    expect(nestSheets(p(7), true).sheets).toBe(2);
    expect(nestSheets(p(6), true).yield).toBeCloseTo((6 * 30 * 23.875) / (96 * 48), 5);
  });

  it('kerf counts: two 48" parts don\'t share a 96" strip', () => {
    expect(nestSheets([{ length: 48, width: 48, quantity: 2 }], true).sheets).toBe(2);
    expect(nestSheets([{ length: 47.9, width: 48, quantity: 2 }], true).sheets).toBe(1);
  });

  it('flags parts bigger than a sheet; MDF may turn, plywood keeps its grain', () => {
    expect(nestSheets([{ length: 100, width: 10, quantity: 2 }], true)).toMatchObject({ sheets: 0, oversize: 2 });
    // 40 long × 60 wide: plywood can't turn it (grain would run across); MDF can.
    expect(nestSheets([{ length: 40, width: 60, quantity: 1 }], true)).toMatchObject({ sheets: 0, oversize: 1 });
    expect(nestSheets([{ length: 40, width: 60, quantity: 1 }], false)).toMatchObject({ sheets: 1, oversize: 0 });
  });

  it('mixes widths: narrow parts fill a wide strip\'s leftovers before opening a new sheet', () => {
    // Two 23 7/8" rips fill the width; each leaves 35 7/8" of strip, enough for a 30" rail.
    expect(nestSheets([{ length: 60, width: 23.875, quantity: 2 }, { length: 30, width: 6, quantity: 2 }], true).sheets).toBe(1);
    // A third rail has nowhere to go (and two 24" rips plus a kerf don't fit 48").
    expect(nestSheets([{ length: 60, width: 23.875, quantity: 2 }, { length: 30, width: 6, quantity: 3 }], true).sheets).toBe(2);
    expect(nestSheets([{ length: 60, width: 24, quantity: 2 }], true).sheets).toBe(2);
  });
});

describe('dimensional lumber', () => {
  const pine = { species: 'pine' as const };
  it('pine at a surfaced cross-section is bought by nominal size', () => {
    expect(dimensionalNominal(pine, 1.5, 3.5)).toEqual({ thickness: 2, width: 4 });
    expect(dimensionalNominal(pine, 0.75, 1.5)).toEqual({ thickness: 1, width: 2 });
    expect(dimensionalNominal(pine, 1.5, 1.5)).toEqual({ thickness: 2, width: 2 });
    expect(dimensionalNominal(pine, 5.5, 1.5)).toEqual({ thickness: 2, width: 6 }); // either order
    expect(dimensionalNominal(pine, 1.5, 3)).toBeNull(); // ripped to an odd width
    expect(dimensionalNominal(pine, 1.25, 3.5)).toBeNull();
    expect(dimensionalNominal({ species: 'oak' }, 1.5, 3.5)).toBeNull(); // hardwood: rough thickness
  });
  it('board feet of an 8\' stick: 1×2 1 1/3, 2×2 2 2/3, 2×4 5 1/3, 2×6 8', () => {
    expect(lumberBoardFeet(pine, 96, 1.5, 0.75)).toBeCloseTo(4 / 3, 6);
    expect(lumberBoardFeet(pine, 96, 1.5, 1.5)).toBeCloseTo(8 / 3, 6);
    expect(lumberBoardFeet(pine, 96, 3.5, 1.5)).toBeCloseTo(16 / 3, 6);
    expect(lumberBoardFeet(pine, 96, 5.5, 1.5)).toBeCloseTo(8, 6);
    expect(lumberBoardFeet({ species: 'oak' }, 96, 6, 0.75)).toBe(boardFeet(96, 6, 0.75));
  });
  it('names the stock to buy', () => {
    expect(lumberStock(pine, 3.5, 1.5).label).toBe('2×4');
    expect(lumberStock({ species: 'oak' }, 3.5, 1.5).label).toBe('8/4');
    expect(lumberStock(pine, 1.5, 0.75).order).toBeLessThan(lumberStock(pine, 3.5, 1.5).order);
  });
});
