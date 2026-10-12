import type { RoomWall, ScannedRoom } from '../types/furniture';

/** Walls within this many degrees of a right angle are snapped to it. */
export const SNAP_DEG = 5;
/** Wall ends closer than this (inches) count as a shared corner. */
const CORNER_TOL = 12;

const r1 = (n: number) => Math.round(n * 10) / 10;
const rad = (d: number) => (d * Math.PI) / 180;
type V = { x: number; z: number };
const along = (yaw: number): V => ({ x: Math.cos(rad(yaw)), z: -Math.sin(rad(yaw)) });
/** Yaw in (-180, 180]. */
const norm = (d: number) => { let y = ((d + 180) % 360 + 360) % 360 - 180; if (y <= -180) y += 360; return y; };
const ends = (w: { x: number; z: number; yaw: number; width: number }) => {
  const a = along(w.yaw), h = w.width / 2;
  return { l: { x: w.x - a.x * h, z: w.z - a.z * h }, r: { x: w.x + a.x * h, z: w.z + a.z * h } };
};
const dist = (a: V, b: V) => Math.hypot(a.x - b.x, a.z - b.z);

/** Intersection of two lines (point + direction), or null when parallel. */
function meet(p: V, d: V, q: V, e: V): V | null {
  const den = d.x * e.z - d.z * e.x;
  if (Math.abs(den) < 1e-6) return null;
  const t = ((q.x - p.x) * e.z - (q.z - p.z) * e.x) / den;
  return { x: p.x + d.x * t, z: p.z + d.z * t };
}

/**
 * Square up a scanned room:
 * 1. turn the whole room about the vertical so the longest wall runs along X;
 * 2. snap walls within ±SNAP_DEG of a multiple of 90° exactly onto it
 *    (truly angled walls keep their direction);
 * 3. re-solve shared corners so connected walls still meet. Openings keep
 *    their place on their wall (offsets follow a moved left end).
 * Pure; returns a new room.
 */
export function squareUpRoom(room: ScannedRoom): ScannedRoom {
  const src = room.walls;
  if (!src.length) return room;
  const longest = src.reduce((a, b) => (b.width > a.width ? b : a));
  // Smallest turn that puts the longest wall's run on X (yaw a multiple of 180°).
  const turn = -(longest.yaw - 180 * Math.round(longest.yaw / 180));
  const c = Math.cos(rad(turn)), s = Math.sin(rad(turn));
  const rotated = src.map((w) => ({ ...w, x: w.x * c + w.z * s, z: -w.x * s + w.z * c, yaw: norm(w.yaw + turn) }));

  // Corners from the scan (before snapping): which wall ends touch.
  type End = 'l' | 'r';
  const joints: { i: number; ei: End; j: number; ej: End }[] = [];
  const e0 = rotated.map(ends);
  for (let i = 0; i < rotated.length; i++) for (let j = i + 1; j < rotated.length; j++) {
    let best: { ei: End; ej: End; d: number } | null = null;
    for (const ei of ['l', 'r'] as End[]) for (const ej of ['l', 'r'] as End[]) {
      const d = dist(e0[i][ei], e0[j][ej]);
      if (d < CORNER_TOL && (!best || d < best.d)) best = { ei, ej, d };
    }
    if (best) joints.push({ i, ei: best.ei, j, ej: best.ej });
  }

  // Snap near-right angles, rotating each wall about its center.
  const snapped = rotated.map((w) => {
    const target = 90 * Math.round(w.yaw / 90);
    return Math.abs(w.yaw - target) <= SNAP_DEG ? { ...w, yaw: norm(target) } : w;
  });

  // Re-solve corners: move each joined end to where the two wall lines meet.
  const endPts = snapped.map(ends);
  for (const { i, ei, j, ej } of joints) {
    const p = meet(endPts[i][ei], along(snapped[i].yaw), endPts[j][ej], along(snapped[j].yaw));
    if (!p) continue;
    // Don't let a bad solve wreck a wall.
    if (dist(p, endPts[i][ei]) > CORNER_TOL * 2 || dist(p, endPts[j][ej]) > CORNER_TOL * 2) continue;
    endPts[i][ei] = p;
    endPts[j][ej] = p;
  }

  const walls: RoomWall[] = snapped.map((w, k) => {
    const { l, r } = endPts[k];
    const a = along(w.yaw);
    const orig = ends(w);
    // How far the left end slid along the wall: openings shift the other way.
    const shiftL = (l.x - orig.l.x) * a.x + (l.z - orig.l.z) * a.z;
    const width = Math.max(1, (r.x - l.x) * a.x + (r.z - l.z) * a.z);
    const mid = { x: (l.x + r.x) / 2, z: (l.z + r.z) / 2 };
    return {
      ...w,
      x: r1(mid.x),
      z: r1(mid.z),
      yaw: r1(w.yaw),
      width: r1(width),
      openings: w.openings.map((o) => ({ ...o, offsetX: r1(Math.min(Math.max(0, o.offsetX - shiftL), Math.max(0, width - o.width))) })),
    };
  });
  return { ...room, walls };
}
