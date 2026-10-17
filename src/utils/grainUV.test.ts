import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GRAIN_TILE, grainUVs } from './grainUV';

describe('grain follows the longest dimension', () => {
  it('a long board laid along z gets u = z on its broad faces', () => {
    const geo = grainUVs(new THREE.BoxGeometry(6, 0.75, 48), { x: 6, y: 0.75, z: 48 });
    const pos = geo.attributes.position, nrm = geo.attributes.normal, uv = geo.attributes.uv;
    let checked = 0;
    for (let i = 0; i < pos.count; i++) {
      if (Math.abs(nrm.getY(i)) > 0.9) { // top / bottom face
        expect(uv.getX(i)).toBeCloseTo(pos.getZ(i) / GRAIN_TILE, 6);
        expect(uv.getY(i)).toBeCloseTo(pos.getX(i) / GRAIN_TILE, 6);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
  it('end grain faces use their own longer side; density is per inch', () => {
    const geo = grainUVs(new THREE.BoxGeometry(48, 6, 0.75), { x: 48, y: 6, z: 0.75 });
    const pos = geo.attributes.position, nrm = geo.attributes.normal, uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      if (Math.abs(nrm.getX(i)) > 0.9) expect(uv.getX(i)).toBeCloseTo(pos.getY(i) / GRAIN_TILE, 6); // 6 > 0.75
      if (Math.abs(nrm.getZ(i)) > 0.9) expect(uv.getX(i)).toBeCloseTo(pos.getX(i) / GRAIN_TILE, 6);
    }
  });
});
