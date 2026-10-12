import React, { useRef, useState, useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { FurnitureObject } from '../../types/furniture';
import { useProjectStore } from '../../state/useProjectStore';
import { GIZMO_AXIS } from '../../theme/gizmo';
import { gripAnchor, meshExtents } from '../../theme/partSurface';
import { FacePad, GizmoDepthClear } from './gizmoLook';
import { DEFAULT_RESIZE_STEP, snapSize } from '../../utils/resizeRules';

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

  const { x, y, z } = object.position;
  const { x: rotX, y: rotY, z: rotZ } = object.rotation;

  const rotRadX = THREE.MathUtils.degToRad(rotX);
  const rotRadY = THREE.MathUtils.degToRad(rotY);
  const rotRadZ = THREE.MathUtils.degToRad(rotZ);

  const extents = meshExtents(object.shape, object.dimensions);
  const handles: { axis: HandleAxis; pos: [number, number, number]; color: string }[] = [
    { axis: '+x', pos: gripAnchor('+x', extents), color: GIZMO_AXIS.x },
    { axis: '-x', pos: gripAnchor('-x', extents), color: GIZMO_AXIS.x },
    { axis: '+y', pos: gripAnchor('+y', extents), color: GIZMO_AXIS.y },
    { axis: '-y', pos: gripAnchor('-y', extents), color: GIZMO_AXIS.y },
    { axis: '+z', pos: gripAnchor('+z', extents), color: GIZMO_AXIS.z },
    { axis: '-z', pos: gripAnchor('-z', extents), color: GIZMO_AXIS.z },
  ];

  // Smaller side of the face each pad sits on (caps the pad on small parts).
  const faceSizeFor = (axis: HandleAxis) => {
    const L = extents.hx * 2, H = extents.hy * 2, W = extents.hz * 2;
    if (axis[1] === 'x') return Math.min(H, W);
    if (axis[1] === 'y') return Math.min(L, W);
    return Math.min(L, H);
  };

  const handlePointerDown = (e: any, axis: HandleAxis) => {
    if (!e.point || !Number.isFinite(e.point.x) || !Number.isFinite(e.point.y) || !Number.isFinite(e.point.z)) return;
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
      if (rect.width < 1 || rect.height < 1) return;
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );

      raycaster.setFromCamera(mouse, camera);

      const currentIntersection = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(session.dragPlane, currentIntersection)) {
        const worldDelta = currentIntersection.clone().sub(session.startPoint);
        const localDelta = worldDelta.clone().applyMatrix4(session.inverseRotationMatrix);
        if (!Number.isFinite(localDelta.x) || !Number.isFinite(localDelta.y) || !Number.isFinite(localDelta.z)) return;

        const newDim = { ...session.startDimensions };
        const resized = (start: number, delta: number) => {
          const next = start + delta;
          return Number.isFinite(next) ? Math.max(0.5, next) : Math.max(0.5, start);
        };

        if (session.axis === '+x') newDim.length = resized(session.startDimensions.length, localDelta.x * 2);
        else if (session.axis === '-x') newDim.length = resized(session.startDimensions.length, -localDelta.x * 2);
        else if (session.axis === '+y') newDim.height = resized(session.startDimensions.height, localDelta.y * 2);
        else if (session.axis === '-y') newDim.height = resized(session.startDimensions.height, -localDelta.y * 2);
        else if (session.axis === '+z') newDim.width = resized(session.startDimensions.width, localDelta.z * 2);
        else if (session.axis === '-z') newDim.width = resized(session.startDimensions.width, -localDelta.z * 2);

        // Dragging snaps sizes to the project's step (¼" default); Magnet off = free.
        const st = useProjectStore.getState();
        const proj = st.projects.find((p) => p.id === st.activeProjectId);
        if (proj?.snapSettings.enabled !== false) {
          const step = proj?.snapSettings.resizeStep ?? DEFAULT_RESIZE_STEP;
          const unit = proj?.unit ?? 'in';
          newDim.length = snapSize(newDim.length, step, unit);
          newDim.width = snapSize(newDim.width, step, unit);
          newDim.height = snapSize(newDim.height, step, unit);
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

  if (object.shape === 'group') return null;

  return (
    <group position={[x, y, z]} rotation={[rotRadX, rotRadY, rotRadZ]}>
      <GizmoDepthClear />
      {handles.map(({ axis, pos, color }) => (
        <group key={axis} position={pos}>
            <FacePad
              axis={axis}
              color={color}
              faceSize={faceSizeFor(axis)}
              active={activeAxis === axis}
              onPointerDown={(e) => handlePointerDown(e, axis)}
            />
        </group>
      ))}
    </group>
  );
};
