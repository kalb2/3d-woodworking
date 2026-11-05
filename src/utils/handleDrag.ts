import * as THREE from 'three';
import { cleanDegrees, simplestEuler } from './turn90';

/**
 * Finger → handle math shared by the Move, Resize and Rotate gizmos. Pure.
 *
 * Every drag is measured in screen pixels against a direction fixed at touch
 * down, so a small finger move is always a small, bounded change. The old
 * closest-point-on-axis mapping blew up when the dragged axis pointed at the
 * camera (e.g. grabbing the face you're looking at): 1/sin(angle) gain, and
 * sideways finger drift resized the part.
 */

export interface Viewport { left: number; top: number; width: number; height: number }
export interface Pt { x: number; y: number }

/** The canvas rect, in client px. */
export function viewportOf(el: Element): Viewport {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

/** Finger travel (px) before a drag starts changing anything: a tap or a twitch never edits. */
export const DRAG_SLOP_PX = 6;
/** An axis foreshortened below this share of its face-on screen length is "pointing at the camera". */
export const MIN_FORESHORTEN = 0.4;
/** Rings this close to edge-on (|axis · view|) spin by dragging along the ring's screen line instead of around it. */
export const RING_EDGE_ON = 0.3;

const _p = new THREE.Vector3();

/** World point → client px. Null when behind the camera. */
export function toClient(p: THREE.Vector3, camera: THREE.Camera, vp: Viewport): Pt | null {
  camera.updateMatrixWorld();
  _p.copy(p).applyMatrix4(camera.matrixWorldInverse);
  if (_p.z >= -1e-6 && (camera as THREE.PerspectiveCamera).isPerspectiveCamera) return null;
  _p.copy(p).project(camera);
  return { x: vp.left + ((_p.x + 1) / 2) * vp.width, y: vp.top + ((1 - _p.y) / 2) * vp.height };
}

/** World units per CSS px at a point (perspective camera; orthographic falls back to its frustum). */
export function worldPerPx(p: THREE.Vector3, camera: THREE.Camera, vp: Viewport): number {
  const pc = camera as THREE.PerspectiveCamera;
  if (pc.isPerspectiveCamera) {
    camera.updateMatrixWorld();
    const depth = Math.max(1e-3, -_p.copy(p).applyMatrix4(camera.matrixWorldInverse).z);
    return (2 * depth * Math.tan(((pc.fov || 45) * Math.PI) / 360)) / Math.max(1, vp.height);
  }
  const oc = camera as THREE.OrthographicCamera;
  return ((oc.top - oc.bottom) / (oc.zoom || 1)) / Math.max(1, vp.height);
}

/** Screen direction (unit, client px) and gain (world units per px) for dragging along a world axis. */
export interface ScreenAxis { dir: Pt; perPx: number; headOn: boolean }

/**
 * How a finger drag maps onto moving point P along unit axis N. Fixed at
 * touch down. An axis seen at a slant tracks the finger; one pointing at (or
 * away from) the camera falls back to "drag up = +N" at the face-on rate.
 */
export function screenAxis(P: THREE.Vector3, N: THREE.Vector3, camera: THREE.Camera, vp: Viewport): ScreenAxis {
  const wpp = worldPerPx(P, camera, vp);
  const step = Math.max(wpp * 20, 1e-3); // ~20 px of axis at face-on: stable under perspective
  const a = toClient(P, camera, vp);
  const b = toClient(P.clone().addScaledVector(N, step), camera, vp);
  const fallback: ScreenAxis = { dir: { x: 0, y: -1 }, perPx: wpp, headOn: true };
  if (!a || !b || !(wpp > 0)) return fallback;
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  const faceOn = step / wpp; // px that `step` would cover across the screen
  if (!(len >= MIN_FORESHORTEN * faceOn)) return fallback;
  return { dir: { x: dx / len, y: dy / len }, perPx: step / len, headOn: false };
}

/** Signed world distance along the axis for a finger at `cur` that went down at `start`. */
export function axisTravel(ax: ScreenAxis, start: Pt, cur: Pt): number {
  return ((cur.x - start.x) * ax.dir.x + (cur.y - start.y) * ax.dir.y) * ax.perPx;
}

/** True once the finger has moved far enough from where it went down to count as a drag. */
export function pastSlop(start: Pt, cur: Pt, slop = DRAG_SLOP_PX): boolean {
  return Math.hypot(cur.x - start.x, cur.y - start.y) >= slop;
}

/**
 * Rotate-ring drag, fixed at touch down. An open ring follows the finger around
 * it (angle on the ring's plane, unwrapped so it never jumps by 360°). A ring
 * seen nearly edge-on is a line on screen: dragging along that line spins it.
 */
export interface RingDrag {
  mode: 'plane' | 'line';
  center: THREE.Vector3;
  axis: THREE.Vector3;
  plane: THREE.Plane;
  ref: THREE.Vector3 | null;
  line: ScreenAxis | null;
  /** Running angle (radians) and the last raw plane angle, for unwrapping. */
  total: number;
  last: number;
}

export function startRingDrag(center: THREE.Vector3, axis: THREE.Vector3, grab: THREE.Vector3, camera: THREE.Camera, vp: Viewport): RingDrag {
  const A = axis.clone().normalize();
  const view = center.clone().sub(camera.position).normalize();
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(A, center);
  const ref = grab.clone().sub(center);
  ref.addScaledVector(A, -ref.dot(A));
  if (Math.abs(A.dot(view)) >= RING_EDGE_ON && ref.lengthSq() > 1e-8) {
    return { mode: 'plane', center: center.clone(), axis: A, plane, ref: ref.normalize(), line: null, total: 0, last: 0 };
  }
  // Edge-on: the front of the ring moves along view × axis for a positive turn.
  const along = view.clone().cross(A);
  if (along.lengthSq() < 1e-8) along.set(1, 0, 0);
  along.normalize();
  const r = Math.max(grab.distanceTo(center), 1e-3);
  const line = screenAxis(center.clone().addScaledVector(view, -r), along, camera, vp);
  // Gain: one ring radius of finger travel is one radian.
  return { mode: 'line', center: center.clone(), axis: A, plane, ref: null, line: { ...line, perPx: line.perPx / r }, total: 0, last: 0 };
}

/** Radians turned so far (positive = right-hand about the axis). Mutates the running total. */
export function ringDragAngle(d: RingDrag, ray: THREE.Ray | null, start: Pt, cur: Pt): number {
  if (d.mode === 'line') {
    d.total = axisTravel(d.line!, start, cur);
    return d.total;
  }
  if (!ray) return d.total;
  const hit = new THREE.Vector3();
  if (!ray.intersectPlane(d.plane, hit)) return d.total;
  const v = hit.sub(d.center);
  v.addScaledVector(d.axis, -v.dot(d.axis));
  if (v.lengthSq() < 1e-8) return d.total;
  v.normalize();
  const ref = d.ref!;
  const raw = Math.atan2(ref.clone().cross(v).dot(d.axis), THREE.MathUtils.clamp(ref.dot(v), -1, 1));
  let step = raw - d.last;
  if (step > Math.PI) step -= 2 * Math.PI;
  if (step < -Math.PI) step += 2 * Math.PI;
  d.last = raw;
  d.total += step;
  return d.total;
}

/* ---- rotation algebra (degrees, Euler XYZ like three.js) ---- */

export type Rot = { x: number; y: number; z: number };
type Ax = 'x' | 'y' | 'z';
const RAD = Math.PI / 180;
const AXIS: Record<Ax, THREE.Vector3> = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };

export const quatOf = (r: Rot) => new THREE.Quaternion().setFromEuler(new THREE.Euler(r.x * RAD, r.y * RAD, r.z * RAD, 'XYZ'));

/** Quaternion → tidy Euler degrees (float drift off, simplest equivalent triple). */
export function rotOf(q: THREE.Quaternion): Rot {
  const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
  const r4 = (n: number) => Math.round(n * 1e4) / 1e4;
  const s = simplestEuler(e.x / RAD, e.y / RAD, e.z / RAD);
  return { x: cleanDegrees(r4(s.x)), y: cleanDegrees(r4(s.y)), z: cleanDegrees(r4(s.z)) };
}

/**
 * Turn a part `deg` about its own (local) axis — the axis of the ring drawn on
 * it. When that is the same as bumping one Euler angle (axis z always; y when
 * z is 0; x when y and z are 0) the other two angles are left exactly as they
 * were, so typed angles and detents stay clean.
 */
export function rotateLocal(start: Rot, axis: Ax, deg: number): Rot {
  const simple = axis === 'z' || (axis === 'y' && !start.z) || (axis === 'x' && !start.y && !start.z);
  if (simple) return { ...start, [axis]: start[axis] + deg };
  return rotOf(quatOf(start).multiply(new THREE.Quaternion().setFromAxisAngle(AXIS[axis], deg * RAD)));
}

/** World rotation that takes orientation `from` to `to` (q_to · q_from⁻¹). Identity when equal. */
export function rotationDelta(from: Rot, to: Rot): THREE.Quaternion {
  return quatOf(to).multiply(quatOf(from).invert());
}

/* ---- rotate ring stops ---- */

/** Half-width of the catch on 0°, 45°, 90°, and the other 45° marks. */
const MAJOR_DETENT_DEGREES = 2;
/** Half-width of the catch on the older 5° stops (0, 5, 10, …, 50, …). */
const MINOR_DETENT_DEGREES = 1;

/**
 * Free rotation, rounded to a degree, with a light pull onto the old stops.
 * A drag inside either window lands on that stop. Anywhere else, including 47° or 52°, it stays put.
 * 50° is both a 5° stop and a place a drag can rest.
 */
export function rotateWithDetents(degrees: number): number {
  const major = Math.round(degrees / 45) * 45;
  if (Math.abs(degrees - major) < MAJOR_DETENT_DEGREES) return major;
  const minor = Math.round(degrees / 5) * 5;
  if (Math.abs(degrees - minor) < MINOR_DETENT_DEGREES) return minor;
  return Math.round(degrees);
}

/**
 * Rotation after dragging the `axis` ring by `angleDeg`: a turn about the
 * part's own axis (the ring drawn on it), with the stops above. Never touches size.
 */
export function ringRotation(start: { x: number; y: number; z: number }, axis: 'x' | 'y' | 'z', angleDeg: number) {
  const simple = axis === 'z' || (axis === 'y' && !start.z) || (axis === 'x' && !start.y && !start.z);
  const turn = simple ? rotateWithDetents(start[axis] + angleDeg) - start[axis] : rotateWithDetents(angleDeg);
  return rotateLocal(start, axis, turn);
}

