import type { FurnitureObject, FurnitureProject } from '../types/furniture';
import { boxCorners } from '../state/groupTree';
import { isExportedPart } from '../utils/modelExport';

export type V3 = { x: number; y: number; z: number };
export type P2 = [number, number];
export type ViewName = 'front' | 'side' | 'top' | 'iso';

/** Parts that go on the plans: what the 3D export draws (no groups, hidden parts, or scanned room). */
export function planParts(project: Pick<FurnitureProject, 'objects'>): FurnitureObject[] {
  return project.objects.filter((o) => isExportedPart(o));
}

const BOXY = new Set(['board', 'cube', 'cushion', 'bevel_top', 'wedge', 'group']);
export const isBoxy = (o: FurnitureObject) => BOXY.has(o.shape);

function rot(o: FurnitureObject) {
  const r = Math.PI / 180;
  const [a, b, c] = [o.rotation.x * r, o.rotation.y * r, o.rotation.z * r];
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c);
  return [
    [cb * cc, -cb * sc, sb],
    [ca * sc + sa * sb * cc, ca * cc - sa * sb * sc, -sa * cb],
    [sa * sc - ca * sb * cc, sa * cc + ca * sb * sc, ca * cb],
  ];
}

/** A part-local point in world inches (Euler XYZ, like three.js). */
export function localToWorld(o: FurnitureObject, p: V3): V3 {
  const m = rot(o);
  return {
    x: o.position.x + m[0][0] * p.x + m[0][1] * p.y + m[0][2] * p.z,
    y: o.position.y + m[1][0] * p.x + m[1][1] * p.y + m[1][2] * p.z,
    z: o.position.z + m[2][0] * p.x + m[2][1] * p.y + m[2][2] * p.z,
  };
}

/** A part-local direction in world space. */
export function localDirToWorld(o: FurnitureObject, d: V3): V3 {
  const m = rot(o);
  return {
    x: m[0][0] * d.x + m[0][1] * d.y + m[0][2] * d.z,
    y: m[1][0] * d.x + m[1][1] * d.y + m[1][2] * d.z,
    z: m[2][0] * d.x + m[2][1] * d.y + m[2][2] * d.z,
  };
}

/** World points that outline a part's solid (box corners; rings for round parts). */
export function solidPoints(o: FurnitureObject): V3[] {
  if (isBoxy(o)) return boxCorners(o);
  const rx = o.dimensions.length / 2, rz = o.dimensions.width / 2, hy = o.dimensions.height / 2;
  const out: V3[] = [];
  const N = 24;
  if (o.shape === 'sphere') {
    for (let i = 0; i <= 8; i++) {
      const phi = (Math.PI * i) / 8;
      for (let k = 0; k < N; k++) {
        const th = (2 * Math.PI * k) / N;
        out.push(localToWorld(o, { x: rx * Math.sin(phi) * Math.cos(th), y: hy * Math.cos(phi), z: rz * Math.sin(phi) * Math.sin(th) }));
      }
    }
    return out;
  }
  for (const y of [-hy, hy]) for (let k = 0; k < N; k++) {
    const th = (2 * Math.PI * k) / N;
    out.push(localToWorld(o, { x: rx * Math.cos(th), y, z: rz * Math.sin(th) }));
  }
  return out;
}

const ISO_D = { x: 1 / Math.sqrt(3), y: 1 / Math.sqrt(3), z: 1 / Math.sqrt(3) };
const ISO_R = { x: Math.SQRT1_2, y: 0, z: -Math.SQRT1_2 };
const ISO_U = { x: -1 / Math.sqrt(6), y: 2 / Math.sqrt(6), z: -1 / Math.sqrt(6) };
const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;

/** Toward the viewer, per view (front: from +z, right side: from +x, top: from +y, iso: front-right-top). */
export const VIEW_DIR: Record<ViewName, V3> = {
  front: { x: 0, y: 0, z: 1 }, side: { x: 1, y: 0, z: 0 }, top: { x: 0, y: 1, z: 0 }, iso: ISO_D,
};

/** World → [screen right, screen up, depth toward the viewer], in inches. */
export function project(view: ViewName, p: V3): [number, number, number] {
  switch (view) {
    case 'front': return [p.x, p.y, p.z];
    case 'side': return [-p.z, p.y, p.x];
    case 'top': return [p.x, -p.z, p.y];
    default: return [dot(p, ISO_R), dot(p, ISO_U), dot(p, ISO_D)];
  }
}

/** Convex hull (counter-clockwise, Andrew's monotone chain). */
export function convexHull(points: P2[]): P2[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o: P2, a: P2, b: P2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: P2[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 1e-9) lower.pop();
    lower.push(p);
  }
  const upper: P2[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 1e-9) upper.pop();
    upper.push(p);
  }
  upper.pop(); lower.pop();
  return lower.concat(upper);
}

/** Strictly inside a convex CCW polygon, at least `eps` from every edge. */
export function insideConvex(poly: P2[], p: P2, eps = 0.02): boolean {
  if (poly.length < 3) return false;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ex = b[0] - a[0], ey = b[1] - a[1];
    const len = Math.hypot(ex, ey) || 1;
    if ((ex * (p[1] - a[1]) - ey * (p[0] - a[0])) / len <= eps) return false;
  }
  return true;
}

export interface Bounds2 { minX: number; minY: number; maxX: number; maxY: number }
export const boundsOf = (pts: P2[]): Bounds2 => pts.reduce((b, [x, y]) => ({
  minX: Math.min(b.minX, x), minY: Math.min(b.minY, y), maxX: Math.max(b.maxX, x), maxY: Math.max(b.maxY, y),
}), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });

/** Overall world box of the piece. */
export function pieceBox(parts: FurnitureObject[]) {
  const min = { x: Infinity, y: Infinity, z: Infinity }, max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const o of parts) for (const c of solidPoints(o)) {
    min.x = Math.min(min.x, c.x); min.y = Math.min(min.y, c.y); min.z = Math.min(min.z, c.z);
    max.x = Math.max(max.x, c.x); max.y = Math.max(max.y, c.y); max.z = Math.max(max.z, c.z);
  }
  if (!Number.isFinite(min.x)) return { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 }, size: { w: 0, h: 0, d: 0 } };
  return { min, max, size: { w: max.x - min.x, h: max.y - min.y, d: max.z - min.z } };
}

/** A run of an outline edge, visible or hidden behind a nearer part. */
export interface Stroke { a: P2; b: P2; hidden: boolean; partId: string }

export interface OrthoView {
  view: ViewName;
  /** Projected outline per part, nearest drawn last. */
  outlines: { id: string; hull: P2[] }[];
  strokes: Stroke[];
  bounds: Bounds2;
}

/**
 * An orthographic line drawing: each part's projected outline, split into
 * runs that are visible or hidden (inside the outline of a part nearer the
 * viewer). Hidden runs are drawn dashed. Parts are outlined by their convex
 * silhouette, so notches and holes don't show here (they're on the part pages).
 */
export function orthoView(parts: FurnitureObject[], view: ViewName, step = 0.25): OrthoView {
  const items = parts.map((o) => {
    const pts = solidPoints(o).map((p) => project(view, p));
    const hull = convexHull(pts.map(([x, y]) => [x, y] as P2));
    const near = Math.max(...pts.map((p) => p[2]));
    const mid = pts.reduce((n, p) => n + p[2], 0) / pts.length;
    return { id: o.id, hull, near, mid };
  }).filter((it) => it.hull.length >= 3);
  items.sort((a, b) => a.near - b.near || a.mid - b.mid);
  const strokes: Stroke[] = [];
  items.forEach((it, i) => {
    const front = items.slice(i + 1).filter((f) => f.near > it.near + 1e-3 || f.mid > it.mid + 1e-3);
    for (let e = 0; e < it.hull.length; e++) {
      const a = it.hull[e], b = it.hull[(e + 1) % it.hull.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.max(1, Math.ceil(len / step));
      let runStart = a, runHidden: boolean | null = null;
      for (let k = 0; k < n; k++) {
        const t0 = k / n, t1 = (k + 1) / n, tm = (t0 + t1) / 2;
        const m: P2 = [a[0] + (b[0] - a[0]) * tm, a[1] + (b[1] - a[1]) * tm];
        const hidden = front.some((f) => insideConvex(f.hull, m));
        const p0: P2 = [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0];
        if (runHidden === null) { runHidden = hidden; runStart = p0; }
        else if (hidden !== runHidden) { strokes.push({ a: runStart, b: p0, hidden: runHidden, partId: it.id }); runStart = p0; runHidden = hidden; }
      }
      strokes.push({ a: runStart, b, hidden: !!runHidden, partId: it.id });
    }
  });
  const all = items.flatMap((it) => it.hull);
  return { view, outlines: items.map(({ id, hull }) => ({ id, hull })), strokes, bounds: boundsOf(all) };
}

/** Horizontal (front view) parts' top and bottom heights, for the key height dimensions. */
export function levelLines(parts: FurnitureObject[], box: ReturnType<typeof pieceBox>): number[] {
  const ys = new Set<number>([box.min.y, box.max.y].map((v) => Math.round(v * 16) / 16));
  for (const o of parts) {
    const pts = solidPoints(o);
    const xs = pts.map((p) => p.x), yv = pts.map((p) => p.y);
    const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...yv) - Math.min(...yv);
    if (w >= box.size.w * 0.5 && h <= Math.min(2, w / 4)) {
      ys.add(Math.round(Math.min(...yv) * 16) / 16);
      ys.add(Math.round(Math.max(...yv) * 16) / 16);
    }
  }
  return [...ys].sort((a, b) => a - b);
}

/** Exploded placement: each part pushed away from the piece's center (thin outer panels a little more). */
export function explodeOffsets(parts: FurnitureObject[], k = 0.45, push = 0.12): Map<string, V3> {
  const box = pieceBox(parts);
  const c = { x: (box.min.x + box.max.x) / 2, y: (box.min.y + box.max.y) / 2, z: (box.min.z + box.max.z) / 2 };
  const big = Math.max(box.size.w, box.size.h, box.size.d, 1);
  const out = new Map<string, V3>();
  for (const o of parts) {
    const pts = solidPoints(o);
    const lo = { x: Math.min(...pts.map((p) => p.x)), y: Math.min(...pts.map((p) => p.y)), z: Math.min(...pts.map((p) => p.z)) };
    const hi = { x: Math.max(...pts.map((p) => p.x)), y: Math.max(...pts.map((p) => p.y)), z: Math.max(...pts.map((p) => p.z)) };
    const pc = { x: (lo.x + hi.x) / 2, y: (lo.y + hi.y) / 2, z: (lo.z + hi.z) / 2 };
    const off = { x: (pc.x - c.x) * k, y: (pc.y - c.y) * k, z: (pc.z - c.z) * k };
    const ext = { x: hi.x - lo.x, y: hi.y - lo.y, z: hi.z - lo.z };
    const thin = (['x', 'y', 'z'] as const).reduce((a, b) => (ext[b] < ext[a] ? b : a));
    const sizeMax = Math.max(ext.x, ext.y, ext.z);
    if (ext[thin] <= sizeMax / 4) {
      const tol = 0.1;
      if (hi[thin] >= box.max[thin] - tol) off[thin] += push * big;
      // A back pulls well clear so the parts in front don't hide it.
      else if (lo[thin] <= box.min[thin] + tol) off[thin] -= push * big * (thin === 'z' ? 3 : 1);
    }
    out.set(o.id, off);
  }
  return out;
}

export interface IsoFace { pts: P2[]; shade: number }
export interface IsoPart { id: string; faces: IsoFace[]; center: P2; depth: number }

const FACES: Array<{ n: V3; idx: number[] }> = [
  // Corners from boxCorners: index = xi*4 + yi*2 + zi (xi,yi,zi ∈ {0,1} for -,+).
  { n: { x: 1, y: 0, z: 0 }, idx: [4, 5, 7, 6] },
  { n: { x: -1, y: 0, z: 0 }, idx: [0, 2, 3, 1] },
  { n: { x: 0, y: 1, z: 0 }, idx: [2, 6, 7, 3] },
  { n: { x: 0, y: -1, z: 0 }, idx: [0, 1, 5, 4] },
  { n: { x: 0, y: 0, z: 1 }, idx: [1, 3, 7, 5] },
  { n: { x: 0, y: 0, z: -1 }, idx: [0, 4, 6, 2] },
];

/** Shade for a face facing world direction n (top lightest, right side darkest). */
function shadeFor(n: V3): number {
  if (n.y > 0.5) return 0.97;
  if (n.z > 0.5) return 1;
  if (n.x > 0.5) return 0.88;
  return 0.93;
}

/** Isometric faces of each part (exploded by `offsets`), farthest first. */
export function isoParts(parts: FurnitureObject[], offsets?: Map<string, V3>): IsoPart[] {
  const out: IsoPart[] = parts.map((o) => {
    const off = offsets?.get(o.id) ?? { x: 0, y: 0, z: 0 };
    const pts = solidPoints(o).map((p) => ({ x: p.x + off.x, y: p.y + off.y, z: p.z + off.z }));
    const proj = pts.map((p) => project('iso', p));
    const depth = proj.reduce((n, p) => n + p[2], 0) / proj.length;
    const center: P2 = [proj.reduce((n, p) => n + p[0], 0) / proj.length, proj.reduce((n, p) => n + p[1], 0) / proj.length];
    let faces: IsoFace[];
    if (isBoxy(o) && pts.length === 8) {
      faces = FACES.flatMap((f) => {
        const n = localDirToWorld(o, f.n);
        if (dot(n, ISO_D) <= 1e-6) return [];
        return [{ pts: f.idx.map((i) => [proj[i][0], proj[i][1]] as P2), shade: shadeFor(n) }];
      });
    } else {
      faces = [{ pts: convexHull(proj.map(([x, y]) => [x, y] as P2)), shade: 0.93 }];
    }
    return { id: o.id, faces, center, depth };
  });
  return out.sort((a, b) => a.depth - b.depth);
}
