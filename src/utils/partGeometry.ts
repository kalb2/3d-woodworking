import * as THREE from 'three';
import type { BoardOptions, Dimensions3D, ShapeType } from '../types/furniture';
import { positiveSize } from '../theme/partSurface';
import { createBoardGeometry, defaultBoardOptions } from './boardGeometry';

/**
 * How the viewport draws a part: unit spheres and cylinders, real inches for
 * everything else. Scale is separate so a drag does not rebuild the buffers.
 */
export function partDrawScale(shape: ShapeType, dimensions: Dimensions3D): [number, number, number] {
  const length = positiveSize(dimensions.length);
  const width = positiveSize(dimensions.width);
  const height = positiveSize(dimensions.height);
  if (shape === 'sphere') return [length / 2, height / 2, width / 2];
  if (shape === 'cylinder' || shape === 'pole') return [length / 2, height, width / 2];
  return [1, 1, 1];
}

/** The part mesh the editor shows, before holes, joinery, and grain UVs. */
export function createPartGeometry(shape: ShapeType, dimensions: Dimensions3D, board?: BoardOptions): THREE.BufferGeometry {
  const l = positiveSize(dimensions.length);
  const w = positiveSize(dimensions.width);
  const h = positiveSize(dimensions.height);

  switch (shape) {
    case 'cylinder':
    case 'pole':
      // Unit tube. Per-axis scale lives on the mesh so a drag does not rebuild buffers.
      return new THREE.CylinderGeometry(1, 1, 1, 32);
    case 'sphere':
      return new THREE.SphereGeometry(1, 32, 32);
    case 'bevel_top': {
      const shape2D = new THREE.Shape();
      const halfX = l / 2;
      const halfZ = w / 2;
      const radius = Math.min(1.0, Math.min(l, w) * 0.1);

      shape2D.moveTo(-halfX + radius, -halfZ);
      shape2D.lineTo(halfX - radius, -halfZ);
      shape2D.quadraticCurveTo(halfX, -halfZ, halfX, -halfZ + radius);
      shape2D.lineTo(halfX, halfZ - radius);
      shape2D.quadraticCurveTo(halfX, halfZ, halfX - radius, halfZ);
      shape2D.lineTo(-halfX + radius, halfZ);
      shape2D.quadraticCurveTo(-halfX, halfZ, -halfX, halfZ - radius);
      shape2D.lineTo(-halfX, -halfZ + radius);
      shape2D.quadraticCurveTo(-halfX, -halfZ, -halfX + radius, -halfZ);

      const geom = new THREE.ExtrudeGeometry(shape2D, {
        steps: 1,
        depth: h,
        bevelEnabled: true,
        bevelThickness: Math.min(0.3, h * 0.2),
        bevelSize: Math.min(0.3, h * 0.2),
        bevelSegments: 4,
      });
      geom.rotateX(Math.PI / 2);
      geom.center();
      return geom;
    }
    case 'wedge': {
      const geom = new THREE.BufferGeometry();
      const halfX = l / 2;
      const halfY = h / 2;
      const halfZ = w / 2;

      const vertices = new Float32Array([
        -halfX, -halfY, -halfZ, halfX, -halfY, -halfZ, halfX, -halfY, halfZ,
        -halfX, -halfY, -halfZ, halfX, -halfY, halfZ, -halfX, -halfY, halfZ,
        -halfX, -halfY, halfZ, halfX, -halfY, halfZ, halfX, halfY, halfZ,
        -halfX, -halfY, halfZ, halfX, halfY, halfZ, -halfX, halfY, halfZ,
        -halfX, -halfY, -halfZ, -halfX, halfY, halfZ, halfX, halfY, halfZ,
        -halfX, -halfY, -halfZ, halfX, halfY, halfZ, halfX, -halfY, -halfZ,
        -halfX, -halfY, -halfZ, -halfX, -halfY, halfZ, -halfX, halfY, halfZ,
        halfX, -halfY, -halfZ, halfX, halfY, halfZ, halfX, -halfY, halfZ,
      ]);

      geom.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
      geom.computeVertexNormals();
      return geom;
    }
    case 'cushion':
      return new THREE.BoxGeometry(l, h, w, 8, 8, 8);
    case 'board':
      return createBoardGeometry(dimensions, board ?? defaultBoardOptions());
    case 'group':
    case 'cube':
    default:
      return new THREE.BoxGeometry(l, h, w);
  }
}
