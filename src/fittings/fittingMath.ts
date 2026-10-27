/**
 * Pure sizing math for drawers and doors that fill an opening (inches).
 * Opening frame: x across (centered), y up from the opening bottom, z out of
 * the opening (0 = its front plane, negative = inside the cabinet).
 */

const r16 = (n: number) => Math.round(n * 16) / 16;
const r4 = (n: number) => Math.round(n * 10000) / 10000;

export const MM = 1 / 25.4;
/** Standard slide lengths: 10" to 28" in 2" steps. */
export const SLIDE_LENGTHS = [10, 12, 14, 16, 18, 20, 22, 24, 26, 28];

/** Longest standard slide that fits the depth, or null when it is under 10". */
export function slideLengthFor(depth: number): number | null {
  const fit = SLIDE_LENGTHS.filter((l) => l <= depth + 1e-6);
  return fit.length ? fit[fit.length - 1] : null;
}

export type SlideType = 'side' | 'under';

/**
 * Slide clearances.
 * Side-mount ball-bearing: 1/2" each side (box 1" narrower than the opening),
 * 1/2" under and over the box.
 * Undermount (Blum TANDEM-style): the INSIDE box width is the opening minus 42 mm
 * (49 mm for 3/4" sides), the bottom is recessed 1/2", the box sits 9/16" up and is
 * at most the opening height minus 13/16".
 */
export const SLIDE_CLEARANCE = {
  side: { perSide: 0.5, below: 0.5, above: 0.5 },
  under: { insideDeduct: 42 * MM, insideDeduct34: 49 * MM, below: 9 / 16, above: 1 / 4, bottomRecess: 0.5 },
} as const;

/** Outside drawer box width for an opening width. */
export function boxWidth(opening: number, slide: SlideType, side: number): number {
  if (slide === 'side') return r4(opening - 2 * SLIDE_CLEARANCE.side.perSide);
  const inside = opening - (side >= 0.7 ? SLIDE_CLEARANCE.under.insideDeduct34 : SLIDE_CLEARANCE.under.insideDeduct);
  return r4(inside + 2 * side);
}

/** Box height and its bottom (from the zone bottom) for a zone of the opening. */
export function boxHeight(zone: number, slide: SlideType): { height: number; lift: number } {
  const c = SLIDE_CLEARANCE[slide];
  return { height: r16(Math.max(2, zone - c.below - c.above)), lift: c.below };
}

/** Split a total into n heights: even, or graduated (each lower one taller). Top first. */
export function splitHeights(total: number, n: number, mode: 'even' | 'graduated'): number[] {
  if (n <= 1) return [r4(total)];
  const w = Array.from({ length: n }, (_, i) => (mode === 'graduated' ? 1 + 0.25 * i : 1));
  const sum = w.reduce((a, b) => a + b, 0);
  const out = w.slice(0, -1).map((x) => r16((total * x) / sum));
  out.push(r4(total - out.reduce((a, b) => a + b, 0)));
  return out;
}

export interface FrontRect { x0: number; width: number; y0: number; height: number }

export interface DrawerPlanInput {
  width: number; height: number; depth: number;
  count: number; heights: 'even' | 'graduated';
  mount: 'overlay' | 'inset';
  slide: SlideType;
  /** Box side thickness (1/2" or 3/4"). */
  side: number;
  frontT: number;
  /** Overlay: gap between fronts and at the outer edges (sets the overlay). Inset: reveal all round. */
  gap: number; reveal: number;
  /** Cabinet side thickness (full overlay covers it less half a gap). */
  sideT: number;
}

export interface DrawerPlan {
  fronts: FrontRect[];
  boxes: { y0: number; height: number; width: number; length: number }[];
  /** Slide length (null = too shallow for a standard slide). */
  slide: number | null;
  /** z of the box fronts (0 overlay, -front thickness inset). */
  boxFrontZ: number;
  overlay: number;
}

/** Overlay per side for a full-overlay front on a cabinet side of thickness T. */
export const fullOverlay = (sideT: number, gap: number) => r4(Math.max(0, sideT - gap / 2));
export const halfOverlay = (sideT: number, gap: number) => r4(Math.max(0, sideT / 2 - gap / 2));

export function drawerPlan(v: DrawerPlanInput): DrawerPlan {
  const n = Math.max(1, Math.round(v.count));
  const inset = v.mount === 'inset';
  const ov = inset ? 0 : fullOverlay(v.sideT, v.gap);
  const g = inset ? v.reveal : v.gap;
  // Fronts, top first.
  const total = inset ? v.height - (n + 1) * g : v.height + 2 * ov - (n - 1) * g;
  const hs = splitHeights(total, n, v.heights);
  const fw = inset ? v.width - 2 * g : v.width + 2 * ov;
  const fronts: FrontRect[] = [];
  let top = inset ? v.height - g : v.height + ov;
  for (const h of hs) { fronts.push({ x0: r4(-fw / 2), width: r4(fw), y0: r4(top - h), height: h }); top -= h + g; }
  // Zones split the opening at the middle of each gap.
  const cuts = [v.height, ...fronts.slice(0, -1).map((f) => f.y0 - g / 2), 0].map((y) => Math.max(0, Math.min(v.height, y)));
  const boxFrontZ = inset ? -v.frontT : 0;
  const slide = slideLengthFor(v.depth + boxFrontZ);
  const length = slide ?? r16(Math.max(4, v.depth + boxFrontZ - 1));
  const bw = boxWidth(v.width, v.slide, v.side);
  const boxes = fronts.map((_, i) => {
    const hi = cuts[i], lo = cuts[i + 1];
    const { height, lift } = boxHeight(hi - lo, v.slide);
    return { y0: r4(lo + lift), height, width: bw, length };
  });
  return { fronts, boxes, slide, boxFrontZ, overlay: ov };
}

/** Concealed hinges per door by height: 2 under 40", 3 to 60", 4 to 80", then one more per 20". */
export function hingeCount(doorHeight: number): number {
  if (doorHeight < 40) return 2;
  if (doorHeight <= 60) return 3;
  if (doorHeight <= 80) return 4;
  return 4 + Math.ceil((doorHeight - 80) / 20);
}

/** Hinge centers (y from the door bottom): 3" from each end, the rest evenly between. */
export function hingePositions(doorHeight: number, fromEnd = 3): number[] {
  const n = hingeCount(doorHeight);
  const a = Math.min(fromEnd, doorHeight / 4), b = doorHeight - a;
  return Array.from({ length: n }, (_, i) => r4(a + ((b - a) * i) / (n - 1)));
}

/** 35 mm cup, center 22.5 mm in from the hinge edge, 1/2" deep. */
export const HINGE_CUP = { diameter: r4(35 * MM), fromEdge: r4(22.5 * MM), depth: 0.5 };

export type DoorMount = 'full' | 'half' | 'inset';

export interface DoorPlanInput {
  width: number; height: number;
  mount: DoorMount; count: 1 | 2;
  gap: number; reveal: number; sideT: number;
}

export interface DoorPlan {
  doors: (FrontRect & { hinge: 'left' | 'right' })[];
  overlay: number;
}

/** Door sizes for an opening. A pair hinges on the outer edges; a single door on `hingeSide`. */
export function doorPlan(v: DoorPlanInput, hingeSide: 'left' | 'right' = 'left'): DoorPlan {
  const ov = v.mount === 'full' ? fullOverlay(v.sideT, v.gap) : v.mount === 'half' ? halfOverlay(v.sideT, v.gap) : 0;
  const inset = v.mount === 'inset';
  const edge = inset ? v.reveal : 0;
  const mid = inset ? v.reveal : v.gap;
  const total = inset ? v.width - 2 * edge : v.width + 2 * ov;
  const h = inset ? v.height - 2 * edge : v.height + 2 * ov;
  const y0 = inset ? edge : -ov;
  const x0 = -total / 2;
  if (v.count === 2) {
    const w = r16((total - mid) / 2);
    return { overlay: ov, doors: [
      { x0: r4(x0), width: w, y0: r4(y0), height: r4(h), hinge: 'left' },
      { x0: r4(x0 + total - w), width: w, y0: r4(y0), height: r4(h), hinge: 'right' },
    ] };
  }
  return { overlay: ov, doors: [{ x0: r4(x0), width: r4(total), y0: r4(y0), height: r4(h), hinge: hingeSide }] };
}

/** Shaker frame: stiles full height, rails between them, a 1/4" panel in 3/8" grooves. */
export function shakerParts(width: number, height: number, stile: number) {
  const groove = 0.375;
  const s = Math.min(stile, width / 3, height / 4);
  return {
    stile: { width: r4(s), length: r4(height) },
    rail: { width: r4(s), length: r4(width - 2 * s) },
    panel: { width: r4(width - 2 * s + 2 * groove), height: r4(height - 2 * s + 2 * groove), thickness: 0.25 },
    groove,
  };
}
