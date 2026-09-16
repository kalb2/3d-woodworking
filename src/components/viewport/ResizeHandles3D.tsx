import React, { useRef, useState, useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { FurnitureObject } from '../../types/furniture';
import { useProjectStore } from '../../state/useProjectStore';
import { GIZMO_AXIS } from '../../theme/gizmo';
import { GizmoScale, ResizeCube } from './gizmoLook';

interface ResizeHandles3DProps {
  object: FurnitureObject;
}

type HandleAxis = '+x' | '-x' | '+y' | '-y' | '+z' | '-z';

export const ResizeHandles3D: React.FC<ResizeHandles3DProps> = ({ object }) => {
  const { updateObject, pushHistoryState } = useProjectStore();
  const [activeAxis, setActiveAxis] = useState<HandleAxis | null>(null);
  const { camera, raycaster, gl, controls } = useThree() as any;

  const dragSessionRef = useRef<{
    axis: HandleAxis;
    startPoint: THREE.Vector3;
    startDimensions: { length: number; width: number; height: number };
    dragPlane: THREE.Plane;
    inverseRotationMatrix: THREE.Matrix4;
  } | null>(null);

  const { length, width, height } = object.dimensions;
  const { x, y, z } = object.position;
  const { x: rotX, y: rotY, z: rotZ } = object.rotation;

  const rotRadX = THREE.MathUtils.degToRad(rotX);
  const rotRadY = THREE.MathUtils.degToRad(rotY);
  const rotRadZ = THREE.MathUtils.degToRad(rotZ);

  const offset = 0.35;
  const worldAnchor: [number, number, number] = [x, y, z];

  const handles: { axis: HandleAxis; pos: [number, number, number]; color: string }[] = [
    { axis: '+x', pos: [length / 2 + offset, 0, 0], color: GIZMO_AXIS.x },
    { axis: '-x', pos: [-length / 2 - offset, 0, 0], color: GIZMO_AXIS.x },
    { axis: '+y', pos: [0, height / 2 + offset, 0], color: GIZMO_AXIS.y },
    { axis: '-y', pos: [0, -height / 2 - offset, 0], color: GIZMO_AXIS.y },
    { axis: '+z', pos: [0, 0, width / 2 + offset], color: GIZMO_AXIS.z },
    { axis: '-z', pos: [0, 0, -width / 2 - offset], color: GIZMO_AXIS.z }
  ];

  const handlePointerDown = (e: any, axis: HandleAxis) => {
    e.stopPropagation();
    (e.target as HTMLElement)?.setPointerCapture?.(e.pointerId);

    if (controls) {
      controls.enabled = false;
    }

    setActiveAxis(axis);

    const startPoint = e.point.clone();
    const cameraDir = new THREE.Vector3();
    camera.getWorldDirection(cameraDir);
    const dragPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(
      cameraDir.clone().negate(),
      startPoint
    );

    const rotationMatrix = new THREE.Matrix4().makeRotationFromEuler(
      new THREE.Euler(rotRadX, rotRadY, rotRadZ, 'XYZ')
    );
    const inverseRotationMatrix = rotationMatrix.clone().invert();

    dragSessionRef.current = {
      axis,
      startPoint,
      startDimensions: { ...object.dimensions },
      dragPlane,
      inverseRotationMatrix
    };
  };

  useEffect(() => {
    if (!activeAxis) return;

    const handleWindowPointerMove = (event: PointerEvent) => {
      const session = dragSessionRef.current;
      if (!session) return;

      const rect = gl.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );

      raycaster.setFromCamera(mouse, camera);

      const currentIntersection = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(session.dragPlane, currentIntersection)) {
        const worldDelta = currentIntersection.clone().sub(session.startPoint);
        const localDelta = worldDelta.clone().applyMatrix4(session.inverseRotationMatrix);

        const newDim = { ...session.startDimensions };
        const minSize = 0.5;

        if (session.axis === '+x') {
          newDim.length = Math.max(minSize, session.startDimensions.length + localDelta.x * 2);
        } else if (session.axis === '-x') {
          newDim.length = Math.max(minSize, session.startDimensions.length - localDelta.x * 2);
        } else if (session.axis === '+y') {
          newDim.height = Math.max(minSize, session.startDimensions.height + localDelta.y * 2);
        } else if (session.axis === '-y') {
          newDim.height = Math.max(minSize, session.startDimensions.height - localDelta.y * 2);
        } else if (session.axis === '+z') {
          newDim.width = Math.max(minSize, session.startDimensions.width + localDelta.z * 2);
        } else if (session.axis === '-z') {
          newDim.width = Math.max(minSize, session.startDimensions.width - localDelta.z * 2);
        }

        updateObject(object.id, { dimensions: newDim }, true);
      }
    };

    const handleWindowPointerUp = () => {
      if (dragSessionRef.current) {
        dragSessionRef.current = null;
        setActiveAxis(null);

        if (controls) {
          controls.enabled = true;
        }

        pushHistoryState();
      }
    };

    window.addEventListener('pointermove', handleWindowPointerMove);
    window.addEventListener('pointerup', handleWindowPointerUp);
    window.addEventListener('pointercancel', handleWindowPointerUp);

    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerUp);
      window.removeEventListener('pointercancel', handleWindowPointerUp);
      if (controls) {
        controls.enabled = true;
      }
    };
  }, [activeAxis, camera, gl, raycaster, controls, object.id, updateObject, pushHistoryState]);

  return (
    <group position={[x, y, z]} rotation={[rotRadX, rotRadY, rotRadZ]}>
      {handles.map(({ axis, pos, color }) => (
        <group key={axis} position={pos}>
          <GizmoScale anchor={worldAnchor}>
            <ResizeCube
              axis={axis}
              color={color}
              active={activeAxis === axis}
              onPointerDown={(e) => handlePointerDown(e, axis)}
            />
          </GizmoScale>
        </group>
      ))}
    </group>
  );
};
