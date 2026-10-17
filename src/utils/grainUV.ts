import * as THREE from 'three';

/** Inches of wood one texture tile covers (grain density stays the same on every part). */
export const GRAIN_TILE = 24;

/**
 * Planar UVs per face so the grain (texture u) runs along the part's longest
 * dimension. Faces that don't contain that axis (end grain) use their own
 * longer side. Works on any box-like geometry with normals. Returns a copy.
 */
export function grainUVs(geometry: THREE.BufferGeometry, size: { x: number; y: number; z: number }): THREE.BufferGeometry {
  const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  if (!g.attributes.normal) g.computeVertexNormals();
  const pos = g.attributes.position as THREE.BufferAttribute;
  const nrm = g.attributes.normal as THREE.BufferAttribute;
  const longest = (['x', 'y', 'z'] as const).reduce((a, b) => (size[b] > size[a] ? b : a));
  const idx = { x: 0, y: 1, z: 2 } as const;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const n = [Math.abs(nrm.getX(i)), Math.abs(nrm.getY(i)), Math.abs(nrm.getZ(i))];
    const normalAxis = n[0] >= n[1] && n[0] >= n[2] ? 'x' : n[1] >= n[2] ? 'y' : 'z';
    const plane = (['x', 'y', 'z'] as const).filter((a) => a !== normalAxis);
    const u = plane.includes(longest as never) ? longest : (size[plane[0]] >= size[plane[1]] ? plane[0] : plane[1]);
    const v = plane.find((a) => a !== u)!;
    const p = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    uv[i * 2] = p[idx[u]] / GRAIN_TILE;
    uv[i * 2 + 1] = p[idx[v]] / GRAIN_TILE;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
