import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildModule, MODULES, moduleHardware, normalizeModuleInput, type ModuleId } from './modules';
import { placeBuiltIn, builtInModified, resizeBuiltIn } from '../builtins/builtIns';
import { jointLayout, jointNote, hardwareCount } from '../joinery/joints';
import { generateCutList, projectHardware } from '../utils/exportUtils';
import { PRESET_WOOD_MATERIALS } from '../utils/woodTextureGenerator';
import { rotationMatrix } from '../utils/pushPull';
import type { FurnitureObject, FurnitureProject, Joint, ScannedRoom } from '../types/furniture';

const mat = PRESET_WOOD_MATERIALS.birch;
const room: ScannedRoom = { walls: [{ id: 'w', label: 'Wall 1', width: 160, height: 96, x: 30, z: -50, yaw: 90, openings: [] }] };

/** World-axis box of a part (parts are square to the world in these tests). */
function aabb(o: FurnitureObject) {
  const h = new THREE.Vector3(o.dimensions.length / 2, o.dimensions.height / 2, o.dimensions.width / 2);
  const m = rotationMatrix(o);
  const ext = new THREE.Vector3(
    Math.abs(m.elements[0]) * h.x + Math.abs(m.elements[4]) * h.y + Math.abs(m.elements[8]) * h.z,
    Math.abs(m.elements[1]) * h.x + Math.abs(m.elements[5]) * h.y + Math.abs(m.elements[9]) * h.z,
    Math.abs(m.elements[2]) * h.x + Math.abs(m.elements[6]) * h.y + Math.abs(m.elements[10]) * h.z,
  );
  const c = new THREE.Vector3(o.position.x, o.position.y, o.position.z);
  return { min: c.clone().sub(ext), max: c.clone().add(ext) };
}
const overlap = (a: FurnitureObject, b: FurnitureObject) => {
  const A = aabb(a), B = aabb(b);
  return (['x', 'y', 'z'] as const).map((k) => Math.min(A.max[k], B.max[k]) - Math.max(A.min[k], B.min[k]));
};

function project(objects: FurnitureObject[], joints: Joint[]): FurnitureProject {
  return { id: 'p', name: 'P', createdAt: 0, updatedAt: 0, unit: 'in', objects, joints, snapSettings: { enabled: true, faceSnap: true, gridSnap: false, gridSize: 1, floorCollision: true }, showFloor: true, floorOpacity: 1 };
}

/** Every joint seats on the face it names; boards only overlap where a joint lets them (by its depth). */
function checkSound(objects: FurnitureObject[], joints: Joint[]) {
  const byId = new Map(objects.map((o) => [o.id, o]));
  for (const j of joints) {
    const R = byId.get(j.receiverId), M = byId.get(j.materId);
    expect(R && M, j.id).toBeTruthy();
    expect(jointLayout(j, R, M), `${R!.name} ← ${M!.name} (${j.type})`).not.toBeNull();
    expect(jointNote(j, R!.id, R, M, 'in')).not.toMatch(/not touching/);
    if (j.type === 'pocket') expect(hardwareCount(j, R, M)).toBe(j.count);
  }
  const allowed = new Map<string, number>();
  for (const j of joints) { const k = [j.receiverId, j.materId].sort().join('|'); allowed.set(k, Math.max(allowed.get(k) ?? 0, j.depth)); }
  const parts = objects.filter((o) => o.shape === 'board');
  for (let i = 0; i < parts.length; i++) for (let k = i + 1; k < parts.length; k++) {
    const ov = overlap(parts[i], parts[k]);
    if (ov.some((v) => v <= 1e-3)) continue;
    const pen = Math.min(...ov);
    const allow = allowed.get([parts[i].id, parts[k].id].sort().join('|')) ?? 0;
    expect(pen, `${parts[i].name} overlaps ${parts[k].name} by ${pen}`).toBeLessThanOrEqual(allow + 1e-3);
  }
}

const VARIANTS: Record<ModuleId, Record<string, number | string>[]> = {
  'base-cabinet': [{}, { doors: '1', drawers: 1 }, { doors: 'none', drawers: 4 }, { doors: '2', drawers: 2, faceFrame: 'yes', shelfStyle: 'fixed' }, { back: 'none', toeKick: 0, thickness: 0.5 }],
  'upper-cabinet': [{}, { doors: 'none', shelves: 5, shelfStyle: 'fixed' }, { faceFrame: 'yes', doors: '1' }],
  bookshelf: [{}, { shelves: 0 }, { shelves: 6, shelfStyle: 'adjustable', faceFrame: 'yes' }, { toeKick: 0, back: 'none' }],
  'window-bench': [{}, { sections: 1 }, { sections: 6, toeKick: 0, thickness: 1 }],
};

describe('modular templates: every variant is buildable', () => {
  for (const m of MODULES) for (const extra of VARIANTS[m.id]) {
    it(`${m.name} ${JSON.stringify(extra)}: joints seat, nothing collides (free-standing and on a turned wall)`, () => {
      const input = { ...m.defaults, ...extra, v: 2 };
      const free = placeBuiltIn([], undefined, { template: m.id, input }, mat, 1)!;
      checkSound(free.objects, free.joints);
      const onWall = placeBuiltIn([], room, { template: m.id, input, wallId: 'w' }, mat, 2)!;
      checkSound(onWall.objects, onWall.joints);
      expect(onWall.joints.length).toBe(free.joints.length);
    });
  }
});

const named = <T extends { name: string }>(o: T[], re: RegExp): T[] => o.filter((p) => re.test(p.name));
const dims = (p: { dimensions: { length: number; height: number; width: number } }) => [p.dimensions.length, p.dimensions.height, p.dimensions.width];

describe('base cabinet', () => {
  it('standard 30 x 34 1/2 x 24: sides to the floor, dadoed bottom over a 4" toe kick, rabbeted top and back, 2 doors, 1 adjustable shelf', () => {
    const { parts, joints } = buildModule('base-cabinet', { v: 2 });
    expect(named(parts, /^Side/).map(dims)).toEqual([[0.75, 34.5, 24], [0.75, 34.5, 24]]);
    const bottom = named(parts, /^Bottom$/)[0];
    expect(dims(bottom)).toEqual([28.5 + 0.5, 0.75, 23.75]); // into 1/4" dados both sides
    expect(bottom.position.y - 0.375).toBeCloseTo(4, 6);
    expect(named(parts, /^Door/)).toHaveLength(2);
    expect(named(parts, /^Shelf/)).toHaveLength(1);
    expect(named(parts, /^Toe kick/)).toHaveLength(1);
    const types = (re: RegExp) => joints.filter((j) => re.test(parts[j.mater].name)).map((j) => j.type);
    expect(types(/^Bottom$/)).toEqual(['dado', 'dado']);
    expect(types(/^Top$/)).toEqual(['rabbet', 'rabbet']);
    expect(types(/^Back$/)).toEqual(['rabbet', 'rabbet']);
    expect(types(/^Shelf/)).toEqual([]); // adjustable: shelf pins, no joint
    const sideHoles = parts.filter((p) => /^Side/.test(p.name)).map((p) => p.board!.holes.length);
    expect(sideHoles[0]).toBeGreaterThan(0);
    expect(sideHoles[0]).toBe(sideHoles[1]);
  });

  it('drawers stack over doors with a divider; drawer-only bank has no doors or shelves; old fronts/count saves still load', () => {
    const mixed = buildModule('base-cabinet', { v: 2, doors: '2', drawers: 1 }).parts;
    expect(named(mixed, /^Drawer front/)).toHaveLength(1);
    expect(named(mixed, /^Divider$/)).toHaveLength(1);
    expect(named(mixed, /^Drawer 1 (side|front|back|bottom)/)).toHaveLength(5);
    const bank = buildModule('base-cabinet', { v: 2, doors: 'none', drawers: 3 }).parts;
    expect(named(bank, /^Drawer front/)).toHaveLength(3);
    expect(named(bank, /^Door|^Shelf/)).toHaveLength(0);
    expect(normalizeModuleInput('base-cabinet', { fronts: 'drawers', count: 3 })).toMatchObject({ doors: 'none', drawers: 3 });
    expect(normalizeModuleInput('base-cabinet', { fronts: 'doors', count: 1 })).toMatchObject({ doors: '1', drawers: 0 });
  });

  it('face frame: stiles and rails, rails pocket-screwed (2 per end); fronts sit on the frame', () => {
    const { parts, joints } = buildModule('base-cabinet', { v: 2, faceFrame: 'yes', drawers: 1 });
    expect(named(parts, /^Stile/)).toHaveLength(2);
    const rails = named(parts, /^Rail/);
    expect(rails.length).toBe(3);
    expect(joints.filter((j) => j.type === 'pocket')).toHaveLength(rails.length * 2);
    const door = named(parts, /^Door/)[0];
    expect(door.position.z - door.dimensions.width / 2).toBeCloseTo(24 + 0.75, 6);
  });

  it('hardware: hinges per door, slide pairs per drawer, pins per adjustable shelf, a pull per front', () => {
    expect(moduleHardware('base-cabinet', { v: 2, drawers: 1 })).toEqual([
      { name: 'Hinges (concealed)', quantity: 4 },
      { name: 'Drawer slides 22" (pairs)', quantity: 1 },
      { name: 'Pulls / knobs', quantity: 3 },
      { name: 'Shelf pins 1/4"', quantity: 4 },
    ]);
  });
});

describe('upper cabinet, bookshelf, window bench', () => {
  it('upper: 30 x 30 x 12 hung at 54", 2 doors, 2 shelves, rabbeted top and bottom', () => {
    const { parts, joints } = buildModule('upper-cabinet', { v: 2 });
    const side = named(parts, /^Side L/)[0];
    expect(side.position.y - side.dimensions.height / 2).toBeCloseTo(54, 6);
    expect(dims(side)).toEqual([0.75, 30, 12]);
    expect(named(parts, /^Door/)).toHaveLength(2);
    expect(named(parts, /^Shelf/)).toHaveLength(2);
    expect(joints.filter((j) => /^(Top|Bottom)$/.test(parts[j.mater].name)).every((j) => j.type === 'rabbet')).toBe(true);
  });

  it('bookshelf: fixed shelves in 1/4" dados, evenly spaced; shelf count changes respace them', () => {
    const four = buildModule('bookshelf', { v: 2, shelves: 4 });
    const shelves = named(four.parts, /^Shelf/);
    expect(shelves).toHaveLength(4);
    expect(dims(shelves[0])).toEqual([34.5 + 0.5, 0.75, 12 - 0.25 - 0.25]);
    expect(four.joints.filter((j) => /^Shelf/.test(four.parts[j.mater].name)).every((j) => j.type === 'dado' && j.depth === 0.25)).toBe(true);
    const ys = shelves.map((s) => s.position.y);
    const gaps = ys.slice(1).map((y, i) => y - ys[i]);
    for (const g of gaps) expect(g).toBeCloseTo(gaps[0], 6);
    expect(named(buildModule('bookshelf', { v: 2, shelves: 6 }).parts, /^Shelf/)).toHaveLength(6);
  });

  it('bench: cubby dividers in dados in the bottom, seat pocket-screwed to sides and dividers', () => {
    const { parts, joints } = buildModule('window-bench', { v: 2, sections: 3 });
    expect(named(parts, /^Divider/)).toHaveLength(2);
    expect(joints.filter((j) => /^Divider/.test(parts[j.mater].name) && j.type === 'dado')).toHaveLength(2);
    expect(joints.filter((j) => parts[j.receiver].name === 'Seat').map((j) => j.count)).toEqual([3, 3, 2, 2]);
    const seat = named(parts, /^Seat/)[0];
    expect(seat.position.y + seat.dimensions.height / 2).toBeCloseTo(18, 6);
  });
});

describe('cut list from a placed template', () => {
  it('lists every board with its joinery; template hardware joins the hardware list', () => {
    const placed = placeBuiltIn([], undefined, { template: 'bookshelf', input: { v: 2 } }, mat, 1)!;
    const p = project(placed.objects, placed.joints);
    const rows = generateCutList(p);
    const qty = rows.reduce((n, r) => n + r.quantity, 0);
    expect(qty).toBe(placed.objects.filter((o) => o.shape === 'board').length);
    const shelf = rows.find((r) => r.name.startsWith('Shelf'))!;
    expect(shelf.quantity).toBe(4);
    expect(shelf.notes).toMatch(/into dado 1\/4"/);
    const side = rows.find((r) => r.name.startsWith('Side'))!;
    expect(side.quantity).toBe(2); // left and right merge (mirror images)
    expect(side.notes).toMatch(/dado 3\/4 x 1\/4 @/);
    expect(side.notes).toMatch(/rabbet 1\/4 x 3\/8/);
    const upper = placeBuiltIn(placed.objects, undefined, { template: 'upper-cabinet', input: { v: 2 } }, mat, 2)!;
    expect(projectHardware(project(upper.objects, upper.joints))).toEqual(expect.arrayContaining([
      { name: 'Hinges (concealed)', quantity: 4 }, { name: 'Shelf pins 1/4"', quantity: 8 },
    ]));
  });
});

describe('editing a placed template', () => {
  it('rebuild keeps the group id, its spot and turn; only its own parts and joints change', () => {
    const a = placeBuiltIn([], undefined, { template: 'bookshelf', input: { v: 2 } }, mat, 1)!;
    const b = placeBuiltIn(a.objects, undefined, { template: 'base-cabinet', input: { v: 2 }, at: { x: 60, z: 0 } }, mat, 2, a.joints)!;
    // Move and turn the bookshelf (as the Move/Rotate tools do: children follow the group).
    const g = b.objects.find((o) => o.id === a.groupId)!;
    const turned = b.objects.map((o) => {
      if (o.id === g.id) return { ...o, position: { x: -40, y: o.position.y, z: 20 }, rotation: { x: 0, y: 90, z: 0 } };
      if (o.parentId !== g.id) return o;
      const v = new THREE.Vector3(o.position.x - g.position.x, o.position.y - g.position.y, o.position.z - g.position.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
      return { ...o, position: { x: -40 + v.x, y: g.position.y + v.y, z: 20 + v.z }, rotation: { ...o.rotation, y: o.rotation.y + 90 } };
    });
    expect(builtInModified(turned, b.joints, undefined, a.groupId)).toBe(false);
    const bi = g.builtIn!;
    const edited = placeBuiltIn(turned, undefined, { template: 'bookshelf', input: { ...bi.input, shelves: 2 }, editId: bi.id }, mat, 3, b.joints)!;
    expect(edited.groupId).toBe(a.groupId);
    const eg = edited.objects.find((o) => o.id === a.groupId)!;
    expect(eg.rotation.y).toBe(90);
    // Same footprint: back-bottom-center stays where it was.
    const side = (objs: FurnitureObject[]) => objs.find((o) => o.builtInId === bi.id && o.name === 'Side L')!;
    expect(side(edited.objects).position).toEqual(side(turned).position);
    expect(edited.objects.filter((o) => o.builtInId === bi.id && /^Shelf/.test(o.name))).toHaveLength(2);
    checkSound(edited.objects, edited.joints);
    // The cabinet is untouched.
    const other = (objs: FurnitureObject[], js: Joint[]) => JSON.stringify([objs.filter((o) => o.id === b.groupId || o.parentId === b.groupId), js.filter((j) => j.id.includes(b.groupId.slice(4)))]);
    expect(other(edited.objects, edited.joints)).toBe(other(turned, b.joints));
  });

  it('knows when boards were changed by hand', () => {
    const a = placeBuiltIn([], undefined, { template: 'bookshelf', input: { v: 2 } }, mat, 1)!;
    expect(builtInModified(a.objects, a.joints, undefined, a.groupId)).toBe(false);
    const shelf = a.objects.find((o) => o.name === 'Shelf 1')!;
    const moved = a.objects.map((o) => (o.id === shelf.id ? { ...o, position: { ...o.position, y: o.position.y + 2 } } : o));
    expect(builtInModified(moved, a.joints, undefined, a.groupId)).toBe(true);
    const deepened = a.joints.map((j, i) => (i === 0 ? { ...j, depth: 0.375 } : j));
    expect(builtInModified(a.objects, deepened, undefined, a.groupId)).toBe(true);
    const painted = a.objects.map((o) => (o.id === shelf.id ? { ...o, material: { ...PRESET_WOOD_MATERIALS.walnut } } : o));
    expect(builtInModified(painted, a.joints, undefined, a.groupId)).toBe(true);
  });

  it('group resize rebuilds: wider shelves (not stretched sides), opposite face stays; changed boards fall back to stretching', () => {
    const a = placeBuiltIn([], undefined, { template: 'bookshelf', input: { v: 2 } }, mat, 1)!;
    const sideL = (objs: FurnitureObject[]) => objs.find((o) => o.name === 'Side L')!;
    const r = resizeBuiltIn(a.objects, a.joints, undefined, a.groupId, '+x', 6)!;
    const g = r.objects.find((o) => o.id === a.groupId)!;
    expect(g.builtIn!.input.width).toBe(42);
    expect(sideL(r.objects).position.x).toBeCloseTo(sideL(a.objects).position.x, 6); // left side stays
    expect(sideL(r.objects).dimensions.length).toBe(0.75); // sides keep their thickness
    expect(r.objects.find((o) => o.name === 'Shelf 1')!.dimensions.length).toBeCloseTo(40.5 + 0.5, 6);
    checkSound(r.objects, r.joints);
    const taller = resizeBuiltIn(a.objects, a.joints, undefined, a.groupId, '+y', 12)!;
    expect(taller.objects.filter((o) => /^Shelf/.test(o.name))).toHaveLength(4);
    expect(taller.objects.find((o) => o.id === a.groupId)!.builtIn!.input.height).toBe(84);
    const moved = a.objects.map((o) => (o.name === 'Shelf 1' ? { ...o, position: { ...o.position, y: o.position.y + 2 } } : o));
    expect(resizeBuiltIn(moved, a.joints, undefined, a.groupId, '+x', 6)).toBeNull();
  });
});
