import * as THREE from 'three';

const Q = 1e-3;
const q = (n: number) => Math.round(n / Q);

/**
 * Outline segments for a mesh: only real feature edges (where the surface
 * turns by more than `thresholdDeg`). Unlike THREE.EdgesGeometry this copes
 * with CSG output, which is full of T-junctions: a triangle edge that meets
 * several smaller edges of its coplanar neighbour has no exact twin, so
 * EdgesGeometry treats it as an open border and draws every such diagonal.
 * Here each triangle edge is matched against any edge on the same line that
 * overlaps it; collinear pieces are merged so each outline is drawn once.
 * Returns flat [x0,y0,z0,x1,y1,z1, ...].
 */
export function featureEdges(geometry: THREE.BufferGeometry, thresholdDeg = 24): Float32Array {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const pos = g.getAttribute('position');
  const cos = Math.cos((thresholdDeg * Math.PI) / 180);
  type Seg = { t0: number; t1: number; tri: number };
  const lines = new Map<string, { d: THREE.Vector3; o: THREE.Vector3; segs: Seg[] }>();
  const normals: THREE.Vector3[] = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3();
  for (let i = 0, tri = 0; i + 2 < pos.count; i += 3, tri++) {
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
    const n = ab.subVectors(b, a).cross(ac.subVectors(c, a));
    const area = n.length();
    normals.push(area > 1e-12 ? n.clone().divideScalar(area) : new THREE.Vector3());
    if (area <= 1e-12) continue;
    for (const [p, r] of [[a, b], [b, c], [c, a]] as const) {
      const d = r.clone().sub(p);
      const L = d.length();
      if (L < 1e-6) continue;
      d.divideScalar(L);
      // Canonical direction so both windings of a line share a key.
      const lead = Math.abs(d.x) > 1e-6 ? d.x : Math.abs(d.y) > 1e-6 ? d.y : d.z;
      if (lead < 0) d.negate();
      const o = p.clone().addScaledVector(d, -p.dot(d));
      const key = `${q(d.x)},${q(d.y)},${q(d.z)}|${q(o.x)},${q(o.y)},${q(o.z)}`;
      let line = lines.get(key);
      if (!line) { line = { d, o, segs: [] }; lines.set(key, line); }
      const t0 = p.dot(d), t1 = r.dot(d);
      line.segs.push({ t0: Math.min(t0, t1), t1: Math.max(t0, t1), tri });
    }
  }
  const out: number[] = [];
  for (const { d, o, segs } of lines.values()) {
    const keep: [number, number][] = [];
    for (const s of segs) {
      const mid = (s.t0 + s.t1) / 2;
      const n = normals[s.tri];
      let neighbour = false, smooth = false;
      for (const t of segs) {
        if (t.tri === s.tri || mid < t.t0 - 1e-5 || mid > t.t1 + 1e-5) continue;
        neighbour = true;
        if (n.dot(normals[t.tri]) >= cos) { smooth = true; break; }
      }
      if (!neighbour || !smooth) keep.push([s.t0, s.t1]);
    }
    if (!keep.length) continue;
    keep.sort((x, y) => x[0] - y[0]);
    let [s0, s1] = keep[0];
    const emit = () => {
      const p = o.clone().addScaledVector(d, s0), r = o.clone().addScaledVector(d, s1);
      out.push(p.x, p.y, p.z, r.x, r.y, r.z);
    };
    for (let i = 1; i < keep.length; i++) {
      if (keep[i][0] <= s1 + 1e-5) s1 = Math.max(s1, keep[i][1]);
      else { emit(); [s0, s1] = keep[i]; }
    }
    emit();
  }
  return new Float32Array(out);
}
