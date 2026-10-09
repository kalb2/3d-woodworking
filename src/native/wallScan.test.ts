import { describe, expect, it } from 'vitest';
import { describeWall } from './wallScan';
import { roomFromScan, roomScanParts, wallToWorld, ROOM_SCAN_TAG } from '../generators/roomScan';
import { generateCutList } from '../utils/exportUtils';
import type { FurnitureProject } from '../types/furniture';

// Column-major transform: x axis, y axis, z axis (normal), translation (inches).
const tf = (ax: number[], n: number[], t: number[]) => [ax[0], 0, ax[1], 0, 0, 1, 0, 0, n[0], 0, n[1], 0, t[0], t[1], t[2], 1];
// 144 x 120 room centered at (100, 48, 50): back wall at z = -10, front at z = 110, sides at x = 28 / 172.
const scan = {
  walls: [
    { id: 'back', width: 144, height: 96, transform: tf([1, 0], [0, 1], [100, 48, -10]) },
    { id: 'front', width: 144, height: 96, transform: tf([1, 0], [0, 1], [100, 48, 110]) },
    { id: 'left', width: 120, height: 96, transform: tf([0, 1], [1, 0], [28, 48, 50]) },
    { id: 'right', width: 120, height: 96, transform: tf([0, 1], [1, 0], [172, 48, 50]) },
  ],
  windows: [{ id: 'w1', kind: 'window' as const, wallId: 'back', width: 36, height: 48, offsetX: 20, bottom: 30 }],
  doors: [], openings: [],
};

describe('roomFromScan', () => {
  const room = roomFromScan(scan);
  it('centers the room, floors it and faces walls inward', () => {
    const back = room.walls[0];
    expect(back).toMatchObject({ x: 0, z: -60, yaw: 0 });
    expect(room.walls[1]).toMatchObject({ z: 60, yaw: 180 });
    expect(room.walls[2]).toMatchObject({ x: -72, yaw: 90 });
    expect(describeWall(back)).toBe('Wall 1 — 144×96 in, 1 window');
  });
  it('maps wall-local points into the room', () => {
    const p = wallToWorld(room.walls[2], { x: 0, y: 10, z: 12 });
    expect(p.x).toBeCloseTo(-60);
    expect(p.z).toBeCloseTo(0);
  });
  it('makes locked reference parts kept out of the cut list', () => {
    const parts = roomScanParts(room);
    expect(parts).toHaveLength(5);
    expect(parts.every((p) => p.locked && p.generator === ROOM_SCAN_TAG)).toBe(true);
    const win = parts[1];
    expect(win.position.x).toBeCloseTo(-72 + 20 + 18);
    expect(win.position.y).toBeCloseTo(54);
    const project = { unit: 'in', objects: parts.map((p, i) => ({ ...p, id: String(i) })) } as unknown as FurnitureProject;
    expect(generateCutList(project)).toHaveLength(0);
  });
});
