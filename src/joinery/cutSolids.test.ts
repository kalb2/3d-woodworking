import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { cutSolids } from '../utils/holes';

const volume = (g: THREE.BufferGeometry) => {
  const p = (g.index ? g.toNonIndexed() : g).getAttribute('position');
  let v = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    v += a.dot(b.clone().cross(c)) / 6;
  }
  return Math.abs(v);
};

describe('joinery CSG', () => {
  it('a dado removes width × depth × length from the panel', () => {
    const panel = new THREE.BoxGeometry(0.75, 30, 12);
    const out = cutSolids(panel, [{ kind: 'box', center: [0.4, -2.625, 0], size: [0.55, 0.75, 13] }]);
    // Groove inside the panel: 0.25 deep (0.125..0.375) × 0.75 × 12.
    expect(volume(panel) - volume(out)).toBeCloseTo(0.25 * 0.75 * 12, 2);
  });

  it('a round hole cuts a cylinder', () => {
    const shelf = new THREE.BoxGeometry(24, 0.75, 12);
    const out = cutSolids(shelf, [{ kind: 'cyl', center: [0, -0.2, 0], axis: [0, 1, 0], radius: 0.1875, depth: 0.5 }]);
    expect(volume(shelf) - volume(out)).toBeGreaterThan(0.03);
  });
});
