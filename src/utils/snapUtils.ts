import * as THREE from 'three';
import type { FurnitureObject, Position3D, SnapSettings } from '../types/furniture';

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
}

/** The `side` face of `targetId`'s box on `axis` (plane at `value`); the mover touches it with its opposite face. */
export interface SnapContact { targetId: string; axis: 'x' | 'y' | 'z'; side: 'min' | 'max'; value: number }

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

    const snapDistanceThreshold = 1.2;

    for (const other of otherObjects) {
      if (other.id === activeObj.id || !other.visible) continue;

      const otherBox = getBoundingBox(other);

      if (Math.abs((pos.y - activeHalfY) - otherBox.max.y) < snapDistanceThreshold) {
        pos.y = otherBox.max.y + activeHalfY;
        found.y = { targetId: other.id, axis: 'y', side: 'max', value: otherBox.max.y };
        isSnapped = true;
        snapFace = 'bottom';
      }
      else if (Math.abs((pos.y + activeHalfY) - otherBox.min.y) < snapDistanceThreshold) {
        pos.y = otherBox.min.y - activeHalfY;
        found.y = { targetId: other.id, axis: 'y', side: 'min', value: otherBox.min.y };
        isSnapped = true;
        snapFace = 'top';
      }

      if (Math.abs((pos.x - activeHalfX) - otherBox.max.x) < snapDistanceThreshold) {
        pos.x = otherBox.max.x + activeHalfX;
        found.x = { targetId: other.id, axis: 'x', side: 'max', value: otherBox.max.x };
        isSnapped = true;
        snapFace = 'left';
      } else if (Math.abs((pos.x + activeHalfX) - otherBox.min.x) < snapDistanceThreshold) {
        pos.x = otherBox.min.x - activeHalfX;
        found.x = { targetId: other.id, axis: 'x', side: 'min', value: otherBox.min.x };
        isSnapped = true;
        snapFace = 'right';
      }

      if (Math.abs((pos.z - activeHalfZ) - otherBox.max.z) < snapDistanceThreshold) {
        pos.z = otherBox.max.z + activeHalfZ;
        found.z = { targetId: other.id, axis: 'z', side: 'max', value: otherBox.max.z };
        isSnapped = true;
        snapFace = 'back';
      } else if (Math.abs((pos.z + activeHalfZ) - otherBox.min.z) < snapDistanceThreshold) {
        pos.z = otherBox.min.z - activeHalfZ;
        found.z = { targetId: other.id, axis: 'z', side: 'min', value: otherBox.min.z };
        isSnapped = true;
        snapFace = 'front';
      }
    }
  }

  const contacts = Object.values(found) as SnapContact[];

  if (snapSettings.gridSnap && !isSnapped && snapSettings.gridSize > 0) {
    const step = snapSettings.gridSize;
    pos.x = Math.round(pos.x / step) * step;
    pos.z = Math.round(pos.z / step) * step;
    isSnapped = true;
    snapFace = 'grid';
  }

  return { position: pos, isSnapped, snapFace, contacts };
}
