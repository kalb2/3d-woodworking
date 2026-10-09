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

  const walls: RoomWall[] = raw.map((w, i) => {
    const t = w.transform;
    const x = t[12] - cx;
    const z = t[14] - cz;
    // Wall's own x axis (RoomPlan "left to right") and its normal.
    let ax = t[0], az = t[2];
    let nx = t[8], nz = t[10];
    const len = Math.hypot(ax, az) || 1; ax /= len; az /= len;
    const nlen = Math.hypot(nx, nz) || 1; nx /= nlen; nz /= nlen;
    if (nx * -x + nz * -z < 0) { nx = -nx; nz = -nz; } // face the room center
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
