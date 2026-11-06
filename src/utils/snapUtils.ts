import * as THREE from 'three';
import type { FurnitureObject, Position3D, SnapSettings } from '../types/furniture';
import { boxCorners, objectBox } from '../state/groupTree';
import { inferAlignments, insetLabel, type Alignment } from './snapInfer';

/** World AABB of a part, accounting for its rotation (a stood-up panel is tall, not 3/4"). */
export function getBoundingBox(obj: FurnitureObject): THREE.Box3 {
  const b = objectBox(obj);
  return new THREE.Box3(new THREE.Vector3(b.min.x, b.min.y, b.min.z), new THREE.Vector3(b.max.x, b.max.y, b.max.z));
}

/** Lowest world y of a part at `pos` (rotation and dimensions included). */
const bottomAt = (obj: FurnitureObject, pos: Position3D) => objectBox({ ...obj, position: pos }).min.y;

export interface SnapResult {
  position: Position3D;
  isSnapped: boolean;
  snapFace?: 'top' | 'bottom' | 'left' | 'right' | 'front' | 'back' | 'grid' | 'floor';
  /** Faces of other parts the moving part snapped against (for highlighting). */
  contacts: SnapContact[];
  /** Inferred edge / middle / inset alignments (dashed guides). */
  alignments?: Alignment[];
  /** Chip text near the finger: 'Flush', 'Centered', 'Inset 3/4"', 'Against wall'. */
  hint?: string | null;
}

/** The `side` face of `targetId`'s box on `axis` (plane at `value`); the mover touches it with its opposite face. */
export interface SnapContact {
  targetId: string;
  axis: 'x' | 'y' | 'z';
  side: 'min' | 'max';
  value: number;
  /** Set for turned targets (e.g. scanned walls): axis/value are in the target's own frame (yaw degrees about its center). */
  yaw?: number;
}

const SNAP_DIST = 1.2;
const isScan = (o: FurnitureObject) => o.generator === 'room-scan';
const near0 = (d: number) => Math.abs(((d % 360) + 360) % 360) < 1e-6 || Math.abs((((d % 360) + 360) % 360) - 360) < 1e-6;

/**
 * Snap against a target in its own (yaw-turned) frame: scanned walls and
 * openings, or any part turned about Y. Scanned targets only pull when the
 * mover actually overlaps them along the face (a wall is a big plane; it must
 * not grab parts across the room).
 */
function snapToTurned(
  mover: FurnitureObject,
  pos: Position3D,
  target: FurnitureObject,
  found: Partial<Record<'x' | 'y' | 'z', SnapContact>>,
): Position3D | null {
  const yaw = target.rotation.y;
  const t = (yaw * Math.PI) / 180;
  const c = Math.cos(t), sn = Math.sin(t);
  // world -> local: rotate by -yaw about Y (three.js: x' = x cos + z sin? use R^T of Ry)
  // Ry = [[c,0,s],[0,1,0],[-s,0,c]]; R^T = [[c,0,-s],[0,1,0],[s,0,c]]
  const toLocal = (x: number, y: number, z: number) => ({ x: c * x - sn * z, y, z: sn * x + c * z });
  const toWorld = (x: number, y: number, z: number) => ({ x: c * x + sn * z, y, z: -sn * x + c * z });
  const tp = target.position;
  const lc = toLocal(pos.x - tp.x, pos.y - tp.y, pos.z - tp.z);
  // Mover's half extents along the target's axes (works for any mover rotation).
  const corners = boxCorners({ ...mover, position: { x: 0, y: 0, z: 0 } }).map((k) => toLocal(k.x, k.y, k.z));
  const h = {
    x: Math.max(...corners.map((k) => Math.abs(k.x))),
    y: Math.max(...corners.map((k) => Math.abs(k.y))),
    z: Math.max(...corners.map((k) => Math.abs(k.z))),
  };
  const T = { x: target.dimensions.length / 2, y: target.dimensions.height / 2, z: target.dimensions.width / 2 };
  const gate = isScan(target);
  const overlaps = (a: 'x' | 'y' | 'z') => Math.abs(lc[a]) < T[a] + h[a] + SNAP_DIST;
  let hit = false;
  for (const a of ['y', 'x', 'z'] as const) {
    if (gate && !(['x', 'y', 'z'] as const).filter((b) => b !== a).every(overlaps)) continue;
    if (Math.abs(lc[a] - h[a] - T[a]) < SNAP_DIST) {
      lc[a] = T[a] + h[a];
      found[a] = { targetId: target.id, axis: a, side: 'max', value: T[a], yaw };
      hit = true;
    } else if (!(gate && a === 'y') && Math.abs(lc[a] + h[a] + T[a]) < SNAP_DIST) {
      // (never pull a part under a scanned wall/opening: that's below the floor or inside the wall)
      lc[a] = -T[a] - h[a];
      found[a] = { targetId: target.id, axis: a, side: 'min', value: -T[a], yaw };
      hit = true;
    }
  }
  if (!hit) return null;
  const w = toWorld(lc.x, lc.y, lc.z);
  return { x: w.x + tp.x, y: w.y + tp.y, z: w.z + tp.z };
}

/** Share of the smaller footprint (XZ) that two boxes overlap, 0..1. */
function footprintShare(a: THREE.Box3, b: THREE.Box3): number {
  const ox = Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x);
  const oz = Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z);
  if (ox <= 0 || oz <= 0) return 0;
  const area = (k: THREE.Box3) => (k.max.x - k.min.x) * (k.max.z - k.min.z);
  return (ox * oz) / Math.max(1e-9, Math.min(area(a), area(b)));
}
/** A part only climbs onto (or tucks under) another when it is mostly over it. */
export const STACK_SHARE = 0.5;

export interface SnapOptions {
  /** How the user is dragging. Horizontal drags never change height unless the part is mostly over another part's top. */
  dragAxis?: 'x' | 'y' | 'z' | 'xz';
}

/** Parts share a face only when they overlap by more than this on the face's two other axes. */
const SHARE_EPS = 0.01;
type Axis = 'x' | 'y' | 'z';
const FACE: Record<Axis, Record<'min' | 'max', NonNullable<SnapResult['snapFace']>>> = {
  x: { max: 'left', min: 'right' },
  y: { max: 'bottom', min: 'top' },
  z: { max: 'back', min: 'front' },
};

export function calculateSnappedPosition(
  activeObj: FurnitureObject,
  rawPosition: Position3D,
  otherObjects: FurnitureObject[],
  snapSettings: SnapSettings,
  opts: SnapOptions = {}
): SnapResult {
  const vertical = opts.dragAxis === 'y';
  const floorOn = Boolean(snapSettings.floorCollision);
  let pos = { ...rawPosition };
  let isSnapped = false;
  let snapFace: SnapResult['snapFace'] = undefined;
  const found: Partial<Record<Axis, SnapContact>> = {};

  // Floor: the part's real lowest point (rotation included) never goes below y = 0.
  const liftToFloor = () => {
    if (!floorOn) return false;
    const b = bottomAt(activeObj, pos);
    if (b >= -1e-9) return false;
    pos = { ...pos, y: Math.round((pos.y - b) * 1e6) / 1e6 };
    return true;
  };
  if (liftToFloor()) {
    isSnapped = true;
    snapFace = 'floor';
  }

  if (!snapSettings.enabled) {
    return { position: pos, isSnapped, snapFace, contacts: [] };
  }

  // Mover half extents from its rotated box (a box's AABB is centered on its position).
  const own = objectBox({ ...activeObj, position: { x: 0, y: 0, z: 0 } });
  const half = { x: (own.max.x - own.min.x) / 2, y: (own.max.y - own.min.y) / 2, z: (own.max.z - own.min.z) / 2 };

  // Face contacts (one face pair per target). `sidesOnly` re-checks side faces after levelling.
  const snapFaces = (sidesOnly: boolean) => {
    for (const other of otherObjects) {
      if (other.id === activeObj.id || other.visible === false) continue;
      const r = other.rotation;
      if (isScan(other) || (!near0(r.y) && near0(r.x) && near0(r.z))) {
        if (sidesOnly) continue;
        if (!near0(r.x) || !near0(r.z)) continue;
        const next = snapToTurned(activeObj, pos, other, found);
        if (next) {
          pos = next;
          isSnapped = true;
          snapFace = 'front';
        }
        continue;
      }

      const ob = objectBox(other);
      const overlap = (a: Axis) => Math.min(pos[a] + half[a], ob.max[a]) - Math.max(pos[a] - half[a], ob.min[a]);
      // Within snap reach on this axis (may still be a small gap).
      const beside = (a: Axis) => overlap(a) > -SNAP_DIST;
      // Really sharing area on this axis (not just meeting at an edge).
      const shares = (a: Axis) => overlap(a) > SHARE_EPS;
      // Side faces only pull a part that is level with the other part (not sitting on it or under it).
      const canX = shares('y') && beside('z');
      const canZ = shares('y') && beside('x');
      // Stacking: a vertical drag may rest on a top it is really over; a horizontal drag only
      // when the part is mostly over the other part's top. Two parts side by side never stack:
      // that pulled touching boards a board-thickness out of level.
      const moverBox = getBoundingBox({ ...activeObj, position: pos });
      const canY = vertical ? shares('x') && shares('z') : footprintShare(moverBox, getBoundingBox(other)) >= STACK_SHARE;

      // Two boxes can only touch on one face pair: take the nearest candidate face.
      let best: { a: Axis; side: 'min' | 'max'; d: number; to: number } | null = null;
      const consider = (a: Axis, ok: boolean) => {
        if (!ok) return;
        const toMax = ob.max[a] + half[a]; // mover's min face on the target's max face
        const toMin = ob.min[a] - half[a]; // mover's max face on the target's min face
        const cands: { side: 'min' | 'max'; to: number }[] = [{ side: 'max', to: toMax }, { side: 'min', to: toMin }];
        for (const c of cands) {
          const d = Math.abs(pos[a] - c.to);
          if (d >= SNAP_DIST) continue;
          // Never tuck a part under another if that would put it through the floor.
          if (floorOn && a === 'y' && c.side === 'min' && bottomAt(activeObj, { ...pos, y: c.to }) < -1e-6) continue;
          if (!best || d < best.d) best = { a, side: c.side, d, to: c.to };
        }
      };
      if (!sidesOnly) consider('y', canY);
      consider('x', canX);
      consider('z', canZ);
      if (!best) continue;
      const hit = best as { a: Axis; side: 'min' | 'max'; d: number; to: number };
      pos = { ...pos, [hit.a]: hit.to };
      found[hit.a] = { targetId: other.id, axis: hit.a, side: hit.side, value: ob[hit.side][hit.a] };
      isSnapped = true;
      snapFace = FACE[hit.a][hit.side];
    }
  };
  if (snapSettings.faceSnap && otherObjects.length > 0) snapFaces(false);

  // Smart inference on axes without a face contact: Flush / Centered / Inset.
  let alignments: Alignment[] = [];
  if (snapSettings.faceSnap && otherObjects.length > 0) {
    const contactIds = new Set(Object.values(found).filter((c) => c && c.yaw === undefined).map((c) => c!.targetId));
    // Parts within snap reach on every axis count as touching for levelling (a board an inch
    // above the one it butts is "touching" to the user, even before the faces overlap).
    const near = new Set(contactIds);
    const mb = objectBox({ ...activeObj, position: pos });
    for (const o of otherObjects) {
      if (o.id === activeObj.id || o.visible === false || o.shape === 'group' || isScan(o)) continue;
      const ob = objectBox(o);
      const gapOn = (a: Axis) => Math.max(0, mb.min[a] - ob.max[a], ob.min[a] - mb.max[a]);
      if ((['x', 'y', 'z'] as const).every((a) => gapOn(a) < SNAP_DIST)) near.add(o.id);
    }
    // Horizontal drags keep their height, except that a part touching another part's side may
    // level its top or bottom with that part (tops flush / bottoms flush).
    const sideContact = Boolean(found.x || found.z) && contactIds.size > 0;
    const freeY = vertical || Boolean(found.y);
    const locked = freeY || sideContact ? found : { ...found, y: true };
    const inf = inferAlignments(activeObj, pos, otherObjects.filter((o) => !isScan(o)), locked, {
      prefer: near,
      flushOnly: !freeY && sideContact ? { y: true } : undefined,
    });
    if (floorOn && bottomAt(activeObj, inf.position) < -1e-6) {
      inf.position.y = pos.y;
      inf.alignments = inf.alignments.filter((a) => a.axis !== 'y');
    }
    if (inf.alignments.length) {
      const movedY = Math.abs(inf.position.y - pos.y) > 1e-9;
      pos = inf.position;
      alignments = inf.alignments;
      isSnapped = true;
      // Levelled with a neighbour: now its side may really touch; report (and seat) that contact.
      if (movedY && !found.x && !found.z) snapFaces(true);
    }
  }

  // Floor again, after every snap: nothing above may leave the part below y = 0.
  if (liftToFloor()) {
    isSnapped = true;
    if (found.y?.side === 'min') delete found.y;
    alignments = alignments.filter((a) => a.axis !== 'y');
  }

  const contacts = Object.values(found) as SnapContact[];
  const againstWall = contacts.some((c) => otherObjects.find((o) => o.id === c.targetId && isScan(o)));
  const hint = describeSnap(activeObj, pos, contacts, alignments, otherObjects, againstWall);

  if (snapSettings.gridSnap && !isSnapped && snapSettings.gridSize > 0) {
    const step = snapSettings.gridSize;
    pos.x = Math.round(pos.x / step) * step;
    pos.z = Math.round(pos.z / step) * step;
    isSnapped = true;
    snapFace = 'grid';
  }

  return { position: pos, isSnapped, snapFace, contacts, alignments, hint };
}

const EPS = 1e-3;
/**
 * Chip text that names only what is really aligned, e.g. 'Ends touching · Tops flush'.
 * Touching comes from face contacts; 'Tops flush' only when the top faces are coplanar.
 */
export function describeSnap(
  mover: FurnitureObject, pos: Position3D, contacts: SnapContact[], alignments: Alignment[],
  others: FurnitureObject[], againstWall = false,
): string | null {
  const parts: string[] = [];
  const mb = getBoundingBox({ ...mover, position: pos });
  const size = { x: mb.max.x - mb.min.x, z: mb.max.z - mb.min.z };
  const partContacts = contacts.filter((c) => c.yaw === undefined);
  const side = partContacts.find((c) => c.axis !== 'y');
  const stack = partContacts.find((c) => c.axis === 'y');
  if (side) {
    const a = side.axis as 'x' | 'z', b = a === 'x' ? 'z' : 'x';
    parts.push(size[a] > size[b] * 1.5 ? 'Ends touching' : size[a] * 1.5 < size[b] ? 'Edges touching' : 'Sides touching');
  } else if (stack) {
    parts.push(stack.side === 'max' ? 'On top' : 'Underneath');
  }
  // Coplanar tops/bottoms with the part we touch (or the one we align to).
  const refId = side?.targetId ?? alignments[0]?.targetId;
  const ref = refId ? others.find((o) => o.id === refId) : undefined;
  if (ref && !stack) {
    const rb = getBoundingBox(ref);
    if (Math.abs(mb.max.y - rb.max.y) < EPS) parts.push('Tops flush');
    else if (Math.abs(mb.min.y - rb.min.y) < EPS && mb.min.y > EPS) parts.push('Bottoms flush');
  }
  const flat = alignments.filter((x) => x.axis !== 'y');
  const inset = flat.find((x) => x.kind === 'inset');
  if (inset) parts.push(insetLabel(inset.inset!));
  else if (flat.some((x) => x.kind === 'centered')) parts.push('Centered');
  else if (flat.some((x) => x.kind === 'flush')) parts.push(side ? 'Sides flush' : 'Flush');
  if (!parts.length) return againstWall ? 'Against wall' : null;
  return parts.slice(0, 2).join(' · ');
}
