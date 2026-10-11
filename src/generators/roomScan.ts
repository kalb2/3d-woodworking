import type { FurnitureObject, RoomWall, ScannedOpening, ScannedRoom, WoodMaterial } from '../types/furniture';
import type { WallScanResult } from '../native/wallScan';
import { PRESET_WOOD_MATERIALS } from '../utils/woodTextureGenerator';

/** Tag on every part created from a room scan. */
export const ROOM_SCAN_TAG = 'room-scan';

const WALL_T = 4;
const OPENING_T = 0.5;
const r1 = (n: number) => Math.round(n * 10) / 10;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

type Part = Omit<FurnitureObject, 'id'>;

function paint(name: string, color: string, secondary: string): WoodMaterial {
  return { ...PRESET_WOOD_MATERIALS.custom_paint, name, baseColor: color, secondaryColor: secondary, grainIntensity: 0 };
}
export const ROOM_WALL_MATERIAL = paint('Room wall (scan)', '#d6d3cd', '#cbc7c0');
export const ROOM_OPENING_MATERIAL = paint('Opening (scan)', '#9cc9f0', '#8bbbe6');

/** Unit vectors for a wall frame: `along` = local +x, `normal` = local +z (into the room). */
export function wallFrame(yaw: number) {
  const t = (yaw * Math.PI) / 180;
  return { along: { x: Math.cos(t), z: -Math.sin(t) }, normal: { x: Math.sin(t), z: Math.cos(t) } };
}

/**
 * Turn a RoomPlan result (inches, column-major transforms) into compact room
 * data: Y-up, floor at y = 0, room centered on the origin, each wall's frame
 * facing into the room, openings measured from the wall's local left edge.
 */
export function roomFromScan(result: WallScanResult): ScannedRoom {
  const raw = (result.walls ?? []).filter((w) => w.width > 0 && w.height > 0 && w.transform?.length === 16);
  if (raw.length === 0) return { walls: [] };
  const floorY = Math.min(...raw.map((w) => w.transform[13] - w.height / 2));
  const xs = raw.map((w) => w.transform[12]);
  const zs = raw.map((w) => w.transform[14]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  const all = [...(result.windows ?? []), ...(result.doors ?? []), ...(result.openings ?? [])];

  // 2D wall segments (x, z) for inside/outside ray tests.
  const segs: Seg[] = raw.map((w) => {
    const t = w.transform;
    const len = Math.hypot(t[0], t[2]) || 1;
    const ax = t[0] / len, az = t[2] / len;
    const h = w.width / 2;
    return { ax: t[12] - cx - ax * h, az: t[14] - cz - az * h, bx: t[12] - cx + ax * h, bz: t[14] - cz + az * h };
  });

  const walls: RoomWall[] = raw.map((w, i) => {
    const t = w.transform;
    const x = t[12] - cx;
    const z = t[14] - cz;
    // Wall's own x axis (RoomPlan "left to right") and its normal.
    let ax = t[0], az = t[2];
    let nx = t[8], nz = t[10];
    const len = Math.hypot(ax, az) || 1; ax /= len; az /= len;
    const nlen = Math.hypot(nx, nz) || 1; nx /= nlen; nz /= nlen;
    if (!normalPointsInside(i, segs, { x, z }, { x: ax, z: az }, { x: nx, z: nz })) { nx = -nx; nz = -nz; }
    let yaw = (Math.atan2(nx, nz) * 180) / Math.PI;
    if (yaw <= -179.95) yaw += 360;
    const frame = wallFrame(yaw);
    const flipped = frame.along.x * ax + frame.along.z * az < 0;
    const openings: ScannedOpening[] = all.filter((o) => o.wallId === w.id).map((o) => ({
      id: o.id, kind: o.kind, width: r1(o.width), height: r1(o.height),
      offsetX: r1(flipped ? w.width - o.offsetX - o.width : o.offsetX),
      bottom: r1(o.bottom + Math.max(0, t[13] - w.height / 2 - floorY)),
    }));
    return { id: w.id, label: `Wall ${i + 1}`, width: r1(w.width), height: r1(w.height), x: r1(x), z: r1(z), yaw: r1(yaw), openings };
  });
  return { walls };
}

interface Seg { ax: number; az: number; bx: number; bz: number }
type V2 = { x: number; z: number };

/** Number of wall segments (other than `skip`) hit by a ray from `o` along `d`. */
function rayHits(skip: number, segs: Seg[], o: V2, d: V2): number {
  let hits = 0;
  segs.forEach((s, i) => {
    if (i === skip) return;
    const ex = s.bx - s.ax, ez = s.bz - s.az;
    const den = d.x * ez - d.z * ex;
    if (Math.abs(den) < 1e-9) return;
    const wx = s.ax - o.x, wz = s.az - o.z;
    const t = (wx * ez - wz * ex) / den; // along ray
    const u = (wx * d.z - wz * d.x) / den; // along segment
    if (t > 1e-6 && u >= 0 && u <= 1) hits++;
  });
  return hits;
}

/**
 * True when the normal points into the room: a ray from just in front of the
 * wall crosses an odd number of the other walls (point-in-polygon). Works for
 * L-shaped and other concave rooms. Falls back to "faces the room center" when
 * the room outline is open and the test is inconclusive.
 */
export function normalPointsInside(index: number, segs: Seg[], mid: V2, along: V2, n: V2): boolean {
  // Nudge off the exact midpoint so the ray rarely grazes a corner.
  const o = { x: mid.x + along.x * 0.137 + n.x * 0.5, z: mid.z + along.z * 0.137 + n.z * 0.5 };
  const back = { x: mid.x + along.x * 0.137 - n.x * 0.5, z: mid.z + along.z * 0.137 - n.z * 0.5 };
  const front = rayHits(index, segs, o, n) % 2 === 1;
  const behind = rayHits(index, segs, back, { x: -n.x, z: -n.z }) % 2 === 1;
  if (front !== behind) return front;
  return n.x * -mid.x + n.z * -mid.z >= 0;
}

/** Map a point in a wall's local frame (x from wall center, y up, z into room) to world. */
export function wallToWorld(wall: RoomWall, p: { x: number; y: number; z: number }) {
  const { along, normal } = wallFrame(wall.yaw);
  return { x: r3(wall.x + along.x * p.x + normal.x * p.z), y: r3(p.y), z: r3(wall.z + along.z * p.x + normal.z * p.z) };
}

/** Locked reference parts for the scanned room (walls behind their interior face, openings on it). */
export function roomScanParts(room: ScannedRoom): Part[] {
  const parts: Part[] = [];
  const base = { visible: true, locked: true, reference: true, generator: ROOM_SCAN_TAG } as const;
  for (const wall of room.walls) {
    parts.push({
      ...base,
      name: `${wall.label} (scan)`,
      wallId: wall.id,
      shape: 'cube',
      dimensions: { length: wall.width, height: wall.height, width: WALL_T },
      position: wallToWorld(wall, { x: 0, y: wall.height / 2, z: -WALL_T / 2 }),
      rotation: { x: 0, y: wall.yaw, z: 0 },
      material: { ...ROOM_WALL_MATERIAL },
    });
    wall.openings.forEach((o, i) => {
      const label = o.kind === 'window' ? 'Window' : o.kind === 'door' ? 'Door' : 'Opening';
      parts.push({
        ...base,
        name: `${wall.label} ${label} ${i + 1} (scan)`,
        wallId: wall.id,
        openingId: o.id,
        shape: 'cube',
        dimensions: { length: o.width, height: o.height, width: OPENING_T },
        position: wallToWorld(wall, { x: -wall.width / 2 + o.offsetX + o.width / 2, y: o.bottom + o.height / 2, z: OPENING_T / 2 }),
        rotation: { x: 0, y: wall.yaw, z: 0 },
        material: { ...ROOM_OPENING_MATERIAL },
      });
    });
  }
  return parts;
}

const isOpeningName = (name: string) => /\b(Window|Door|Opening)\b/.test(name);

/**
 * Rebuild the compact room data from the (possibly user-edited) room-scan
 * parts, so fitting and templates use the corrected walls. Walls whose part
 * was deleted drop out; openings follow their panels. Pure.
 */
export function syncRoomFromParts(room: ScannedRoom, objects: FurnitureObject[]): ScannedRoom {
  const scan = objects.filter((o) => o.generator === ROOM_SCAN_TAG);
  const walls: RoomWall[] = [];
  for (const wall of room.walls) {
    const part = scan.find((o) => o.wallId === wall.id && !isOpeningName(o.name));
    if (!part) continue;
    const yaw = part.rotation.y;
    const { normal } = wallFrame(yaw);
    const t = part.dimensions.width / 2;
    const next: RoomWall = {
      ...wall,
      width: r1(part.dimensions.length),
      height: r1(part.dimensions.height),
      yaw: r1(yaw),
      x: r1(part.position.x + normal.x * t),
      z: r1(part.position.z + normal.z * t),
      openings: [],
    };
    const { along } = wallFrame(next.yaw);
    // Scans from before opening ids keep their openings as scanned.
    if (!scan.some((p) => p.openingId)) { next.openings = wall.openings; walls.push(next); continue; }
    for (const o of wall.openings) {
      const op = scan.find((p) => p.openingId === o.id);
      if (!op) continue;
      const lx = (op.position.x - next.x) * along.x + (op.position.z - next.z) * along.z;
      const w = op.dimensions.length, h = op.dimensions.height;
      next.openings.push({
        ...o,
        width: r1(w),
        height: r1(h),
        offsetX: r1(lx + next.width / 2 - w / 2),
        bottom: r1(Math.max(0, op.position.y - h / 2)),
      });
    }
    walls.push(next);
  }
  return { walls };
}
