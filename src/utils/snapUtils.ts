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

  if (snapSettings.floorCollision) {
    const minY = activeObj.dimensions.height / 2;
    if (pos.y < minY) {
      pos.y = minY;
      isSnapped = true;
      snapFace = 'floor';
    }
  }

  if (!snapSettings.enabled) {
    return { position: pos, isSnapped, snapFace };
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
        isSnapped = true;
        snapFace = 'bottom';
      }
      else if (Math.abs((pos.y + activeHalfY) - otherBox.min.y) < snapDistanceThreshold) {
        pos.y = otherBox.min.y - activeHalfY;
        isSnapped = true;
        snapFace = 'top';
      }

      if (Math.abs((pos.x - activeHalfX) - otherBox.max.x) < snapDistanceThreshold) {
        pos.x = otherBox.max.x + activeHalfX;
        isSnapped = true;
        snapFace = 'left';
      } else if (Math.abs((pos.x + activeHalfX) - otherBox.min.x) < snapDistanceThreshold) {
        pos.x = otherBox.min.x - activeHalfX;
        isSnapped = true;
        snapFace = 'right';
      }

      if (Math.abs((pos.z - activeHalfZ) - otherBox.max.z) < snapDistanceThreshold) {
        pos.z = otherBox.max.z + activeHalfZ;
        isSnapped = true;
        snapFace = 'back';
      } else if (Math.abs((pos.z + activeHalfZ) - otherBox.min.z) < snapDistanceThreshold) {
        pos.z = otherBox.min.z - activeHalfZ;
        isSnapped = true;
        snapFace = 'front';
      }
    }
  }

  if (snapSettings.gridSnap && !isSnapped && snapSettings.gridSize > 0) {
    const step = snapSettings.gridSize;
    pos.x = Math.round(pos.x / step) * step;
    pos.z = Math.round(pos.z / step) * step;
    isSnapped = true;
    snapFace = 'grid';
  }

  return { position: pos, isSnapped, snapFace };
}
