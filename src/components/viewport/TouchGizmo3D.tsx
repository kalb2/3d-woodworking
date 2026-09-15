import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { FurnitureObject } from '../../types/furniture';
import { useProjectStore } from '../../state/useProjectStore';
import { calculateSnappedPosition } from '../../utils/snapUtils';
import { SELECTION_COLOR } from '../../theme/canvasSelection';

interface TouchGizmo3DProps {
  object: FurnitureObject;
}

type DragAxis = 'x' | 'y' | 'z' | null;

/* ---- constants ---- */
const ARROW_LENGTH = 8;
const ARROW_RADIUS = 0.7;
const CONE_LENGTH = 3.5;
const CONE_RADIUS = 1.8;
const HIT_RADIUS = 3.5;   // invisible touch-target — very fat for finger grabbing
const HIT_LENGTH_EXTRA = 4; // extra length beyond arrow+cone

// Each rotation ring is a different radius so they don't overlap / z-fight
const RING_RADII = { x: 11, y: 13, z: 15 };
const RING_TUBE = 0.55;
const RING_HIT_TUBE = 3.5; // invisible hit-area tube thickness

const AXIS_COLORS = {
  x: '#ef4444',  // red
  y: '#10b981',  // green
  z: '#3b82f6',  // blue
};
const ACTIVE_COLOR = SELECTION_COLOR;

/* ======================================================================
   MOVE HANDLE — one per axis (fat arrow + invisible hit cylinder)
   ====================================================================== */
const MoveHandle: React.FC<{
  axis: 'x' | 'y' | 'z';
  objectPosition: [number, number, number];
  color: string;
  onDragStart: (axis: DragAxis, startPoint: THREE.Vector3) => void;
  isActive: boolean;
}> = ({ axis, objectPosition, color, onDragStart, isActive }) => {
  // Rotation to point the cylinder/cone along the correct world axis
  const axisRotation: [number, number, number] = useMemo(() => {
    switch (axis) {
      case 'x': return [0, 0, -Math.PI / 2];
      case 'y': return [0, 0, 0];
      case 'z': return [Math.PI / 2, 0, 0];
    }
  }, [axis]);

  const displayColor = isActive ? ACTIVE_COLOR : color;
  const hitLength = ARROW_LENGTH + CONE_LENGTH + HIT_LENGTH_EXTRA;

  return (
    <group position={objectPosition}>
      <group rotation={axisRotation}>
        {/* Visible shaft (cylinder) */}
        <mesh position={[0, ARROW_LENGTH / 2, 0]} renderOrder={10}>
          <cylinderGeometry args={[ARROW_RADIUS, ARROW_RADIUS, ARROW_LENGTH, 12]} />
          <meshStandardMaterial
            color={displayColor}
            emissive={displayColor}
            emissiveIntensity={isActive ? 0.8 : 0.4}
            roughness={0.3}
            transparent
            opacity={0.92}
            depthTest={false}
          />
        </mesh>

        {/* Visible cone tip */}
        <mesh position={[0, ARROW_LENGTH + CONE_LENGTH / 2, 0]} renderOrder={10}>
          <coneGeometry args={[CONE_RADIUS, CONE_LENGTH, 16]} />
          <meshStandardMaterial
            color={displayColor}
            emissive={displayColor}
            emissiveIntensity={isActive ? 0.8 : 0.4}
            roughness={0.3}
            transparent
            opacity={0.92}
            depthTest={false}
          />
        </mesh>

        {/* INVISIBLE fat hit target — easy to grab with a finger */}
        <mesh
          position={[0, hitLength / 2, 0]}
          renderOrder={20}
          onPointerDown={(e) => {
            e.stopPropagation();
            onDragStart(axis, e.point.clone());
          }}
        >
          <cylinderGeometry args={[HIT_RADIUS, HIT_RADIUS, hitLength, 8]} />
          <meshBasicMaterial visible={false} depthTest={false} />
        </mesh>
      </group>
    </group>
  );
};

/* ======================================================================
   ROTATE HANDLE — one per axis (torus ring + invisible fat hit torus)
   Each axis gets a slightly different radius so all 3 are clearly visible.
   ====================================================================== */
const RotateHandle: React.FC<{
  axis: 'x' | 'y' | 'z';
  objectPosition: [number, number, number];
  color: string;
  onDragStart: (axis: DragAxis, startPoint: THREE.Vector3) => void;
  isActive: boolean;
}> = ({ axis, objectPosition, color, onDragStart, isActive }) => {
  const axisRotation: [number, number, number] = useMemo(() => {
    switch (axis) {
      case 'x': return [0, Math.PI / 2, 0]; // ring in YZ plane (normal = X axis)
      case 'y': return [Math.PI / 2, 0, 0]; // ring in XZ plane (normal = Y axis)
      case 'z': return [0, 0, 0];           // ring in XY plane (normal = Z axis)
    }
  }, [axis]);

  const displayColor = isActive ? ACTIVE_COLOR : color;
  const ringRadius = RING_RADII[axis];

  return (
    <group position={objectPosition}>
      <group rotation={axisRotation}>
        {/* Visible ring */}
        <mesh renderOrder={10}>
          <torusGeometry args={[ringRadius, RING_TUBE, 16, 64]} />
          <meshStandardMaterial
            color={displayColor}
            emissive={displayColor}
            emissiveIntensity={isActive ? 0.8 : 0.5}
            roughness={0.3}
            transparent
            opacity={0.9}
            depthTest={false}
            side={THREE.DoubleSide}
          />
        </mesh>

        {/* INVISIBLE fat hit ring — easy to grab with a finger */}
        <mesh
          renderOrder={20}
          onPointerDown={(e) => {
            e.stopPropagation();
            onDragStart(axis, e.point.clone());
          }}
        >
          <torusGeometry args={[ringRadius, RING_HIT_TUBE, 8, 48]} />
          <meshBasicMaterial visible={false} depthTest={false} />
        </mesh>
      </group>
    </group>
  );
};

/* ======================================================================
   MAIN GIZMO
   ====================================================================== */
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

  /* ---- drag start ---- */
  const handleDragStart = (axis: DragAxis, startPoint: THREE.Vector3) => {
    if (!axis) return;

    // Disable orbit controls immediately
    if (controls) {
      controls.enabled = false;
    }

    setActiveAxis(axis);

    // Build a drag plane perpendicular to the camera through the start point
    const cameraDir = new THREE.Vector3();
    camera.getWorldDirection(cameraDir);
    const planeNormal = cameraDir.clone().negate();

    const dragPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(
      planeNormal,
      startPoint
    );

    const objectCenter = new THREE.Vector3(object.position.x, object.position.y, object.position.z);

    dragRef.current = {
      axis,
      startPoint,
      startPosition: { ...object.position },
      startRotation: { ...object.rotation },
      dragPlane,
      objectCenter,
    };
  };

  /* ---- drag move & drag end (window-level listeners) ---- */
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
        /* ---- TRANSLATION ---- */
        // Use world-space axes (not object-local) for intuitive movement
        let axisDir: THREE.Vector3;
        switch (session.axis) {
          case 'x': axisDir = new THREE.Vector3(1, 0, 0); break;
          case 'y': axisDir = new THREE.Vector3(0, 1, 0); break;
          case 'z': axisDir = new THREE.Vector3(0, 0, 1); break;
          default: return;
        }

        const projected = worldDelta.dot(axisDir);
        const newPos = {
          x: session.startPosition.x + axisDir.x * projected,
          y: session.startPosition.y + axisDir.y * projected,
          z: session.startPosition.z + axisDir.z * projected,
        };

        // Always enforce floor collision: object bottom (y - height/2) must not go below 0
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
        /* ---- ROTATION ---- */
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

        // Project both vectors onto the plane perpendicular to the rotation axis
        const startProj = startVec.clone().sub(rotAxisWorld.clone().multiplyScalar(startVec.dot(rotAxisWorld)));
        const curProj = curVec.clone().sub(rotAxisWorld.clone().multiplyScalar(curVec.dot(rotAxisWorld)));

        if (startProj.length() < 0.001 || curProj.length() < 0.001) return;

        startProj.normalize();
        curProj.normalize();

        let angle = Math.acos(THREE.MathUtils.clamp(startProj.dot(curProj), -1, 1));
        const cross = startProj.clone().cross(curProj);
        if (cross.dot(rotAxisWorld) < 0) angle = -angle;

        const angleDeg = THREE.MathUtils.radToDeg(angle);

        // Snap to 5° increments for finger-friendly precision
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

  /* ---- RENDER ---- */
  if (isMove) {
    return (
      <>
        <MoveHandle axis="x" objectPosition={objPos} color={AXIS_COLORS.x} onDragStart={handleDragStart} isActive={activeAxis === 'x'} />
        <MoveHandle axis="y" objectPosition={objPos} color={AXIS_COLORS.y} onDragStart={handleDragStart} isActive={activeAxis === 'y'} />
        <MoveHandle axis="z" objectPosition={objPos} color={AXIS_COLORS.z} onDragStart={handleDragStart} isActive={activeAxis === 'z'} />
        {/* Center sphere anchor */}
        <mesh position={objPos} renderOrder={10}>
          <sphereGeometry args={[1.5, 16, 16]} />
          <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.3} roughness={0.3} transparent opacity={0.7} depthTest={false} />
        </mesh>
      </>
    );
  }

  // Rotate mode — all 3 rings always visible, each a different radius
  return (
    <>
      <RotateHandle axis="x" objectPosition={objPos} color={AXIS_COLORS.x} onDragStart={handleDragStart} isActive={activeAxis === 'x'} />
      <RotateHandle axis="y" objectPosition={objPos} color={AXIS_COLORS.y} onDragStart={handleDragStart} isActive={activeAxis === 'y'} />
      <RotateHandle axis="z" objectPosition={objPos} color={AXIS_COLORS.z} onDragStart={handleDragStart} isActive={activeAxis === 'z'} />
      {/* Center dot */}
      <mesh position={objPos} renderOrder={10}>
        <sphereGeometry args={[1.0, 16, 16]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.5} roughness={0.3} transparent opacity={0.6} depthTest={false} />
      </mesh>
    </>
  );
};
