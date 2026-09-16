import React, { useRef, useState, useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { FurnitureObject } from '../../types/furniture';
import { useProjectStore } from '../../state/useProjectStore';
import { calculateSnappedPosition } from '../../utils/snapUtils';
import { GIZMO_AXIS } from '../../theme/gizmo';
import { AxisArrow, GizmoScale, MoveHub, RotateArc, RotateHub } from './gizmoLook';

interface TouchGizmo3DProps {
  object: FurnitureObject;
}

type DragAxis = 'x' | 'y' | 'z' | 'xz' | null;

export const TouchGizmo3D: React.FC<TouchGizmo3DProps> = ({ object }) => {
  const {
    activeGizmoMode,
    updateObject,
    pushHistoryState,
    projects,
    activeProjectId
  } = useProjectStore();

  const { camera, raycaster, gl, controls } = useThree() as any;

  const [activeAxis, setActiveAxis] = useState<DragAxis>(null);

  const dragRef = useRef<{
    axis: DragAxis;
    startPoint: THREE.Vector3;
    startPosition: { x: number; y: number; z: number };
    startRotation: { x: number; y: number; z: number };
    dragPlane: THREE.Plane;
    objectCenter: THREE.Vector3;
  } | null>(null);

  const currentProject = projects.find(p => p.id === activeProjectId);
  const isMove = activeGizmoMode === 'move';

  const objPos: [number, number, number] = [object.position.x, object.position.y, object.position.z];

  const handleDragStart = (axis: DragAxis, startPoint: THREE.Vector3) => {
    if (!axis) return;

    if (controls) {
      controls.enabled = false;
    }

    setActiveAxis(axis);

    const objectCenter = new THREE.Vector3(object.position.x, object.position.y, object.position.z);
    let dragPlane: THREE.Plane;

    if (axis === 'xz') {
      dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -object.position.y);
    } else {
      const cameraDir = new THREE.Vector3();
      camera.getWorldDirection(cameraDir);
      const planeNormal = cameraDir.clone().negate();
      dragPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, startPoint);
    }

    dragRef.current = {
      axis,
      startPoint,
      startPosition: { ...object.position },
      startRotation: { ...object.rotation },
      dragPlane,
      objectCenter,
    };
  };

  useEffect(() => {
    if (!activeAxis) return;

    const handlePointerMove = (event: PointerEvent) => {
      const session = dragRef.current;
      if (!session || !session.axis) return;

      const rect = gl.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );

      raycaster.setFromCamera(mouse, camera);

      const currentIntersection = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(session.dragPlane, currentIntersection)) return;

      const worldDelta = currentIntersection.clone().sub(session.startPoint);

      if (isMove) {
        let newPos: { x: number; y: number; z: number };

        if (session.axis === 'xz') {
          newPos = {
            x: session.startPosition.x + worldDelta.x,
            y: session.startPosition.y,
            z: session.startPosition.z + worldDelta.z,
          };
        } else {
          let axisDir: THREE.Vector3;
          switch (session.axis) {
            case 'x': axisDir = new THREE.Vector3(1, 0, 0); break;
            case 'y': axisDir = new THREE.Vector3(0, 1, 0); break;
            case 'z': axisDir = new THREE.Vector3(0, 0, 1); break;
            default: return;
          }

          const projected = worldDelta.dot(axisDir);
          newPos = {
            x: session.startPosition.x + axisDir.x * projected,
            y: session.startPosition.y + axisDir.y * projected,
            z: session.startPosition.z + axisDir.z * projected,
          };
        }

        if (currentProject?.snapSettings.floorCollision) {
          const minY = object.dimensions.height / 2;
          if (newPos.y < minY) {
            newPos.y = minY;
          }
        }

        if (currentProject) {
          const snapResult = calculateSnappedPosition(
            object,
            newPos,
            currentProject.objects,
            currentProject.snapSettings
          );
          updateObject(object.id, { position: snapResult.position }, true);
        } else {
          updateObject(object.id, { position: newPos }, true);
        }
      } else {
        if (session.axis === 'xz') return;

        const center = session.objectCenter;
        const startVec = session.startPoint.clone().sub(center);
        const curVec = currentIntersection.clone().sub(center);

        let rotAxisWorld: THREE.Vector3;
        switch (session.axis) {
          case 'x': rotAxisWorld = new THREE.Vector3(1, 0, 0); break;
          case 'y': rotAxisWorld = new THREE.Vector3(0, 1, 0); break;
          case 'z': rotAxisWorld = new THREE.Vector3(0, 0, 1); break;
          default: return;
        }

        const startProj = startVec.clone().sub(rotAxisWorld.clone().multiplyScalar(startVec.dot(rotAxisWorld)));
        const curProj = curVec.clone().sub(rotAxisWorld.clone().multiplyScalar(curVec.dot(rotAxisWorld)));

        if (startProj.length() < 0.001 || curProj.length() < 0.001) return;

        startProj.normalize();
        curProj.normalize();

        let angle = Math.acos(THREE.MathUtils.clamp(startProj.dot(curProj), -1, 1));
        const cross = startProj.clone().cross(curProj);
        if (cross.dot(rotAxisWorld) < 0) angle = -angle;

        const angleDeg = THREE.MathUtils.radToDeg(angle);
        const snappedAngle = Math.round(angleDeg / 5) * 5;

        const newRotation = { ...session.startRotation };
        switch (session.axis) {
          case 'x': newRotation.x = session.startRotation.x + snappedAngle; break;
          case 'y': newRotation.y = session.startRotation.y + snappedAngle; break;
          case 'z': newRotation.z = session.startRotation.z + snappedAngle; break;
        }

        updateObject(object.id, { rotation: newRotation }, true);
      }
    };

    const handlePointerUp = () => {
      dragRef.current = null;
      setActiveAxis(null);

      if (controls) {
        controls.enabled = true;
      }

      pushHistoryState();
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      if (controls) {
        controls.enabled = true;
      }
    };
  }, [activeAxis, camera, gl, raycaster, controls, object, currentProject, isMove, updateObject, pushHistoryState]);

  if (activeGizmoMode === 'resize') return null;

  const beginAxis = (axis: Exclude<DragAxis, null>) => (event: any) => {
    handleDragStart(axis, event.point.clone());
  };

  if (isMove) {
    return (
      <group position={objPos}>
        <GizmoScale anchor={objPos}>
          <AxisArrow axis="x" color={GIZMO_AXIS.x} active={activeAxis === 'x'} onPointerDown={beginAxis('x')} />
          <AxisArrow axis="y" color={GIZMO_AXIS.y} active={activeAxis === 'y'} onPointerDown={beginAxis('y')} />
          <AxisArrow axis="z" color={GIZMO_AXIS.z} active={activeAxis === 'z'} onPointerDown={beginAxis('z')} />
          <MoveHub active={activeAxis === 'xz'} onPointerDown={beginAxis('xz')} />
        </GizmoScale>
      </group>
    );
  }

  return (
    <group position={objPos}>
      <GizmoScale anchor={objPos}>
        <RotateArc axis="x" color={GIZMO_AXIS.x} active={activeAxis === 'x'} onPointerDown={beginAxis('x')} />
        <RotateArc axis="y" color={GIZMO_AXIS.y} active={activeAxis === 'y'} onPointerDown={beginAxis('y')} />
        <RotateArc axis="z" color={GIZMO_AXIS.z} active={activeAxis === 'z'} onPointerDown={beginAxis('z')} />
        <RotateHub />
      </GizmoScale>
    </group>
  );
};
