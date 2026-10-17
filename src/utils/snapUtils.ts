import * as THREE from 'three';
import type { FurnitureObject, Position3D, SnapSettings } from '../types/furniture';
import { boxCorners } from '../state/groupTree';
import { alignmentHint, inferAlignments, type Alignment } from './snapInfer';

export function getBoundingBox(obj: FurnitureObject): THREE.Box3 {
  const halfX = obj.dimensions.length / 2;
  const halfY = obj.dimensions.height / 2;
  const halfZ = obj.dimensions.width / 2;

  const min = new THREE.Vector3(
    obj.position.x - halfX,
    obj.position.y - halfY,
    obj.position.z - halfZ
  );

  const max = new THREE.Vector3(
    obj.position.x + halfX,
    obj.position.y + halfY,
    obj.position.z + halfZ
  );

  return new THREE.Box3(min, max);
}

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

export function calculateSnappedPosition(
  activeObj: FurnitureObject,
  rawPosition: Position3D,
  otherObjects: FurnitureObject[],
  snapSettings: SnapSettings
): SnapResult {
  let pos = { ...rawPosition };
  let isSnapped = false;
  let snapFace: SnapResult['snapFace'] = undefined;
  const found: Partial<Record<'x' | 'y' | 'z', SnapContact>> = {};

  if (snapSettings.floorCollision) {
    const minY = activeObj.dimensions.height / 2;
    if (pos.y < minY) {
      pos.y = minY;
      isSnapped = true;
      snapFace = 'floor';
    }
  }

  if (!snapSettings.enabled) {
    return { position: pos, isSnapped, snapFace, contacts: [] };
  }

  if (snapSettings.faceSnap && otherObjects.length > 0) {
    const activeHalfX = activeObj.dimensions.length / 2;
    const activeHalfY = activeObj.dimensions.height / 2;
    const activeHalfZ = activeObj.dimensions.width / 2;

    const snapDistanceThreshold = SNAP_DIST;

    for (const other of otherObjects) {
      if (other.id === activeObj.id || other.visible === false) continue;
      const r = other.rotation;
      if (isScan(other) || (!near0(r.y) && near0(r.x) && near0(r.z))) {
        if (!near0(r.x) || !near0(r.z)) continue;
        const next = snapToTurned(activeObj, pos, other, found);
        if (next) {
          pos = next;
          isSnapped = true;
          snapFace = 'front';
        }
        continue;
      }

      const otherBox = getBoundingBox(other);
      // Only faces the mover is actually beside (overlapping on the other two axes) pull it.
      const beside = (a: 'x' | 'y' | 'z') => {
        const h = a === 'x' ? activeHalfX : a === 'y' ? activeHalfY : activeHalfZ;
        return pos[a] + h > otherBox.min[a] - snapDistanceThreshold && pos[a] - h < otherBox.max[a] + snapDistanceThreshold;
      };
      const canX = beside('y') && beside('z'), canY = beside('x') && beside('z'), canZ = beside('x') && beside('y');

      if (canY && Math.abs((pos.y - activeHalfY) - otherBox.max.y) < snapDistanceThreshold) {
        pos.y = otherBox.max.y + activeHalfY;
        found.y = { targetId: other.id, axis: 'y', side: 'max', value: otherBox.max.y };
        isSnapped = true;
        snapFace = 'bottom';
      }
      else if (canY && Math.abs((pos.y + activeHalfY) - otherBox.min.y) < snapDistanceThreshold) {
        pos.y = otherBox.min.y - activeHalfY;
        found.y = { targetId: other.id, axis: 'y', side: 'min', value: otherBox.min.y };
        isSnapped = true;
        snapFace = 'top';
      }

      if (canX && Math.abs((pos.x - activeHalfX) - otherBox.max.x) < snapDistanceThreshold) {
        pos.x = otherBox.max.x + activeHalfX;
        found.x = { targetId: other.id, axis: 'x', side: 'max', value: otherBox.max.x };
        isSnapped = true;
        snapFace = 'left';
      } else if (canX && Math.abs((pos.x + activeHalfX) - otherBox.min.x) < snapDistanceThreshold) {
        pos.x = otherBox.min.x - activeHalfX;
        found.x = { targetId: other.id, axis: 'x', side: 'min', value: otherBox.min.x };
        isSnapped = true;
        snapFace = 'right';
      }

      if (canZ && Math.abs((pos.z - activeHalfZ) - otherBox.max.z) < snapDistanceThreshold) {
        pos.z = otherBox.max.z + activeHalfZ;
        found.z = { targetId: other.id, axis: 'z', side: 'max', value: otherBox.max.z };
        isSnapped = true;
        snapFace = 'back';
      } else if (canZ && Math.abs((pos.z + activeHalfZ) - otherBox.min.z) < snapDistanceThreshold) {
        pos.z = otherBox.min.z - activeHalfZ;
        found.z = { targetId: other.id, axis: 'z', side: 'min', value: otherBox.min.z };
        isSnapped = true;
        snapFace = 'front';
      }
    }
  }

  const contacts = Object.values(found) as SnapContact[];

  // Smart inference on axes without a face contact: Flush / Centered / Inset.
  let alignments: Alignment[] = [];
  if (snapSettings.faceSnap && otherObjects.length > 0) {
    const inf = inferAlignments(activeObj, pos, otherObjects.filter((o) => !isScan(o)), found);
    const hy = activeObj.dimensions.height / 2;
    if (snapSettings.floorCollision && inf.position.y - hy < -1e-6) {
      inf.position.y = pos.y;
      inf.alignments = inf.alignments.filter((a) => a.axis !== 'y');
    }
    if (inf.alignments.length) {
      pos = inf.position;
      alignments = inf.alignments;
      isSnapped = true;
    }
  }
  const againstWall = contacts.some((c) => otherObjects.find((o) => o.id === c.targetId && isScan(o)));
  const hint = alignmentHint(alignments, againstWall);

  if (snapSettings.gridSnap && !isSnapped && snapSettings.gridSize > 0) {
    const step = snapSettings.gridSize;
    pos.x = Math.round(pos.x / step) * step;
    pos.z = Math.round(pos.z / step) * step;
    isSnapped = true;
    snapFace = 'grid';
  }

  return { position: pos, isSnapped, snapFace, contacts, alignments, hint };
}
