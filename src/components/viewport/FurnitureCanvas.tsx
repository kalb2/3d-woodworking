import React, { useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useBuiltInFlow } from '../../builtins/useBuiltInFlow';
import { OrbitControls, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import { useProjectStore } from '../../state/useProjectStore';
import { useAppStore } from '../../state/useAppStore';
import { FurnitureMesh } from './FurnitureMesh';
import { RoomScanMesh } from './RoomScanMesh';
import { TransparentFloor } from './TransparentFloor';
import { TouchGizmo3D } from './TouchGizmo3D';
import { ResizeHandles3D } from './ResizeHandles3D';

/** Soft contact blob. Hidden with Floor off, and whenever the camera is under the ground. */
const GroundContactShadow: React.FC = () => {
  const group = useRef<THREE.Group>(null);
  useFrame(({ camera }) => {
    if (group.current) group.current.visible = camera.position.y >= -0.02;
  });
  return (
    <group ref={group}>
      <ContactShadows
        position={[0, -0.01, 0]}
        opacity={0.28}
        scale={200}
        blur={3.2}
        far={36}
        resolution={512}
        smooth
        color="#94a3b8"
        depthWrite={false}
      />
    </group>
  );
};

/** Room-scan wall part (not a window/door panel). Older scans lack `wallId`. */
const isRoomWall = (obj: { name: string }) => !/\b(Window|Door|Opening)\b/.test(obj.name);

/** Frames the camera on a requested target (Built-ins list). */
const CameraFocus: React.FC = () => {
  const focus = useBuiltInFlow((s) => s.focus);
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as { target: THREE.Vector3; update: () => void } | null;
  React.useEffect(() => {
    if (!focus || !controls) return;
    const target = new THREE.Vector3(focus.x, focus.y, focus.z);
    const dir = camera.position.clone().sub(controls.target);
    if (dir.lengthSq() < 1e-6) dir.set(0.6, 0.5, 0.8);
    dir.normalize().multiplyScalar(Math.max(40, focus.radius * 1.6));
    controls.target.copy(target);
    camera.position.copy(target.clone().add(dir));
    controls.update();
  }, [focus, camera, controls]);
  return null;
};

const DEFAULT_CAMERA = new THREE.Vector3(50, 45, 65);

/** On project open/switch, frame everything in the scene (or the default view when empty). */
const AutoFrame: React.FC<{ projectId: string }> = ({ projectId }) => {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const controls = useThree((s) => s.controls) as { target: THREE.Vector3; update: () => void } | null;
  const frameNonce = useBuiltInFlow((s) => s.frameNonce);
  React.useEffect(() => {
    if (!controls) return;
    const proj = useProjectStore.getState().projects.find((p) => p.id === projectId);
    const box = new THREE.Box3();
    for (const o of proj?.objects ?? []) {
      if (o.shape === 'group' || o.visible === false) continue;
      const r = Math.hypot(o.dimensions.length, o.dimensions.height, o.dimensions.width) / 2;
      box.expandByPoint(new THREE.Vector3(o.position.x - r, o.position.y - r, o.position.z - r));
      box.expandByPoint(new THREE.Vector3(o.position.x + r, o.position.y + r, o.position.z + r));
    }
    if (box.isEmpty()) {
      controls.target.set(0, 0, 0);
      camera.position.copy(DEFAULT_CAMERA);
    } else {
      const center = box.getCenter(new THREE.Vector3());
      const radius = box.getSize(new THREE.Vector3()).length() / 2;
      const fov = (camera.fov * Math.PI) / 180;
      const fit = (radius * 1.15) / Math.sin(Math.min(fov, fov * camera.aspect) / 2);
      const dist = Math.max(10, Math.min(4000, Math.max(fit, DEFAULT_CAMERA.length())));
      controls.target.copy(center);
      camera.position.copy(center.clone().add(DEFAULT_CAMERA.clone().normalize().multiplyScalar(dist)));
    }
    controls.update();
  }, [projectId, camera, controls, frameNonce]);
  return null;
};

export const FurnitureCanvas: React.FC = () => {
  const {
    projects,
    activeProjectId,
    selectedObjectId,
    selectedObjectIds,
    editingGroupId,
    selectObject,
    enterGroup,
    exitGroup,
    activeGizmoMode,
  } = useProjectStore();
  const lastTap = useRef<{ id: string; time: number } | null>(null);
  const focusWallId = useBuiltInFlow((s) => s.focusWallId);

  const { preferences } = useAppStore();

  const orbitControlsRef = useRef<any>(null);
  const currentProject = projects.find(p => p.id === activeProjectId);

  if (!currentProject) return null;

  const selectedObject = currentProject.objects.find(o => o.id === selectedObjectId);
  const bgColor = currentProject.backgroundColor || preferences.backgroundColor || '#f8fafc';

  const clearSelection = () => {
    if (useBuiltInFlow.getState().focusWallId) useBuiltInFlow.getState().focusWall(null);
    if (editingGroupId) exitGroup();
    else selectObject(null);
  };

  const handleCanvasClick = (e: any) => {
    if (e.target === e.currentTarget) clearSelection();
  };

  const handleRoomWallPick = (event: any, obj: { wallId?: string; name: string }) => {
    event.stopPropagation();
    const walls = currentProject.scannedRoom?.walls ?? [];
    const wall = walls.find((w) => w.id === obj.wallId) ?? walls.find((w) => `${w.label} (scan)` === obj.name);
    if (!wall) return;
    if (editingGroupId) exitGroup();
    if (currentProject.roomLocked === false) selectObject((obj as { id?: string }).id ?? null);
    else selectObject(null);
    useBuiltInFlow.getState().focusWall(wall.id);
  };

  const handlePartPointerDown = (event: any, objId: string) => {
    event.stopPropagation();
    if (useBuiltInFlow.getState().focusWallId) useBuiltInFlow.getState().focusWall(null);
    const obj = currentProject.objects.find((item) => item.id === objId);
    if (!obj) return;
    const additive = Boolean(event.shiftKey || event.metaKey || event.ctrlKey);
    const now = performance.now();
    const previous = lastTap.current;
    const doubleTap = Boolean(previous && previous.id === obj.id && now - previous.time < 420);
    lastTap.current = { id: obj.id, time: now };

    const parent = obj.parentId
      ? currentProject.objects.find((item) => item.id === obj.parentId && item.shape === 'group')
      : undefined;

    if (editingGroupId) {
      if (obj.parentId === editingGroupId) {
        selectObject(obj.id, { additive });
        return;
      }
      exitGroup();
      selectObject(obj.shape === 'group' ? obj.id : (parent?.id ?? obj.id), { additive });
      return;
    }
    const groupTarget = obj.shape === 'group' ? obj : parent;
    if (groupTarget && doubleTap) {
      enterGroup(groupTarget.id);
      return;
    }
    if (groupTarget && obj.shape !== 'group') {
      selectObject(groupTarget.id, { additive });
      return;
    }
    selectObject(obj.id, { additive });
  };

  return (
    <div
      style={{ width: '100%', height: '100%', position: 'relative', touchAction: 'none', backgroundColor: bgColor }}
      onClick={handleCanvasClick}
    >
      <Canvas
        shadows="percentage"
        /* far stays past the grid fade so the horizon dissolves instead of clipping */
        camera={{ position: [50, 45, 65], fov: 45, near: 0.1, far: 20000 }}
        gl={{ preserveDrawingBuffer: true, antialias: true }}
        onPointerMissed={clearSelection}
      >
        {/* Customizable canvas background color */}
        <color attach="background" args={[bgColor]} />
        {/* Soft Studio Lighting setup tuned for realistic wood textures */}
        <hemisphereLight args={['#fff8f1', '#d5dee8', 0.62]} />
        <ambientLight intensity={0.28} />
        <directionalLight
          position={[80, 120, 46]}
          intensity={1.55}
          color="#fffaf3"
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-bias={-0.00015}
        />
        <directionalLight position={[-55, 36, -28]} intensity={0.32} color="#e8eef6" />

        {/* Orbit Camera controls for iPad.
            Default touch gestures: 1-finger = orbit, 2-finger = dolly+pan.
            Gizmo handles disable controls.enabled during drag to prevent conflicts.
            Distances are inches. 250 stopped a phone on a 4×8 sheet; 4000 frames a bunk or a small shop. */}
        <OrbitControls
          ref={orbitControlsRef}
          makeDefault
          enableDamping
          dampingFactor={0.08}
          minDistance={10}
          maxDistance={4000}
          maxPolarAngle={Math.PI / 2 + 0.05}
        />

        {/* Floor on: quiet infinite grid plus a soft contact shadow. No second plane. */}
        <TransparentFloor
          visible={currentProject.showFloor}
          opacity={currentProject.floorOpacity}
        />
        {currentProject.showFloor && <GroundContactShadow />}

        <CameraFocus />
        <AutoFrame projectId={currentProject.id} />

        {/* Render all furniture objects in active project */}
        {currentProject.objects.map((obj) => obj.generator === 'room-scan' ? (
          <RoomScanMesh
            key={obj.id}
            object={obj}
            unlocked={currentProject.roomLocked === false}
            focused={selectedObjectIds.includes(obj.id) || Boolean(focusWallId && isRoomWall(obj) && (obj.wallId === focusWallId
              || currentProject.scannedRoom?.walls.find((w) => w.id === focusWallId)?.label + ' (scan)' === obj.name))}
            onPointerDown={isRoomWall(obj)
              ? (e) => handleRoomWallPick(e, obj)
              : currentProject.roomLocked === false ? (e) => handlePartPointerDown(e, obj.id) : undefined}
          />
        ) : (
          <FurnitureMesh
            key={obj.id}
            object={obj}
            isSelected={selectedObjectIds.includes(obj.id)}
            pickGroup={editingGroupId !== obj.id}
            onPointerDown={(e) => handlePartPointerDown(e, obj.id)}
          />
        ))}

        {/* Active Selected Object Controls */}
        {selectedObject && (
          <>
            {/* Direct 3D grab & drag resize handles */}
            {activeGizmoMode === 'resize' && (
              <ResizeHandles3D object={selectedObject} />
            )}

            {/* Touch-friendly translation & rotation gizmos */}
            {activeGizmoMode !== 'resize' && (
              <TouchGizmo3D object={selectedObject} />
            )}
          </>
        )}
      </Canvas>
    </div>
  );
};
