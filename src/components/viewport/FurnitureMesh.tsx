import React, { useMemo } from 'react';
import * as THREE from 'three';
import type { FurnitureObject } from '../../types/furniture';
import { createWoodMeshMaterial } from '../../utils/woodTextureGenerator';
import { SelectionOutline } from './gizmoLook';

interface FurnitureMeshProps {
  object: FurnitureObject;
  isSelected: boolean;
  onPointerDown?: (e: any) => void;
}

export const FurnitureMesh: React.FC<FurnitureMeshProps> = ({
  object,
  isSelected,
  onPointerDown
}) => {
  const { shape, dimensions, position, rotation, material } = object;

  const meshMaterial = useMemo(() => {
    return createWoodMeshMaterial(material);
  }, [material]);

  const geometry = useMemo(() => {
    const { length: l, width: w, height: h } = dimensions;

    switch (shape) {
      case 'cylinder':
      case 'pole': {
        const radius = Math.min(l, w) / 2;
        return new THREE.CylinderGeometry(radius, radius, h, 32);
      }
      case 'sphere': {
        const radius = Math.min(l, w, h) / 2;
        return new THREE.SphereGeometry(radius, 32, 32);
      }
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

        const extrudeSettings = {
          steps: 1,
          depth: h,
          bevelEnabled: true,
          bevelThickness: Math.min(0.3, h * 0.2),
          bevelSize: Math.min(0.3, h * 0.2),
          bevelSegments: 4
        };

        const geom = new THREE.ExtrudeGeometry(shape2D, extrudeSettings);
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
          -halfX, -halfY, -halfZ,   halfX, -halfY, -halfZ,   halfX, -halfY, halfZ,
          -halfX, -halfY, -halfZ,   halfX, -halfY, halfZ,   -halfX, -halfY, halfZ,
          -halfX, -halfY, halfZ,    halfX, -halfY, halfZ,    halfX, halfY, halfZ,
          -halfX, -halfY, halfZ,    halfX, halfY, halfZ,    -halfX, halfY, halfZ,
          -halfX, -halfY, -halfZ,  -halfX, halfY, halfZ,     halfX, halfY, halfZ,
          -halfX, -halfY, -halfZ,   halfX, halfY, halfZ,     halfX, -halfY, -halfZ,
          -halfX, -halfY, -halfZ,  -halfX, -halfY, halfZ,   -halfX, halfY, halfZ,
           halfX, -halfY, -halfZ,   halfX, halfY, halfZ,     halfX, -halfY, halfZ
        ]);

        geom.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        geom.computeVertexNormals();
        return geom;
      }
      case 'cushion': {
        return new THREE.BoxGeometry(l, h, w, 8, 8, 8);
      }
      case 'cube':
      default:
        return new THREE.BoxGeometry(l, h, w);
    }
  }, [shape, dimensions.length, dimensions.width, dimensions.height]);

  const rotRadX = (rotation.x * Math.PI) / 180;
  const rotRadY = (rotation.y * Math.PI) / 180;
  const rotRadZ = (rotation.z * Math.PI) / 180;

  return (
    <group position={[position.x, position.y, position.z]} rotation={[rotRadX, rotRadY, rotRadZ]}>
      <mesh
        geometry={geometry}
        material={meshMaterial}
        castShadow
        receiveShadow
        onPointerDown={onPointerDown}
      />

      {isSelected && (
        <SelectionOutline
          length={dimensions.length}
          height={dimensions.height}
          width={dimensions.width}
        />
      )}
    </group>
  );
};
