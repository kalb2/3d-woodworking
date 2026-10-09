import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import { useProjectStore } from '../../state/useProjectStore';
import { useAppStore } from '../../state/useAppStore';
import { FurnitureMesh } from './FurnitureMesh';
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

  const { preferences } = useAppStore();

  const orbitControlsRef = useRef<any>(null);
  const currentProject = projects.find(p => p.id === activeProjectId);

  if (!currentProject) return null;

  const selectedObject = currentProject.objects.find(o => o.id === selectedObjectId);
  const bgColor = currentProject.backgroundColor || preferences.backgroundColor || '#f8fafc';

  const clearSelection = () => {
    if (editingGroupId) exitGroup();
    else selectObject(null);
  };

  const handleCanvasClick = (e: any) => {
    if (e.target === e.currentTarget) clearSelection();
  };

  const handlePartPointerDown = (event: any, objId: string) => {
    event.stopPropagation();
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

        {/* Render all furniture objects in active project */}
        {currentProject.objects.map((obj) => (
          <FurnitureMesh
            key={obj.id}
            object={obj}
            isSelected={selectedObjectIds.includes(obj.id)}
            pickGroup={editingGroupId !== obj.id}
            onPointerDown={obj.generator === 'room-scan' ? undefined : (e) => handlePartPointerDown(e, obj.id)}
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
