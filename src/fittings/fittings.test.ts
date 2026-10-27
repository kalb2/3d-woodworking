import { describe, expect, it } from 'vitest';
import { boxWidth, boxHeight, doorPlan, drawerPlan, HINGE_CUP, hingeCount, hingePositions, MM, slideLengthFor, splitHeights, type DrawerPlanInput } from './fittingMath';
import { buildDoors, buildDrawers, doorHardware, drawerHardware, hingeCups, normalizeDrawers } from './fittings';
import { detectOpening, hostChanges, openingBetween, openingInput } from './opening';
import { builtInModified, placeBuiltIn, resizeBuiltIn, templateSummary } from '../builtins/builtIns';
import { projectHardware } from '../utils/exportUtils';
import { partCutters } from '../joinery/joints';
import { PRESET_WOOD_MATERIALS } from '../utils/woodTextureGenerator';
import type { FurnitureObject, Joint } from '../types/furniture';

const mat = PRESET_WOOD_MATERIALS.birch;
const close = (a: number, b: number, d = 3) => expect(a).toBeCloseTo(b, d);

describe('slides and drawer boxes', () => {
  it('picks the longest standard slide (10–28 in 2" steps) that fits', () => {
    expect(slideLengthFor(22.75)).toBe(22);
    expect(slideLengthFor(23.75)).toBe(22);
    expect(slideLengthFor(24)).toBe(24);
    expect(slideLengthFor(10)).toBe(10);
    expect(slideLengthFor(9.9)).toBeNull();
    expect(slideLengthFor(40)).toBe(28);
  });

  it('side-mount boxes are 1" narrower; undermount sets the inside width to opening - 42 mm', () => {
    expect(boxWidth(16.5, 'side', 0.5)).toBe(15.5);
    close(boxWidth(21, 'under', 0.5) - 1, 21 - 42 * MM);
    close(boxWidth(21, 'under', 0.75) - 1.5, 21 - 49 * MM);
    expect(boxHeight(6, 'side')).toEqual({ height: 5, lift: 0.5 });
    // Blum: max height = opening - 13/16", sitting 9/16" up.
    expect(boxHeight(6, 'under')).toEqual({ height: 5.1875, lift: 0.5625 });
  });

  it('splits heights evenly or graduated, always adding up', () => {
    const even = splitHeights(29, 4, 'even');
    expect(even).toEqual([7.25, 7.25, 7.25, 7.25]);
    const g = splitHeights(29, 4, 'graduated');
    close(g.reduce((a, b) => a + b, 0), 29, 6);
    for (let i = 1; i < g.length; i++) expect(g[i]).toBeGreaterThan(g[i - 1]);
  });
});

const base: DrawerPlanInput = { width: 28.5, height: 29, depth: 23.75, count: 3, heights: 'even', mount: 'overlay', slide: 'side', side: 0.5, frontT: 0.75, gap: 0.125, reveal: 0.0625, sideT: 0.75 };

describe('drawerPlan', () => {
  it('overlay fronts cover the cabinet sides less half a gap, with 1/8" between', () => {
    const p = drawerPlan(base);
    expect(p.overlay).toBe(0.6875);
    expect(p.fronts).toHaveLength(3);
    for (const f of p.fronts) { expect(f.width).toBe(29.875); expect(f.x0).toBe(-14.9375); }
    close(p.fronts[0].y0 + p.fronts[0].height, 29 + 0.6875);
    close(p.fronts[2].y0, -0.6875);
    close(p.fronts[0].y0 - (p.fronts[1].y0 + p.fronts[1].height), 0.125);
    expect(p.slide).toBe(22);
    expect(p.boxFrontZ).toBe(0);
    for (const b of p.boxes) { expect(b.width).toBe(27.5); expect(b.length).toBe(22); }
    // Boxes stay inside the opening with 1/2" over and under.
    expect(p.boxes[2].y0).toBe(0.5);
    for (const b of p.boxes) { expect(b.y0).toBeGreaterThanOrEqual(0.5); expect(b.y0 + b.height).toBeLessThanOrEqual(29 - 0.5 + 1e-6); }
  });

  it('inset fronts sit inside with a 1/16" reveal; the box starts behind the front', () => {
    const p = drawerPlan({ ...base, mount: 'inset', count: 2 });
    for (const f of p.fronts) expect(f.width).toBe(28.375);
    close(p.fronts.reduce((a, f) => a + f.height, 0), 29 - 3 * 0.0625);
    expect(p.fronts[1].y0).toBe(0.0625);
    expect(p.boxFrontZ).toBe(-0.75);
    expect(p.slide).toBe(22); // 23.75 - 0.75 = 23
    expect(drawerPlan({ ...base, mount: 'inset', depth: 22.5 }).slide).toBe(20);
  });

  it('too shallow for a slide: no slide, still a box', () => {
    const p = drawerPlan({ ...base, depth: 8, count: 1 });
    expect(p.slide).toBeNull();
    expect(p.boxes[0].length).toBe(7);
  });
});

describe('hinges', () => {
  it('2 under 40", 3 up to 60", 4 up to 80", then more', () => {
    expect([20, 39.9, 40, 60, 60.1, 80, 81, 101].map(hingeCount)).toEqual([2, 2, 3, 3, 4, 4, 5, 6]);
  });
  it('3" from each end, the rest evenly between', () => {
    expect(hingePositions(30)).toEqual([3, 27]);
    expect(hingePositions(50)).toEqual([3, 25, 47]);
    expect(hingePositions(70)).toEqual([3, 24.3333, 45.6667, 67]);
  });
  it('35 mm cups centered 22.5 mm from the hinge edge on the back face', () => {
    expect(HINGE_CUP.diameter).toBe(1.378);
    expect(HINGE_CUP.fromEdge).toBe(0.8858);
    const h = hingeCups(16, 30, 'left');
    expect(h).toHaveLength(2);
    // Door parts are turned 180°, so the world-left edge is local +x.
    expect(h[0]).toMatchObject({ face: 'front', x: 8 - 0.8858, z: 3 - 15, depth: 0.5, anchor: { u: 'end', v: 'start' } });
    expect(h[1]).toMatchObject({ z: 12, anchor: { u: 'end', v: 'end' } });
    expect(hingeCups(16, 50, 'right')[1]).toMatchObject({ x: -(8 - 0.8858), z: 0, anchor: { u: 'start', v: 'center' } });
  });
});

describe('doorPlan', () => {
  const v = { width: 28.5, height: 29, gap: 0.125, reveal: 0.0625, sideT: 0.75 };
  it('full overlay single and pair', () => {
    const one = doorPlan({ ...v, mount: 'full', count: 1 });
    expect(one.doors[0]).toMatchObject({ width: 29.875, height: 30.375, x0: -14.9375, y0: -0.6875, hinge: 'left' });
    const two = doorPlan({ ...v, mount: 'full', count: 2 });
    expect(two.doors.map((d) => d.width)).toEqual([14.875, 14.875]);
    expect(two.doors.map((d) => d.hinge)).toEqual(['left', 'right']);
    close(two.doors[1].x0 - (two.doors[0].x0 + two.doors[0].width), 0.125);
  });
  it('half overlay and inset', () => {
    expect(doorPlan({ ...v, mount: 'half', count: 1 }).overlay).toBe(0.3125);
    const inset = doorPlan({ ...v, mount: 'inset', count: 2 });
    expect(inset.doors[0]).toMatchObject({ height: 28.875, y0: 0.0625 });
    close(inset.doors[0].x0, -14.1875);
    close(inset.doors[1].x0 + inset.doors[1].width, 14.1875, 2);
  });
});

describe('built drawers and doors', () => {
  it('drawers: false fronts plus a 5-part box each, bottoms in grooves', () => {
    const b = buildDrawers({ width: 28.5, height: 29, depth: 23.75, count: 3, sideT: 0.75 });
    expect(b.parts).toHaveLength(18);
    expect(b.parts.filter((p) => /^Drawer front/.test(p.name))).toHaveLength(3);
    expect(b.joints.filter((j) => j.type === 'dado')).toHaveLength(12);
    expect(b.joints.filter((j) => j.type === 'butt' && j.fasten === 'glue-screws')).toHaveLength(12);
    const side = b.parts.find((p) => p.name === 'Drawer 1 side L')!;
    expect(side.dimensions).toMatchObject({ length: 0.5, width: 22 });
    const bottom = b.parts.find((p) => p.name === 'Drawer 1 bottom')!;
    expect(bottom.dimensions).toMatchObject({ length: 27.5 - 1 + 0.5, height: 0.25, width: 22 - 1 + 0.5 });
    expect(drawerHardware({ width: 28.5, height: 29, depth: 23.75, count: 3 })).toEqual([
      { name: 'Drawer slides 22" side-mount (pairs)', quantity: 3 }, { name: 'Pulls / knobs', quantity: 3 }]);
  });

  it('rabbet / dado corners lengthen the box front and back into the sides', () => {
    const rab = buildDrawers({ joinery: 'rabbet' });
    const fr = rab.parts.find((p) => p.name === 'Drawer 1 front')!;
    expect(fr.dimensions.length).toBe(17 - 1 + 2 * 0.25);
    expect(rab.joints.filter((j) => j.type === 'rabbet')).toHaveLength(4);
    expect(buildDrawers({ joinery: 'dado' }).joints.filter((j) => j.type === 'dado')).toHaveLength(8);
    // Undermount always grooves the bottom (1/2" recess).
    expect(normalizeDrawers({ slide: 'under', bottom: 'under' }).bottom).toBe('groove');
  });

  it('doors: slab with cups; shaker has stiles, rails, a grooved panel and cups in the hinge stile', () => {
    const slab = buildDoors({ width: 28.5, height: 29, doors: '2' });
    expect(slab.parts).toHaveLength(2);
    expect(slab.parts.every((p) => p.rotation.y === 180 && p.board!.holes.length === 2)).toBe(true);
    const sh = buildDoors({ width: 15, height: 50, style: 'shaker' });
    expect(sh.parts.map((p) => p.name)).toEqual(['Door stile L', 'Door stile R', 'Door rail top', 'Door rail bottom', 'Door panel']);
    expect(sh.parts[0].board!.holes).toHaveLength(3);
    expect(sh.parts[1].board!.holes).toHaveLength(0);
    expect(sh.joints.filter((j) => j.type === 'dowel')).toHaveLength(4);
    expect(sh.joints.filter((j) => j.type === 'dado')).toHaveLength(4);
    expect(doorHardware({ width: 28.5, height: 29, doors: '2' })).toEqual([
      { name: 'Hinges 35 mm concealed (full overlay)', quantity: 4 }, { name: 'Pulls / knobs', quantity: 2 }]);
    expect(doorHardware({ height: 70, hinge: 'butt', mount: 'inset' })[0]).toEqual({ name: 'Butt hinges', quantity: 4 });
  });
});

function cabinet(frame?: { origin: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number } }) {
  const out = placeBuiltIn([], undefined, { template: 'base-cabinet', input: { v: 2 }, at: { x: 0, z: 0 }, ...(frame ? { frame } : {}) }, mat, 1)!;
  return out;
}

describe('openings', () => {
  it('a selected template cabinet gives its inside and front plane', () => {
    const c = cabinet();
    const o = detectOpening(c.objects, [c.groupId])!;
    expect(o).toMatchObject({ width: 28.5, height: 29, depth: 23.75, sideT: 0.75, yaw: 0, label: 'Base cabinet' });
    const g = c.objects.find((x) => x.id === c.groupId)!;
    // Group sits centered on the floor point; its front plane is z = 12 (24 deep, doors stick out 3/4").
    close(o.origin.y, 4.75);
    expect(o.origin.x).toBeCloseTo(0, 3);
    expect(o.origin.z).toBeCloseTo(g.position.z + g.dimensions.width / 2 - 0.75, 3);
    // Selecting one of its boards works too.
    expect(detectOpening(c.objects, ['obj_' + c.groupId.slice(4) + '_0'])?.width).toBe(28.5);
    expect(hostChanges(o, 'drawers')!.words).toEqual(['doors', 'shelf']);
    expect(hostChanges(o, 'door')!.words).toEqual(['doors']);
    expect(openingInput(o, 'door')).toMatchObject({ width: 28.5, height: 29, doors: '2' });
  });

  it('follows a turned cabinet', () => {
    const c = cabinet({ origin: { x: 10, y: 0, z: 5 }, rotation: { x: 0, y: 90, z: 0 } });
    const o = detectOpening(c.objects, [c.groupId])!;
    close(o.yaw, 90);
    // Front (local z = 24) turned 90° about y points to +x.
    close(o.origin.x, 10 + 24); close(o.origin.z, 5); close(o.origin.y, 4.75);
  });

  it('the gap between two boards', () => {
    const board = (id: string, x: number): FurnitureObject => ({ id, name: id, shape: 'board', dimensions: { length: 0.75, height: 30, width: 20 },
      position: { x, y: 15, z: 10 }, rotation: { x: 0, y: 0, z: 0 }, material: mat, visible: true });
    const o = openingBetween(board('A', -10), board('B', 10))!;
    expect(o).toMatchObject({ width: 19.25, height: 30, depth: 20, sideT: 0.75 });
    expect(o.origin).toEqual({ x: 0, y: 0, z: 20 });
    expect(openingBetween(board('A', 0), board('B', 0.5))).toBeNull();
  });
});

describe('placing in an opening', () => {
  it('a drawer stack fills a cabinet; re-opening and editing keeps it in place', () => {
    const c = cabinet();
    const o = detectOpening(c.objects, [c.groupId])!;
    const host = hostChanges(o, 'drawers')!;
    const cab = placeBuiltIn(c.objects, undefined, { template: 'base-cabinet', input: { ...o.host!.input, ...host.patch }, editId: c.groupId.slice(4) }, mat, 2, c.joints)!;
    expect(cab.objects.some((x) => /^Door/.test(x.name))).toBe(false);
    const d = placeBuiltIn(cab.objects, undefined, { template: 'drawers', input: { ...openingInput(o, 'drawers'), count: 3 },
      frame: { origin: o.origin, rotation: { x: 0, y: o.yaw, z: 0 } } }, mat, 3, cab.joints)!;
    const fronts = d.objects.filter((x) => /^Drawer front/.test(x.name));
    expect(fronts).toHaveLength(3);
    // Fronts flush on the cabinet face, covering it but for 1/16" each side.
    const g = cab.objects.find((x) => x.id === cab.groupId)!;
    for (const f of fronts) { close(f.position.z, o.origin.z + 0.375); close(f.dimensions.length, 30 - 0.125); }
    close(Math.max(...fronts.map((f) => f.position.y + f.dimensions.height / 2)), 34.5 - 0.0625);
    expect(g.dimensions.length).toBe(30);
    expect(builtInModified(d.objects, d.joints, undefined, d.groupId)).toBe(false);
    // Hardware reaches the cut list.
    const hw = projectHardware({ objects: d.objects, joints: d.joints });
    expect(hw).toContainEqual({ name: 'Drawer slides 22" side-mount (pairs)', quantity: 3 });
    // Boxes clear the cabinet sides by 1/2".
    const sideL = d.objects.find((x) => x.name === 'Drawer 1 side L')!;
    close(sideL.position.x - 0.25, -14.25 + 0.5);
    // Edit: graduated, 4 drawers; same frame.
    const grp = d.objects.find((x) => x.id === d.groupId)!;
    const e = placeBuiltIn(d.objects, undefined, { template: 'drawers', input: { ...grp.builtIn!.input, count: 4, heights: 'graduated' }, editId: grp.builtIn!.id }, mat, 4, d.joints)!;
    const f2 = e.objects.filter((x) => /^Drawer front/.test(x.name));
    expect(f2).toHaveLength(4);
    for (const f of f2) close(f.position.z, o.origin.z + 0.375);
    close(Math.max(...f2.map((f) => f.position.y + f.dimensions.height / 2)), 34.5 - 0.0625);
    expect(templateSummary(e.objects.find((x) => x.id === e.groupId)!)).toBe('28 1/2" × 29" × 23 3/4" · 4 drawers · overlay · 22" slides');
  });

  it('groove and joint cutters build for the drawer box and shaker door', () => {
    const d = placeBuiltIn([], undefined, { template: 'drawers', input: {}, frame: { origin: { x: 0, y: 0.5, z: 0 }, rotation: { x: 0, y: 0, z: 0 } } }, mat, 5)!;
    const side = d.objects.find((x) => x.name === 'Drawer 1 side L')!;
    expect(partCutters({ objects: d.objects, joints: d.joints as Joint[] }, side.id).length).toBeGreaterThan(0);
    const s = placeBuiltIn([], undefined, { template: 'door', input: { style: 'shaker' }, frame: { origin: { x: 0, y: 0.6875, z: 0 }, rotation: { x: 0, y: 0, z: 0 } } }, mat, 6)!;
    const stile = s.objects.find((x) => x.name === 'Door stile L')!;
    expect(partCutters({ objects: s.objects, joints: s.joints }, stile.id).length).toBeGreaterThan(0);
  });

  it('resizing a drawer group from the front keeps its back', () => {
    const d = placeBuiltIn([], undefined, { template: 'drawers', input: {}, frame: { origin: { x: 0, y: 1, z: 0 }, rotation: { x: 0, y: 0, z: 0 } } }, mat, 7)!;
    const out = resizeBuiltIn(d.objects, d.joints, undefined, d.groupId, '+z', 2)!;
    const g = out.objects.find((x) => x.id === d.groupId)!;
    expect(g.builtIn!.input.depth).toBe(22);
    const back = (objs: FurnitureObject[]) => Math.min(...objs.filter((x) => x.builtInId === g.builtIn!.id).map((x) => x.position.z - x.dimensions.width / 2));
    close(back(out.objects), back(d.objects)); // 20" → 22" slides; the front moves out 2"
  });
});
