import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { FurnitureObject } from '../types/furniture';
import { faceCenterWorld, faceNormalWorld, pushPull, rayAxisParam } from './pushPull';
import { boxCorners } from '../state/groupTree';
import {
  MIN_FORESHORTEN, axisTravel, pastSlop, quatOf, ringDragAngle, ringRotation, rotateLocal, screenAxis, startRingDrag, toClient, worldPerPx, type Viewport,
} from './handleDrag';

const vp: Viewport = { left: 0, top: 0, width: 390, height: 700 };
const cam = (pos: [number, number, number], look: [number, number, number] = [0, 30, 0]) => {
  const c = new THREE.PerspectiveCamera(45, vp.width / vp.height, 1, 5000);
  c.position.set(...pos);
  c.lookAt(...look);
  c.updateMatrixWorld();
  c.updateProjectionMatrix();
  return c;
};
const rayAt = (c: THREE.Camera, p: { x: number; y: number }) => {
  const r = new THREE.Raycaster();
  r.setFromCamera(new THREE.Vector2((p.x / vp.width) * 2 - 1, -((p.y / vp.height) * 2 - 1)), c);
  return r.ray;
};
const mat = { id: 'oak', name: 'Oak', species: 'oak', baseColor: '#000', secondaryColor: '#000', grainIntensity: 0, grainScale: 1, roughness: 1, metalness: 0, varnishSheen: 'matte' } as FurnitureObject['material'];
// A bunk-bed post: 3.5" square, 60" tall, standing at the origin.
const post: FurnitureObject = { id: 'post', name: 'Post', shape: 'cube', dimensions: { length: 3.5, height: 60, width: 3.5 }, position: { x: 0, y: 30, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, material: mat };
const opts = { snap: true, step: 0.25, unit: 'in' as const, floorOn: true };

describe('resize drag mapping (face you look straight at)', () => {
  const c = cam([0, 30, 120]); // straight in front of the post's +z face
  const P = faceCenterWorld(post, '+z');
  const N = faceNormalWorld(post, '+z');
  const a = toClient(P, c, vp)!;
  const off = { x: a.x + 4, y: a.y + 4 }; // finger lands just off the face center

  it('old closest-point mapping blew a 10 px drag up into a huge size (the bug)', () => {
    const c = cam([3, 32, 120]); // almost straight on, like a real touch on the face
    const a = toClient(P, c, vp)!;
    const off = { x: a.x + 4, y: a.y + 4 };
    const t0 = rayAxisParam(rayAt(c, off).origin, rayAt(c, off).direction, P, N);
    const down = { x: off.x, y: off.y + 10 };
    const t1 = rayAxisParam(rayAt(c, down).origin, rayAt(c, down).direction, P, N);
    const grown = pushPull(post, '+z', t1 - t0, opts).dimensions.width;
    // 3.5" deep post: a 10 px nudge turned it into a ~3 ft slab.
    expect(grown).toBeGreaterThan(30);
  });

  it('new mapping: sideways drift does nothing, and 10 px up is a few inches at most', () => {
    const ax = screenAxis(P, N, c, vp);
    expect(ax.headOn).toBe(true);
    expect(axisTravel(ax, off, { x: off.x + 60, y: off.y })).toBeCloseTo(0, 9);
    const wpp = worldPerPx(P, c, vp);
    const up = axisTravel(ax, off, { x: off.x, y: off.y - 10 });
    expect(up).toBeGreaterThan(0);
    expect(up).toBeCloseTo(10 * wpp, 6);
    expect(pushPull(post, '+z', up, opts).dimensions.width).toBeLessThan(3.5 + 3);
  });

  it('is bounded from every camera angle: 10 px never moves a face more than 10 px / MIN_FORESHORTEN', () => {
    for (const pos of [[0, 30, 120], [5, 31, 120], [40, 200, 60], [0, 400, 0.5], [120, 30, 0], [-80, 10, -80]] as [number, number, number][]) {
      const cc = cam(pos);
      for (const f of ['+x', '-x', '+y', '-y', '+z', '-z'] as const) {
        const Pf = faceCenterWorld(post, f), Nf = faceNormalWorld(post, f);
        const ax = screenAxis(Pf, Nf, cc, vp);
        const wpp = worldPerPx(Pf, cc, vp);
        for (const [dx, dy] of [[10, 0], [0, 10], [-7, 7]]) {
          const t = Math.abs(axisTravel(ax, { x: 100, y: 100 }, { x: 100 + dx, y: 100 + dy }));
          expect(t).toBeLessThanOrEqual((Math.hypot(dx, dy) * wpp) / MIN_FORESHORTEN + 1e-6);
        }
      }
    }
  });

  it('a face seen at a slant tracks the finger', () => {
    const cc = cam([90, 60, 90]);
    const Pf = faceCenterWorld(post, '+x'), Nf = faceNormalWorld(post, '+x');
    const ax = screenAxis(Pf, Nf, cc, vp);
    expect(ax.headOn).toBe(false);
    const s = toClient(Pf, cc, vp)!, e = toClient(Pf.clone().addScaledVector(Nf, 5), cc, vp)!;
    expect(Math.abs(axisTravel(ax, s, e) - 5)).toBeLessThan(0.25);
  });

  it('a tap or a twitch is not a drag', () => {
    expect(pastSlop({ x: 0, y: 0 }, { x: 3, y: 3 })).toBe(false);
    expect(pastSlop({ x: 0, y: 0 }, { x: 6, y: 0 })).toBe(true);
  });
});

describe('rotate ring drag', () => {
  it('follows the finger around an open ring and unwraps past 180°', () => {
    const c = cam([0, 120, 1], [0, 0, 0]); // looking down on the Y ring
    const center = new THREE.Vector3(0, 0, 0), A = new THREE.Vector3(0, 1, 0);
    const R = 10;
    const at = (deg: number) => new THREE.Vector3(R * Math.cos((deg * Math.PI) / 180), 0, -R * Math.sin((deg * Math.PI) / 180));
    const d = startRingDrag(center, A, at(0), c, vp);
    expect(d.mode).toBe('plane');
    const start = toClient(at(0), c, vp)!;
    let angle = 0;
    for (let deg = 10; deg <= 270; deg += 10) {
      const p = toClient(at(deg), c, vp)!;
      angle = ringDragAngle(d, rayAt(c, p), start, p);
    }
    expect((angle * 180) / Math.PI).toBeCloseTo(270, 0);
  });

  it('edge-on ring: drag along its screen line, bounded, no flip', () => {
    const c = cam([0, 0, 120], [0, 0, 0]); // Y ring seen exactly edge-on
    const center = new THREE.Vector3(0, 0, 0), A = new THREE.Vector3(0, 1, 0);
    const d = startRingDrag(center, A, new THREE.Vector3(0, 0, 10), c, vp);
    expect(d.mode).toBe('line');
    const s = { x: 195, y: 350 };
    const a1 = ringDragAngle(d, null, s, { x: 205, y: 350 });
    const a2 = ringDragAngle(d, null, s, { x: 215, y: 350 });
    expect(Math.abs(a2)).toBeGreaterThan(Math.abs(a1));
    expect(Math.sign(a1)).toBe(Math.sign(a2));
    expect(Math.abs(a2)).toBeLessThan(Math.PI / 2);
  });
});

describe('rotation never touches size', () => {
  const worldAxes = (r: { x: number; y: number; z: number }) => {
    const q = quatOf(r);
    return ['x', 'y', 'z'].map((k) => new THREE.Vector3(k === 'x' ? 1 : 0, k === 'y' ? 1 : 0, k === 'z' ? 1 : 0).applyQuaternion(q));
  };

  it('ring result only has rotation keys', () => {
    const r = ringRotation({ x: 0, y: 0, z: 0 }, 'y', 37.4);
    expect(Object.keys(r).sort()).toEqual(['x', 'y', 'z']);
    expect(r).toEqual({ x: 0, y: 37, z: 0 });
    expect(ringRotation({ x: 0, y: 0, z: 0 }, 'y', 88.6)).toEqual({ x: 0, y: 90, z: 0 });
  });

  it('turns about the ring drawn on the part (its own axis), even when already turned', () => {
    const start = { x: 90, y: 0, z: 30 };
    const out = rotateLocal(start, 'x', 45);
    const [ax0] = worldAxes(start);
    const [ax1] = worldAxes(out);
    // Local X (the red ring's axis) stays put; the part spins about it.
    expect(ax1.distanceTo(ax0)).toBeLessThan(1e-4);
    const expected = quatOf(start).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 4));
    expect(Math.abs(quatOf(out).dot(expected))).toBeCloseTo(1, 6);
  });

  it('keeps the box the same shape (corner spread) for any turn', () => {
    const o = { ...post, rotation: { x: 0, y: 0, z: 0 } };
    const spread = (x: FurnitureObject) => {
      const cs = boxCorners(x);
      return Math.max(...cs.map((a) => Math.max(...cs.map((b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)))));
    };
    const before = spread(o);
    let r = o.rotation;
    for (const [ax, deg] of [['x', 33], ['y', 120], ['z', -47], ['x', 90], ['y', 10]] as const) {
      r = ringRotation(r, ax, deg);
      expect(spread({ ...o, rotation: r })).toBeCloseTo(before, 6);
    }
  });
});
