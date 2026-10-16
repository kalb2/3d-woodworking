import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { FurnitureObject } from '../types/furniture';
import { faceFromNormal, faceCenterWorld, pushPull, rayAxisParam, setFaceSize } from './pushPull';
import { bottomOf } from './resizeRules';

const mat = { id: 'plywood', name: 'Plywood', species: 'plywood', baseColor: '#000', secondaryColor: '#000', grainIntensity: 0, grainScale: 1, roughness: 1, metalness: 0, varnishSheen: 'matte' } as FurnitureObject['material'];
const part = (extra: Partial<FurnitureObject> = {}): FurnitureObject => ({
  id: 'a', name: 'a', shape: 'board', dimensions: { length: 24, height: 0.75, width: 12 }, position: { x: 0, y: 10, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, material: mat, ...extra,
});
const opts = { snap: true, step: 0.25, unit: 'in' as const, floorOn: true };

describe('push/pull', () => {
  it('moves only the dragged face; the opposite face stays put; snaps to 1/4"', () => {
    const o = part();
    const before = faceCenterWorld(o, '-x').x;
    const r = pushPull(o, '+x', 6.1, opts);
    expect(r.dimensions.length).toBe(30);
    expect(r.position.x).toBe(3);
    expect(faceCenterWorld({ ...o, ...r }, '-x').x).toBeCloseTo(before, 6);
    const shrink = pushPull(o, '-x', -4.13, opts);
    expect(shrink.dimensions.length).toBe(19.75);
    expect(faceCenterWorld({ ...o, ...shrink }, '+x').x).toBeCloseTo(12, 6);
  });

  it('works on turned parts (face follows its own normal)', () => {
    const o = part({ rotation: { x: 0, y: 90, z: 0 } }); // local +x points to world -z
    const r = pushPull(o, '+x', 6, opts);
    expect(r.position.z).toBeCloseTo(-3, 6);
    expect(r.position.x).toBeCloseTo(0, 6);
  });

  it('never pushes below the floor, and never shrinks below the minimum', () => {
    const o = part({ position: { x: 0, y: 2, z: 0 }, dimensions: { length: 24, height: 4, width: 12 } }); // bottom at 0
    const down = pushPull(o, '-y', 10, opts);
    expect(bottomOf({ ...o, ...down })).toBeGreaterThanOrEqual(-1e-9);
    expect(down.dimensions.height).toBe(4);
    const lifted = part({ position: { x: 0, y: 5, z: 0 }, dimensions: { length: 24, height: 4, width: 12 } }); // bottom at 3
    const r = pushPull(lifted, '-y', 10, opts);
    expect(r.dimensions.height).toBe(7);
    expect(bottomOf({ ...lifted, ...r })).toBeCloseTo(0, 6);
    expect(pushPull(o, '+x', -100, opts).dimensions.length).toBe(0.25);
  });

  it('typed exact size keeps the opposite face fixed', () => {
    const r = setFaceSize(part(), '+z', 15.5, true);
    expect(r.dimensions.width).toBe(15.5);
    expect(r.position.z).toBeCloseTo(1.75, 6);
  });

  it('face from a hit normal; drag distance along the normal from a ray', () => {
    expect(faceFromNormal({ x: 0, y: -0.9, z: 0.1 })).toBe('-y');
    expect(faceFromNormal({ x: 1, y: 0, z: 0 })).toBe('+x');
    // Ray straight down at x = 7 crosses the x axis line at t = 7.
    const t = rayAxisParam(new THREE.Vector3(7, 50, 0), new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0));
    expect(t).toBeCloseTo(7, 6);
  });
});
