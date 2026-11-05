import React, { useRef, useState, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { FurnitureObject } from '../../types/furniture';
import { useProjectStore } from '../../state/useProjectStore';
import { calculateSnappedPosition } from '../../utils/snapUtils';
import { moveSet } from '../../state/groupTree';
import { clearSnapHighlight, useSnapHighlight } from './SnapHighlight';
import { GIZMO_AXIS, ROTATE_SPHERE_RADIUS } from '../../theme/gizmo';
import { RotateDegreePill } from '../layout/SizeBar';
import { axisTravel, pastSlop, ringDragAngle, ringRotation, screenAxis, startRingDrag, type RingDrag, type ScreenAxis, viewportOf } from '../../utils/handleDrag';
import { AxisArrow, GizmoDepthClear, MoveHub, RotateRing, RotateRings, type FaceAxis } from './gizmoLook';

interface TouchGizmo3DProps {
  object: FurnitureObject;
}

type DragAxis = 'x' | 'y' | 'z' | 'xz' | null;

interface GizmoDrag {
  axis: DragAxis;
  /** The tool the gesture started in; a different tool ends it. */
  mode: 'move' | 'rotate';
  objectId: string;
  pointerId: number;
  startClient: { x: number; y: number };
  startGrab: THREE.Vector3;
  startPosition: { x: number; y: number; z: number };
  startRotation: { x: number; y: number; z: number };
  axisDir: THREE.Vector3 | null;
  screen: ScreenAxis | null;
  flat: { right: THREE.Vector3; fwd: THREE.Vector3; sRight: ScreenAxis; sFwd: ScreenAxis } | null;
  floorPlane: THREE.Plane | null;
  ring: RingDrag | null;
  /** Past the touch slop. */
  live: boolean;
  changed: boolean;
}

const _readoutRight = new THREE.Vector3();
const _readoutQuat = new THREE.Quaternion();

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
    activeProjectId,
    selectedObjectIds,
  } = useProjectStore();

  const { camera, raycaster, gl, controls } = useThree() as any;

  const [activeAxis, setActiveAxis] = useState<DragAxis>(null);
  const [readoutAxis, setReadoutAxis] = useState<'x' | 'y' | 'z' | null>(null);

  const dragRef = useRef<GizmoDrag | null>(null);

  const currentProject = projects.find(p => p.id === activeProjectId);
  const isMove = activeGizmoMode === 'move';

  const objPos: [number, number, number] = [object.position.x, object.position.y, object.position.z];
  const objRot: [number, number, number] = [
    THREE.MathUtils.degToRad(object.rotation.x),
    THREE.MathUtils.degToRad(object.rotation.y),
    THREE.MathUtils.degToRad(object.rotation.z),
  ];

  const objectEuler = () => new THREE.Euler(objRot[0], objRot[1], objRot[2], 'XYZ');

  /** End the gesture: one undo step if anything changed, camera back on. Safe to call twice. */
  const finishDrag = () => {
    const session = dragRef.current;
    dragRef.current = null;
    clearSnapHighlight();
    setActiveAxis(null);
    if (controls) controls.enabled = true;
    if (session?.changed) useProjectStore.getState().pushHistoryState();
  };
  const finishRef = useRef(finishDrag);
  finishRef.current = finishDrag;

  // Switching Move/Rotate (or to another part) ends any drag in progress; it never carries over.
  useEffect(() => {
    const s = dragRef.current;
    if (s && (s.mode !== activeGizmoMode || s.objectId !== object.id)) finishRef.current();
  }, [activeGizmoMode, object.id]);
  useEffect(() => () => { if (dragRef.current) finishRef.current(); }, []);

  const handleDragStart = (axis: DragAxis, event: any) => {
    if (!axis) return;
    const mode = useProjectStore.getState().activeGizmoMode;
    if (mode !== 'move' && mode !== 'rotate') return;
    if (mode === 'rotate' && axis === 'xz') return;
    if (dragRef.current) finishDrag();
    const ne = (event.nativeEvent ?? event) as PointerEvent;
    const startClient = { x: ne.clientX ?? 0, y: ne.clientY ?? 0 };
    const vp = viewportOf(gl.domElement);
    const center = new THREE.Vector3(object.position.x, object.position.y, object.position.z);
    const grab: THREE.Vector3 = event.point?.clone?.() ?? center.clone();

    let axisDir: THREE.Vector3 | null = null;
    let screen: ScreenAxis | null = null;
    let flat: { right: THREE.Vector3; fwd: THREE.Vector3; sRight: ScreenAxis; sFwd: ScreenAxis } | null = null;
    let floorPlane: THREE.Plane | null = null;
    let ring: RingDrag | null = null;

    if (axis === 'xz') {
      const view = center.clone().sub(camera.position).normalize();
      if (Math.abs(view.y) >= 0.25) {
        // Looking down on it: the part follows the finger on its own floor-parallel plane.
        floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -object.position.y);
      } else {
        // Camera near the part's height: that plane is edge-on and would fling the part
        // to the horizon. Screen left/right and up/down map to the floor's right and away.
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).setY(0);
        if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
        right.normalize();
        const fwd = new THREE.Vector3(0, 1, 0).cross(right).normalize().negate();
        flat = { right, fwd, sRight: screenAxis(center, right, camera, vp), sFwd: screenAxis(center, fwd, camera, vp) };
      }
    } else {
      axisDir = new THREE.Vector3(
        axis === 'x' ? 1 : 0,
        axis === 'y' ? 1 : 0,
        axis === 'z' ? 1 : 0,
      ).applyEuler(objectEuler());
      if (mode === 'move') screen = screenAxis(center, axisDir, camera, vp);
      else ring = startRingDrag(center, axisDir, grab, camera, vp);
    }

    if (controls) controls.enabled = false;
    setActiveAxis(axis);
    dragRef.current = {
      axis,
      mode,
      objectId: object.id,
      pointerId: ne.pointerId ?? event.pointerId ?? 0,
      startClient,
      startGrab: grab,
      startPosition: { ...object.position },
      startRotation: { ...object.rotation },
      axisDir,
      screen,
      flat,
      floorPlane,
      ring,
      live: false,
      changed: false,
    };
  };

  useEffect(() => {
    if (!activeAxis) return;

    const handlePointerMove = (event: PointerEvent) => {
      const session = dragRef.current;
      if (!session || !session.axis) return;
      // Another finger (pinch, palm) never drives the handle.
      if ((event.pointerId ?? 0) !== session.pointerId) return;
      const st = useProjectStore.getState();
      if (st.activeGizmoMode !== session.mode) { finishRef.current(); return; }

      const cur = { x: event.clientX, y: event.clientY };
      if (!session.live) {
        if (!pastSlop(session.startClient, cur)) return;
        session.live = true;
      }

      const vp = viewportOf(gl.domElement);
      if (vp.width < 1 || vp.height < 1) return;
      raycaster.setFromCamera(new THREE.Vector2(
        ((cur.x - vp.left) / vp.width) * 2 - 1,
        -((cur.y - vp.top) / vp.height) * 2 + 1,
      ), camera);

      const live = st.projects.find((p) => p.id === st.activeProjectId)?.objects.find((o) => o.id === session.objectId);
      if (!live) { finishRef.current(); return; }

      if (session.mode === 'move') {
        let newPos: { x: number; y: number; z: number };

        if (session.axis === 'xz') {
          let dx = 0, dz = 0;
          if (session.floorPlane) {
            const hit = new THREE.Vector3();
            const startHit = new THREE.Vector3();
            const startRay = new THREE.Raycaster();
            startRay.setFromCamera(new THREE.Vector2(
              ((session.startClient.x - vp.left) / vp.width) * 2 - 1,
              -((session.startClient.y - vp.top) / vp.height) * 2 + 1,
            ), camera);
            if (!raycaster.ray.intersectPlane(session.floorPlane, hit) || !startRay.ray.intersectPlane(session.floorPlane, startHit)) return;
            dx = hit.x - startHit.x;
            dz = hit.z - startHit.z;
          } else if (session.flat) {
            const f = session.flat;
            const r = axisTravel(f.sRight, session.startClient, cur);
            const a = axisTravel(f.sFwd, session.startClient, cur);
            dx = f.right.x * r + f.fwd.x * a;
            dz = f.right.z * r + f.fwd.z * a;
          }
          newPos = { x: session.startPosition.x + dx, y: session.startPosition.y, z: session.startPosition.z + dz };
        } else {
          const axisDir = session.axisDir;
          if (!axisDir || !session.screen) return;
          const travel = axisTravel(session.screen, session.startClient, cur);
          newPos = {
            x: session.startPosition.x + axisDir.x * travel,
            y: session.startPosition.y + axisDir.y * travel,
            z: session.startPosition.z + axisDir.z * travel,
          };
        }

        // Floor: no clamp here. Snapping, updateObject and translateSelection all keep the
        // part's real lowest point (rotation included) at or above y = 0.

        // Several things selected: they all move together by the same delta.
        const multi = st.selectedObjectIds.length > 1;
        session.changed = true;
        if (multi) {
          st.translateSelection({ x: newPos.x - live.position.x, y: newPos.y - live.position.y, z: newPos.z - live.position.z }, true);
        } else if (currentProject) {
          const snapResult = calculateSnappedPosition(
            live,
            newPos,
            // Snap to parts, not group boxes (a part's own group would trap it).
            // ...and never to the mover's own contents (moving a whole module).
            (() => { const own = moveSet(currentProject.objects, live.id); return currentProject.objects.filter((o) => o.shape !== 'group' && !own.has(o.id)); })(),
            currentProject.snapSettings,
            { dragAxis: session.axis === 'xz' ? 'xz' : (session.axisDir ? (Math.abs(session.axisDir.y) > 0.9 ? 'y' : 'x') : 'xz') }
          );
          // Move only ever writes position.
          updateObject(live.id, { position: snapResult.position }, true);
          useSnapHighlight.getState().set(live.id, snapResult.contacts, { alignments: snapResult.alignments, hint: snapResult.hint });
        } else {
          updateObject(live.id, { position: newPos }, true);
        }
      } else {
        if (session.axis === 'xz' || !session.ring) return;
        const axis = session.axis;
        const angleDeg = THREE.MathUtils.radToDeg(ringDragAngle(session.ring, raycaster.ray, session.startClient, cur));
        const newRotation = ringRotation(session.startRotation, axis, angleDeg);
        session.changed = true;
        // Rotate only ever writes rotation.
        updateObject(live.id, { rotation: newRotation }, true);
      }
    };

    const handlePointerUp = (event: PointerEvent) => {
      const session = dragRef.current;
      if (session && (event.pointerId ?? 0) !== session.pointerId) return;
      finishRef.current();
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [activeAxis, camera, gl, raycaster, currentProject, updateObject]);

  if (activeGizmoMode === 'resize') return null;
  // Rotating a multi-selection isn't supported (each would spin alone): Group first.
  if (!isMove && selectedObjectIds.length > 1) return null;

  const beginAxis = (axis: Exclude<DragAxis, null>) => (event: any) => {
    if (axis === 'x' || axis === 'y' || axis === 'z') setReadoutAxis(axis);
    handleDragStart(axis, event);
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
        <RotateRings objectRadius={Math.hypot(object.dimensions.length, object.dimensions.height, object.dimensions.width) / 2}>
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
        </RotateRings>
      ) : null}
    </group>
  );
};
