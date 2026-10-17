import * as THREE from 'three';
import type { Dimensions3D, FurnitureObject, LengthUnit, Position3D } from '../types/furniture';
import { bottomOf, snapSize } from './resizeRules';

export type Face = '+x' | '-x' | '+y' | '-y' | '+z' | '-z';
export const BOX_FACE_SHAPES = new Set(['cube', 'board', 'cushion']);

const DIM: Record<'x' | 'y' | 'z', keyof Dimensions3D> = { x: 'length', y: 'height', z: 'width' };
export const faceAxis = (f: Face) => f[1] as 'x' | 'y' | 'z';
export const faceSign = (f: Face) => (f[0] === '+' ? 1 : -1);
export const faceDim = (f: Face) => DIM[faceAxis(f)];

/** Face of a box from a local-space hit normal (largest component wins). */
export function faceFromNormal(n: { x: number; y: number; z: number }): Face {
  const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
  if (ax >= ay && ax >= az) return n.x >= 0 ? '+x' : '-x';
  if (ay >= az) return n.y >= 0 ? '+y' : '-y';
  return n.z >= 0 ? '+z' : '-z';
}

export function rotationMatrix(o: FurnitureObject): THREE.Matrix4 {
  const d = Math.PI / 180;
  return new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(o.rotation.x * d, o.rotation.y * d, o.rotation.z * d, 'XYZ'));
}

/** World-space outward normal of a face. */
export function faceNormalWorld(o: FurnitureObject, f: Face): THREE.Vector3 {
  const v = new THREE.Vector3();
  v[faceAxis(f)] = faceSign(f);
  return v.applyMatrix4(rotationMatrix(o)).normalize();
}

/** World center of a face. */
export function faceCenterWorld(o: FurnitureObject, f: Face): THREE.Vector3 {
  const half = o.dimensions[faceDim(f)] / 2;
  return faceNormalWorld(o, f).multiplyScalar(half).add(new THREE.Vector3(o.position.x, o.position.y, o.position.z));
}

/**
 * Parameter t of the point on the line P + t·N closest to a ray (how far the
 * finger has dragged along the face normal). 0 when the ray is parallel.
 */
export function rayAxisParam(rayO: THREE.Vector3, rayD: THREE.Vector3, P: THREE.Vector3, N: THREE.Vector3): number {
  const w0 = P.clone().sub(rayO);
  const a = N.dot(N), b = N.dot(rayD), c = rayD.dot(rayD), d = N.dot(w0), e = rayD.dot(w0);
  const den = a * c - b * b;
  if (Math.abs(den) < 1e-9) return 0;
  return (b * e - c * d) / den;
}

export interface PushPullOptions { snap: boolean; step: number; unit: LengthUnit; floorOn: boolean; min?: number }

/**
 * Push/pull one face by `delta` inches along its outward normal: that side
 * moves, the opposite face stays put. Snaps the resulting size to the step,
 * and with the floor on never pushes the part below y = 0. Pure.
 */
export function pushPull(o: FurnitureObject, f: Face, delta: number, opts: PushPullOptions): { dimensions: Dimensions3D; position: Position3D } {
  const key = faceDim(f);
  const start = o.dimensions[key];
  const min = opts.min ?? 0.25;
  const sizeFor = (dl: number) => {
    const raw = Math.max(min, start + dl);
    return opts.snap ? snapSize(raw, opts.step, opts.unit, min) : Math.round(raw * 10000) / 10000;
  };
  const build = (size: number) => {
    const actual = size - start;
    const shift = faceNormalWorld(o, f).multiplyScalar(actual / 2);
    const r4 = (n: number) => Math.round(n * 10000) / 10000;
    return {
      dimensions: { ...o.dimensions, [key]: size },
      position: { x: r4(o.position.x + shift.x), y: r4(o.position.y + shift.y), z: r4(o.position.z + shift.z) },
    };
  };
  let out = build(sizeFor(delta));
  if (opts.floorOn) {
    const floor = Math.min(0, bottomOf(o));
    const b = bottomOf({ ...o, ...out });
    if (b < floor - 1e-6) {
      // Bottom moves linearly with the size; find the largest size that stays on the floor.
      const b1 = bottomOf({ ...o, ...build(start + 1) });
      const b0 = bottomOf(o);
      const k = b1 - b0; // bottom change per inch of growth (negative here)
      let size = k < 0 ? start + (floor - b0) / k : start;
      if (opts.snap) {
        const s = opts.unit === 'mm' || opts.unit === 'cm' ? 1 / 25.4 : opts.step;
        size = Math.floor(size / s + 1e-9) * s;
      }
      out = build(Math.max(min, Math.min(size, out.dimensions[key])));
    }
  }
  return out;
}

/** Set a face's dimension to an exact size (typed), opposite face fixed. */
export function setFaceSize(o: FurnitureObject, f: Face, size: number, floorOn: boolean) {
  return pushPull(o, f, size - o.dimensions[faceDim(f)], { snap: false, step: 0.25, unit: 'in', floorOn });
}
