import React, { useRef, useState } from 'react';
import { areaSelect, pathTo, topUnder, type ScreenRect } from '../../state/groupTree';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useBuiltInFlow } from '../../builtins/useBuiltInFlow';
import { cameraDir, cameraTarget } from '../../templates/userTemplates';
import { OrbitControls, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import { projectStyle } from '../../state/viewStyle';
import { useProjectStore } from '../../state/useProjectStore';
import { useAppStore } from '../../state/useAppStore';
import { FurnitureMesh } from './FurnitureMesh';
import { RoomScanMesh } from './RoomScanMesh';
import { HoleDragger } from './HoleDragger';
import { getHoles, supportsHoles, useHoleFocus } from '../../utils/holes';
import { TransparentFloor } from './TransparentFloor';
import { TouchGizmo3D } from './TouchGizmo3D';
import { ResizeHandles3D } from './ResizeHandles3D';
import { startPartPress, useSelectTip } from '../../utils/longPress';
import { lightHaptic } from '../../native/haptics';
import { GroupResizeHandles3D } from './GroupResizeHandles3D';
import { JointTags } from './JointTags';
import { SnapHighlight } from './SnapHighlight';
import { MeasureLayer } from '../../measure/MeasureLayer';
import { useMeasure } from '../../measure/useMeasure';

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
    // Fit the target's radius in the narrower field of view (phones are tall).
    const cam = camera as THREE.PerspectiveCamera;
    const fov = ((cam.fov ?? 50) * Math.PI) / 180;
    const fit = (focus.radius * 1.15) / Math.sin(Math.min(fov, fov * (cam.aspect ?? 1)) / 2);
    dir.normalize().multiplyScalar(Math.max(40, focus.radius * 1.6, fit));
    controls.target.copy(target);
    camera.position.copy(target.clone().add(dir));
    controls.update();
  }, [focus, camera, controls]);
  return null;
};

const DEFAULT_CAMERA = new THREE.Vector3(50, 45, 65);

/** Mirrors the orbit target into a plain object for placement (no React updates). */
const TrackTarget: React.FC = () => {
  const controls = useThree((s) => s.controls) as { target: THREE.Vector3 } | null;
  useFrame(({ camera }) => {
    if (!controls) return;
    cameraTarget.x = controls.target.x; cameraTarget.z = controls.target.z;
    const d = camera.position.clone().sub(controls.target).normalize();
    cameraDir.x = d.x; cameraDir.y = d.y; cameraDir.z = d.z;
  });
  return null;
};

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

/** Screen projector for area select, fed from inside the Canvas. */
const projector: { current: ((p: { x: number; y: number; z: number }) => { x: number; y: number } | null) | null } = { current: null };

const ProjectorBridge: React.FC = () => {
  const { camera, gl } = useThree();
  React.useEffect(() => {
    const v = new THREE.Vector3();
    projector.current = (p) => {
      v.set(p.x, p.y, p.z).project(camera);
      if (v.z > 1) return null;
      const r = gl.domElement.getBoundingClientRect();
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
    };
    return () => { projector.current = null; };
  }, [camera, gl]);
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
    multiSelect,
  } = useProjectStore();
  const [dragRect, setDragRect] = useState<ScreenRect | null>(null);
  const dragStart = useRef<{ x: number; y: number; id: number } | null>(null);
  const lastTap = useRef<{ id: string; time: number } | null>(null);
  const handOff = useRef(false);
  const [pressRing, setPressRing] = useState<{ x: number; y: number; done: boolean } | null>(null);
  const focusWallId = useBuiltInFlow((s) => s.focusWallId);
  const holeEdit = useHoleFocus();

  const { preferences } = useAppStore();

  const orbitControlsRef = useRef<any>(null);
  const currentProject = projects.find(p => p.id === activeProjectId);

  const measuring = useMeasure((m) => m.active);
  if (!currentProject) return null;

  const selectedObject = currentProject.objects.find(o => o.id === selectedObjectId);
  // Groups on the opened path don't catch taps (their members do).
  const openPath = new Set(pathTo(currentProject.objects, editingGroupId));
  const realistic = projectStyle(currentProject) === 'realistic';
  // Phones get a smaller shadow map (keeps 60fps).
  const shadowRes = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 600 ? 1024 : 2048;
  const bgColor = currentProject.backgroundColor || preferences.backgroundColor || '#f8fafc';

  const clearSelection = () => {
    if (useHoleFocus.getState().editing) { useHoleFocus.getState().exit(); return; }
    if (useBuiltInFlow.getState().focusWallId) useBuiltInFlow.getState().focusWall(null);
    // Select mode: empty taps never change level.
    if (useProjectStore.getState().multiSelect) return;
    // Inside a group, empty space goes up one level.
    if (editingGroupId) exitGroup();
    else selectObject(null);
  };

  // Area select (select mode): one-finger drag draws a rectangle.
  const onAreaDown = (e: React.PointerEvent) => {
    if (!multiSelect || !e.isPrimary) return;
    dragStart.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
  };
  const onAreaMove = (e: React.PointerEvent) => {
    const st = dragStart.current;
    if (!st || e.pointerId !== st.id) return;
    if (!dragRect && Math.hypot(e.clientX - st.x, e.clientY - st.y) < 8) return;
    setDragRect({ x0: st.x, y0: st.y, x1: e.clientX, y1: e.clientY });
  };
  const onAreaUp = () => {
    const rect = dragRect;
    dragStart.current = null;
    setDragRect(null);
    if (!rect || !projector.current) return;
    const hits = areaSelect(currentProject.objects, editingGroupId, rect, projector.current, currentProject.roomLocked !== false);
    useProjectStore.getState().selectMany(hits);
  };

  const handleCanvasClick = (e: any) => {
    if (e.target === e.currentTarget) clearSelection();
  };

  /** Tape measure: a tap on a part (or scanned wall) records a snapped point. */
  const measureTap = (event: any, _objId: string): boolean => {
    if (!useMeasure.getState().active) return false;
    event.stopPropagation(); // the tracker places points; no selection while measuring
    return true;
  };

  const handleRoomWallPick = (event: any, obj: { id?: string; wallId?: string; name: string }) => {
    if (obj.id && measureTap(event, obj.id)) return;
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
    if (handOff.current) return; // our own replayed touch, meant for the camera
    if (measureTap(event, objId)) return;
    event.stopPropagation();
    if (useMeasure.getState().selectedId) useMeasure.getState().select(null);
    if (useBuiltInFlow.getState().focusWallId) useBuiltInFlow.getState().focusWall(null);
    const obj = currentProject.objects.find((item) => item.id === objId);
    if (!obj) return;
    const additive = Boolean(event.shiftKey || event.metaKey || event.ctrlKey);
    const now = performance.now();
    const previous = lastTap.current;

    // A tap picks the top-most item at the current group level.
    let context = editingGroupId;
    let target = topUnder(currentProject.objects, obj.id, context);
    if (!target) {
      // Tapped outside the opened group: back to the top level.
      context = null;
      useProjectStore.getState().setGroupContext(null);
      target = topUnder(currentProject.objects, obj.id, null);
    }
    if (!target) return;
    const targetObj = currentProject.objects.find((o) => o.id === target);
    const isDouble = Boolean(previous && previous.id === target && now - previous.time < 420);
    lastTap.current = { id: target, time: now };
    if (isDouble && targetObj?.shape === 'group' && !multiSelect) {
      enterGroup(target);
      return;
    }
    // Something else already selected: a quick tap selects this part, a long
    // press adds it (or takes it out) without orbiting.
    const sel = useProjectStore.getState().selectedObjectIds;
    if (!additive && !multiSelect && sel.length > 0 && !(sel.length === 1 && sel[0] === target)) {
      startPress(event, target);
      return;
    }
    selectObject(target, { additive });
  };

  const startPress = (event: any, target: string) => {
    const ne = (event.nativeEvent ?? event) as PointerEvent;
    startPartPress({
      x: ne.clientX ?? 0, y: ne.clientY ?? 0, pointerId: ne.pointerId ?? 1, pointerType: ne.pointerType || 'touch',
      controls: orbitControlsRef.current,
      orbitAllowed: () => !useProjectStore.getState().multiSelect,
      handOff,
      setRing: setPressRing,
      onTap: () => selectObject(target),
      onHold: () => {
        selectObject(target, { additive: true });
        void lightHaptic();
        useSelectTip.getState().dismiss();
      },
    });
  };

  return (
    <div
      className="canvas-touch-root"
      style={{ width: '100%', height: '100%', position: 'relative', touchAction: 'none', backgroundColor: bgColor }}
      onClick={handleCanvasClick}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDownCapture={onAreaDown}
      onPointerMoveCapture={onAreaMove}
      onPointerUpCapture={onAreaUp}
      onPointerCancelCapture={onAreaUp}
    >
      {pressRing && (
        // Hold feedback: a ring that fills over the long-press time, then pops.
        <div className={`press-ring${pressRing.done ? ' is-done' : ''}`} data-testid="press-ring" aria-hidden="true" style={{ left: pressRing.x, top: pressRing.y }} />
      )}
      {dragRect && (() => {
        const r = { x0: Math.min(dragRect.x0, dragRect.x1), y0: Math.min(dragRect.y0, dragRect.y1), x1: Math.max(dragRect.x0, dragRect.x1), y1: Math.max(dragRect.y0, dragRect.y1) };
        return <div className="area-select-rect" style={{ position: 'fixed', left: r.x0, top: r.y0, width: r.x1 - r.x0, height: r.y1 - r.y0 }} />;
      })()}
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
        <hemisphereLight args={['#fff8f1', '#d5dee8', realistic ? 0.62 : 0.9]} />
        <ambientLight intensity={realistic ? 0.26 : 0.45} />
        <directionalLight
          position={[80, 120, 46]}
          intensity={realistic ? 1.5 : 1.1}
          color="#fffaf3"
          castShadow={realistic}
          shadow-mapSize-width={shadowRes}
          shadow-mapSize-height={shadowRes}
          shadow-bias={-0.00015}
          shadow-normalBias={0.04}
          shadow-camera-left={-240}
          shadow-camera-right={240}
          shadow-camera-top={240}
          shadow-camera-bottom={-240}
          shadow-camera-far={800}
        />
        <directionalLight position={[-55, 36, -28]} intensity={realistic ? 0.34 : 0.5} color="#e8eef6" />
        <directionalLight position={[10, 30, 90]} intensity={realistic ? 0.18 : 0.3} color="#ffffff" />

        {/* Orbit Camera controls for iPad.
            Default touch gestures: 1-finger = orbit, 2-finger = dolly+pan.
            Gizmo handles disable controls.enabled during drag to prevent conflicts.
            Distances are inches. 250 stopped a phone on a 4×8 sheet; 4000 frames a bunk or a small shop. */}
        <OrbitControls
          ref={orbitControlsRef}
          makeDefault
          enabled={!multiSelect}
          // Measuring: one finger places points, two fingers zoom/pan.
          touches={measuring ? { ONE: -1 as unknown as THREE.TOUCH, TWO: THREE.TOUCH.DOLLY_PAN } : undefined}
          mouseButtons={measuring ? { LEFT: -1 as unknown as THREE.MOUSE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE } : undefined}
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
        {currentProject.showFloor && realistic && <GroundContactShadow />}

        <CameraFocus />
        <ProjectorBridge />
        <SnapHighlight />
        <JointTags />
        <MeasureLayer />
        <TrackTarget />
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
            pickGroup={!openPath.has(obj.id)}
            onPointerDown={(e) => handlePartPointerDown(e, obj.id)}
          />
        ))}

        {/* Hole mode: drag the edited hole; otherwise taps on a selected part's holes start editing */}
        {(() => {
          const target = holeEdit.editing
            ? currentProject.objects.find((o) => o.id === holeEdit.objectId)
            : selectedObject && supportsHoles(selectedObject.shape) && getHoles(selectedObject).length ? selectedObject : undefined;
          return target ? <HoleDragger key={target.id} object={target} editing={holeEdit.editing} /> : null;
        })()}

        {/* Active Selected Object Controls */}
        {selectedObject && !holeEdit.editing && !multiSelect && !measuring && (
          <>
            {/* Direct 3D grab & drag resize handles */}
            {activeGizmoMode === 'resize' && (selectedObjectIds.length > 1 || selectedObject.shape === 'group'
              ? <GroupResizeHandles3D ids={selectedObjectIds.length > 1 ? selectedObjectIds : [selectedObject.id]} />
              : <ResizeHandles3D object={selectedObject} />)}

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
