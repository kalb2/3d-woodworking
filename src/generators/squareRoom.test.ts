import { describe, expect, it } from 'vitest';
import type { RoomWall } from '../types/furniture';
import { squareUpRoom } from './squareRoom';
import { wallFrame } from './roomScan';

const deg = Math.PI / 180;
/** Wall from its left end to its right end (interior on the left-hand normal per wallFrame). */
function wall(id: string, l: [number, number], r: [number, number], openings: RoomWall['openings'] = []): RoomWall {
  const dx = r[0] - l[0], dz = r[1] - l[1];
  const width = Math.hypot(dx, dz);
  const yaw = Math.atan2(-dz, dx) / deg;
  return { id, label: id, width, height: 96, x: (l[0] + r[0]) / 2, z: (l[1] + r[1]) / 2, yaw, openings };
}
const rot = ([x, z]: [number, number], a: number): [number, number] =>
  [x * Math.cos(a * deg) + z * Math.sin(a * deg), -x * Math.sin(a * deg) + z * Math.cos(a * deg)];
const ends = (w: RoomWall) => {
  const { along } = wallFrame(w.yaw);
  return { l: [w.x - along.x * w.width / 2, w.z - along.z * w.width / 2], r: [w.x + along.x * w.width / 2, w.z + along.z * w.width / 2] };
};
const mod90 = (y: number) => ((y % 90) + 90) % 90;
const near = (a: number[], b: number[], tol = 0.15) => Math.hypot(a[0] - b[0], a[1] - b[1]) < tol;

describe('squareUpRoom', () => {
  it('two perpendicular walls scanned at 37° come out on the grid and still meet', () => {
    const corner: [number, number] = [0, 0];
    const a = wall('A', rot([-144, 0], 37), rot(corner, 37), [{ id: 'w1', kind: 'window', width: 36, height: 40, offsetX: 50, bottom: 30 }]);
    const b = wall('B', rot(corner, 37), rot([0, 100], 37));
    const out = squareUpRoom({ walls: [a, b] });
    const [A, B] = out.walls;
    expect(mod90(A.yaw)).toBeCloseTo(0, 5);
    expect(mod90(B.yaw)).toBeCloseTo(0, 5);
    expect(Math.abs(Math.cos(A.yaw * deg))).toBeCloseTo(1, 5); // longest wall runs along X
    expect(near(ends(A).r, ends(B).l)).toBe(true);
    expect(A.width).toBeCloseTo(144, 0);
    expect(B.width).toBeCloseTo(100, 0);
    expect(A.openings[0].offsetX).toBeCloseTo(50, 0);
  });

  it('an 88° corner snaps to 90° and the walls stay joined', () => {
    const a = wall('A', [-120, 0], [0, 0]);
    const b = wall('B', [0, 0], rot([0, 96], -2)); // 2° off square
    const out = squareUpRoom({ walls: [a, b] });
    const [A, B] = out.walls;
    expect(Math.abs(Math.abs(A.yaw - B.yaw) % 180)).toBeCloseTo(90, 5);
    expect(near(ends(A).r, ends(B).l)).toBe(true);
  });

  it('a 45° wall is left at 45° (relative to the room) while its corner still meets', () => {
    const a = wall('A', [-120, 0], [0, 0]);
    const b = wall('B', [0, 0], rot([0, 96], 45));
    const out = squareUpRoom({ walls: [a, b] });
    const [A, B] = out.walls;
    expect(A.yaw).toBeCloseTo(0, 5);
    expect(mod90(B.yaw)).toBeCloseTo(45, 1);
    expect(near(ends(A).r, ends(B).l)).toBe(true);
  });

  it('a left end that moves shifts openings so they stay put in the room', () => {
    // B's left end is 3 in past the corner; after re-solving it starts at the corner.
    const a = wall('A', [-120, 0], [0, 0]);
    const b = wall('B', [0, -3], [0, 96].map((v, i) => (i ? v : 0.5)) as [number, number], [{ id: 'd', kind: 'door', width: 30, height: 80, offsetX: 20, bottom: 0 }]);
    const out = squareUpRoom({ walls: [a, b] });
    const B = out.walls[1];
    const before = -3 + (20 + 15) * 1; // door center z along B (B runs +z)
    const { along } = wallFrame(B.yaw);
    const center = ends(B).l[1] + along.z * (B.openings[0].offsetX + 15);
    expect(center).toBeCloseTo(before, 0);
  });
});
