import React, { useMemo } from 'react';
import * as THREE from 'three';
import { Edges } from '@react-three/drei';
import type { FurnitureObject } from '../../types/furniture';
import { createWoodMeshMaterial } from '../../utils/woodTextureGenerator';
import { createBoardGeometry, defaultBoardOptions } from '../../utils/boardGeometry';
import { SELECTION_COLOR } from '../../theme/canvasSelection';
import { GIZMO_OUTLINE_WIDTH } from '../../theme/gizmo';
import { SphereOutline } from './gizmoLook';
import { positiveSize } from '../../theme/partSurface';

interface FurnitureMeshProps {
  object: FurnitureObject;
  isSelected: boolean;
  /** Group volumes stay pickable until the group is opened for editing. */
  pickGroup?: boolean;
  onPointerDown?: (e: any) => void;
}

export const FurnitureMesh: React.FC<FurnitureMeshProps> = ({
  object,
  isSelected,
  pickGroup = true,
  onPointerDown
}) => {
  const { shape, dimensions, position, rotation, material } = object;
  const isGroup = shape === 'group';

  const meshMaterial = useMemo(() => {
    return createWoodMeshMaterial(material);
  }, [material]);

  const roundPart = shape === 'sphere' || shape === 'cylinder' || shape === 'pole';
  const length = positiveSize(dimensions.length);
  const width = positiveSize(dimensions.width);
  const height = positiveSize(dimensions.height);
  const meshScale: [number, number, number] = shape === 'sphere'
    ? [length / 2, height / 2, width / 2]
    : shape === 'cylinder' || shape === 'pole'
      ? [length / 2, height, width / 2]
      : [1, 1, 1];
  const geometry = useMemo(() => {
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
      case 'board':
        return createBoardGeometry(dimensions, object.board ?? defaultBoardOptions());
      case 'group':
      case 'cube':
      default:
        return new THREE.BoxGeometry(l, h, w);
    }
  }, [shape, roundPart, roundPart ? null : `${dimensions.length}|${dimensions.width}|${dimensions.height}`, object.board]);

  const groupOutline = useMemo(() => {
    if (shape !== 'group') return null;
    return new THREE.EdgesGeometry(
      new THREE.BoxGeometry(dimensions.length, dimensions.height, dimensions.width)
    );
  }, [shape, dimensions.length, dimensions.height, dimensions.width]);

  const rotRadX = (rotation.x * Math.PI) / 180;
  const rotRadY = (rotation.y * Math.PI) / 180;
  const rotRadZ = (rotation.z * Math.PI) / 180;

  if (object.visible === false) return null;

  return (
    <group position={[position.x, position.y, position.z]} rotation={[rotRadX, rotRadY, rotRadZ]}>
      <mesh
        geometry={geometry}
        scale={meshScale}
        material={isGroup ? undefined : meshMaterial}
        castShadow={!isGroup}
        receiveShadow={!isGroup}
        raycast={isGroup && !pickGroup ? () => undefined : undefined}
        onPointerDown={onPointerDown}
      >
        {isGroup && (
          <meshBasicMaterial colorWrite={false} depthWrite={false} toneMapped={false} />
        )}
        {isSelected && !isGroup && shape === 'sphere' && (
          <SphereOutline radius={1} />
        )}
        {isSelected && !isGroup && shape !== 'sphere' && (
          <Edges
            threshold={24}
            color={SELECTION_COLOR}
            lineWidth={GIZMO_OUTLINE_WIDTH}
            depthTest={false}
            toneMapped={false}
          />
        )}
      </mesh>
      {isGroup && isSelected && groupOutline && (
        <lineSegments geometry={groupOutline}>
          <lineBasicMaterial color={SELECTION_COLOR} depthTest={false} toneMapped={false} />
        </lineSegments>
      )}
    </group>
  );
};
