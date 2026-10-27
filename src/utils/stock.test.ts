import { describe, expect, it } from 'vitest';
import { boardFeet, dimensionalNominal, formatBoardFeet, lumberBoardFeet, lumberStock, nestSheets, packSticks, planSticks, roughQuarters, sheetHasGrain, stickFeet, stockKind } from './stock';

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

describe('stick packing (first-fit decreasing, 1/8" kerf)', () => {
  it('fits cuts on one stick with a kerf between them', () => {
    const { sticks, oversize } = packSticks([30, 30, 30], 96);
    expect(oversize).toEqual([]);
    expect(sticks).toHaveLength(1);
    expect(sticks[0].cuts).toEqual([30, 30, 30]);
    expect(sticks[0].left).toBeCloseTo(96 - 90 - 2 / 8, 6);
  });

  it('the kerf can force another stick: two 48" parts need two 8 ft sticks', () => {
    expect(packSticks([48, 48], 96).sticks).toHaveLength(2);
    expect(packSticks([48, 47.875], 96).sticks).toHaveLength(1);
  });

  it('a part exactly the stock length fits with no kerf', () => {
    const { sticks } = packSticks([96, 96], 96);
    expect(sticks.map((s) => s.left)).toEqual([0, 0]);
  });

  it('places longest first, each into the first stick with room', () => {
    const { sticks } = packSticks([20, 70, 25], 96);
    expect(sticks.map((s) => s.cuts)).toEqual([[70, 25], [20]]);
  });

  it('picks the stock length that wastes least', () => {
    const two60 = planSticks([60, 60]);
    expect([two60.stockLength, two60.sticks.length]).toEqual([144, 1]);
    expect(two60.waste).toBe(24);
    expect(planSticks([100]).stockLength).toBe(120); // 8 ft can't hold it
    expect(planSticks([40]).stockLength).toBe(96); // ties go to the shorter stock
    const five48 = planSticks([48, 48, 48, 48, 48]);
    expect([five48.stockLength, five48.sticks.length]).toEqual([120, 3]);
  });

  it('equal waste goes to fewer sticks', () => {
    const plan = planSticks([45, 45], [50, 100]);
    expect([plan.stockLength, plan.sticks.length]).toEqual([100, 1]);
  });

  it('flags parts longer than 12 ft and packs the rest', () => {
    const plan = planSticks([150, 30, 200]);
    expect(plan.oversize).toEqual([200, 150]);
    expect([plan.stockLength, plan.sticks.length]).toEqual([96, 1]);
    const none = planSticks([200]);
    expect([none.stockLength, none.sticks.length, none.oversize]).toEqual([0, 0, [200]]);
  });

  it('names stock lengths in feet', () => {
    expect([96, 120, 144].map(stickFeet)).toEqual(['8 ft', '10 ft', '12 ft']);
  });
});
