import React, { useRef, useState, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { FurnitureObject } from '../../types/furniture';
import { useProjectStore } from '../../state/useProjectStore';
import { calculateSnappedPosition } from '../../utils/snapUtils';
import { GIZMO_AXIS, ROTATE_SPHERE_RADIUS } from '../../theme/gizmo';
import { RotateDegreePill } from '../layout/SizeBar';
import { AxisArrow, GizmoDepthClear, MoveHub, RotateRing, type FaceAxis } from './gizmoLook';

interface TouchGizmo3DProps {
  object: FurnitureObject;
}

type DragAxis = 'x' | 'y' | 'z' | 'xz' | null;

const _readoutRight = new THREE.Vector3();
const _readoutQuat = new THREE.Quaternion();

/** Half-width of the catch on 0°, 45°, 90°, and the other 45° marks. */
const MAJOR_DETENT_DEGREES = 2;
/** Half-width of the catch on the older 5° stops (0, 5, 10, …, 50, …). */
const MINOR_DETENT_DEGREES = 1;

/**
 * Free rotation, rounded to a degree, with a light pull onto the old stops.
 * A drag inside either window lands on that stop. Anywhere else, including 47° or 52°, it stays put.
 * 50° is both a 5° stop and a place a drag can rest.
 */
function rotateWithDetents(degrees: number): number {
  const major = Math.round(degrees / 45) * 45;
  if (Math.abs(degrees - major) < MAJOR_DETENT_DEGREES) return major;
  const minor = Math.round(degrees / 5) * 5;
  if (Math.abs(degrees - minor) < MINOR_DETENT_DEGREES) return minor;
  return Math.round(degrees);
}

/** Screen-size degree pill parked just to the right of the rotate sphere. */
const RotateReadout: React.FC<{
  axis: 'x' | 'y' | 'z';
  degrees: number;
  onChange: (degrees: number) => void;
  onCommit: () => void;
}> = ({ axis, degrees, onChange, onCommit }) => {
  const anchor = useRef<THREE.Group>(null);
  const { camera } = useThree();

  useFrame(() => {
    const node = anchor.current;
    const parent = node?.parent;
    if (!node || !parent) return;
    _readoutRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
    parent.getWorldQuaternion(_readoutQuat);
    _readoutRight.applyQuaternion(_readoutQuat.invert());
    if (_readoutRight.lengthSq() < 1e-6) _readoutRight.set(1, 0, 0);
    node.position.copy(_readoutRight.normalize().multiplyScalar(ROTATE_SPHERE_RADIUS + 1.8));
  });

  return (
    <group ref={anchor}>
      <Html center zIndexRange={[30, 0]} wrapperClass="rotate-readout-anchor">
        <RotateDegreePill axis={axis} degrees={degrees} onChange={onChange} onCommit={onCommit} />
      </Html>
    </group>
  );
};

export const TouchGizmo3D: React.FC<TouchGizmo3DProps> = ({ object }) => {
  const {
    activeGizmoMode,
    updateObject,
    pushHistoryState,
    saveCurrentProject,
    projects,
    activeProjectId
  } = useProjectStore();

  const { camera, raycaster, gl, controls } = useThree() as any;

  const [activeAxis, setActiveAxis] = useState<DragAxis>(null);
  const [readoutAxis, setReadoutAxis] = useState<'x' | 'y' | 'z' | null>(null);

  const dragRef = useRef<{
    axis: DragAxis;
    startPoint: THREE.Vector3;
    startPosition: { x: number; y: number; z: number };
    startRotation: { x: number; y: number; z: number };
    dragPlane: THREE.Plane;
    objectCenter: THREE.Vector3;
    axisDir: THREE.Vector3 | null;
  } | null>(null);

  const currentProject = projects.find(p => p.id === activeProjectId);
  const isMove = activeGizmoMode === 'move';

  const objPos: [number, number, number] = [object.position.x, object.position.y, object.position.z];
  const objRot: [number, number, number] = [
    THREE.MathUtils.degToRad(object.rotation.x),
    THREE.MathUtils.degToRad(object.rotation.y),
    THREE.MathUtils.degToRad(object.rotation.z),
  ];

  const objectEuler = () => new THREE.Euler(objRot[0], objRot[1], objRot[2], 'XYZ');

  const handleDragStart = (axis: DragAxis, startPoint: THREE.Vector3) => {
    if (!axis) return;

    if (controls) {
      controls.enabled = false;
    }

    setActiveAxis(axis);

    const objectCenter = new THREE.Vector3(object.position.x, object.position.y, object.position.z);
    let dragPlane: THREE.Plane;
    let axisDir: THREE.Vector3 | null = null;

    if (axis === 'xz') {
      dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -object.position.y);
    } else {
      axisDir = new THREE.Vector3(
        axis === 'x' ? 1 : 0,
        axis === 'y' ? 1 : 0,
        axis === 'z' ? 1 : 0,
      ).applyEuler(objectEuler());

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
      axisDir,
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
          const axisDir = session.axisDir;
          if (!axisDir) return;
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

        const rotAxisWorld = session.axisDir ?? (() => {
          switch (session.axis) {
            case 'x': return new THREE.Vector3(1, 0, 0);
            case 'y': return new THREE.Vector3(0, 1, 0);
            case 'z': return new THREE.Vector3(0, 0, 1);
            default: return new THREE.Vector3(0, 1, 0);
          }
        })();

        const startProj = startVec.clone().sub(rotAxisWorld.clone().multiplyScalar(startVec.dot(rotAxisWorld)));
        const curProj = curVec.clone().sub(rotAxisWorld.clone().multiplyScalar(curVec.dot(rotAxisWorld)));

        if (startProj.length() < 0.001 || curProj.length() < 0.001) return;

        startProj.normalize();
        curProj.normalize();

        let angle = Math.acos(THREE.MathUtils.clamp(startProj.dot(curProj), -1, 1));
        const cross = startProj.clone().cross(curProj);
        if (cross.dot(rotAxisWorld) < 0) angle = -angle;

        const angleDeg = THREE.MathUtils.radToDeg(angle);
        const newRotation = { ...session.startRotation };
        switch (session.axis) {
          case 'x': newRotation.x = rotateWithDetents(session.startRotation.x + angleDeg); break;
          case 'y': newRotation.y = rotateWithDetents(session.startRotation.y + angleDeg); break;
          case 'z': newRotation.z = rotateWithDetents(session.startRotation.z + angleDeg); break;
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

  if (activeGizmoMode === 'resize' || object.locked) return null;

  const beginAxis = (axis: Exclude<DragAxis, null>) => (event: any) => {
    if (axis === 'x' || axis === 'y' || axis === 'z') setReadoutAxis(axis);
    handleDragStart(axis, event.point.clone());
  };

  const shownAxis = activeAxis === 'x' || activeAxis === 'y' || activeAxis === 'z' ? activeAxis : readoutAxis;

  const moveHandles: { axis: FaceAxis; drag: Exclude<DragAxis, null>; color: string }[] = [
    { axis: '+x', drag: 'x', color: GIZMO_AXIS.x },
    { axis: '+y', drag: 'y', color: GIZMO_AXIS.y },
    { axis: '+z', drag: 'z', color: GIZMO_AXIS.z },
  ];

  return (
    <group position={objPos} rotation={objRot}>
      <GizmoDepthClear />
      {isMove ? (
        <>
          {moveHandles.map(({ axis, drag, color }) => (
            <AxisArrow
              key={axis}
              axis={axis}
              color={color}
              active={activeAxis === drag}
              onPointerDown={beginAxis(drag)}
            />
          ))}
          <MoveHub active={activeAxis === 'xz'} onPointerDown={beginAxis('xz')} />
        </>
      ) : activeGizmoMode === 'rotate' ? (
        <>
          <RotateRing axis="x" color={GIZMO_AXIS.x} active={activeAxis === 'x'} onPointerDown={beginAxis('x')} />
          <RotateRing axis="y" color={GIZMO_AXIS.y} active={activeAxis === 'y'} onPointerDown={beginAxis('y')} />
          <RotateRing axis="z" color={GIZMO_AXIS.z} active={activeAxis === 'z'} onPointerDown={beginAxis('z')} />
          {shownAxis && (
            <RotateReadout
              axis={shownAxis}
              degrees={object.rotation[shownAxis]}
              onChange={(degrees) => {
                updateObject(object.id, { rotation: { ...object.rotation, [shownAxis]: degrees } }, true);
              }}
              onCommit={() => {
                pushHistoryState();
                saveCurrentProject();
              }}
            />
          )}
        </>
      ) : null}
    </group>
  );
};
