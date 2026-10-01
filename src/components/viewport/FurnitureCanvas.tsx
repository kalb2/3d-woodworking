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
import { DimensionOverlay } from './DimensionOverlay';

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
      />
    </group>
  );
};

export const FurnitureCanvas: React.FC = () => {
  const {
    projects,
    activeProjectId,
    selectedObjectId,
    selectObject,
    activeGizmoMode,
    showDimensions,
  } = useProjectStore();

  const { preferences } = useAppStore();

  const orbitControlsRef = useRef<any>(null);
  const currentProject = projects.find(p => p.id === activeProjectId);

  if (!currentProject) return null;

  const selectedObject = currentProject.objects.find(o => o.id === selectedObjectId);
  const bgColor = currentProject.backgroundColor || preferences.backgroundColor || '#f8fafc';

  const handleCanvasClick = (e: any) => {
    // Deselect object if clicked background
    if (e.target === e.currentTarget) {
      selectObject(null);
    }
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
      >
        {/* Customizable canvas background color */}
        <color attach="background" args={[bgColor]} />
        {/* Soft Studio Lighting setup tuned for realistic wood textures */}
        <ambientLight intensity={0.7} />
        <directionalLight
          position={[60, 80, 50]}
          intensity={1.2}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-bias={-0.0001}
        />
        <directionalLight position={[-40, 50, -50]} intensity={0.4} />
        <pointLight position={[0, 40, 0]} intensity={0.3} />

        {/* Orbit Camera controls for iPad.
            Default touch gestures: 1-finger = orbit, 2-finger = dolly+pan.
            Gizmo handles disable controls.enabled during drag to prevent conflicts. */}
        <OrbitControls
          ref={orbitControlsRef}
          makeDefault
          enableDamping
          dampingFactor={0.08}
          minDistance={10}
          maxDistance={250}
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
            isSelected={obj.id === selectedObjectId}
            onPointerDown={(e) => {
              e.stopPropagation();
              selectObject(obj.id);
            }}
          />
        ))}

        {/* Active Selected Object Controls */}
        {selectedObject && (
          <>
            {showDimensions && (
              <DimensionOverlay
                object={selectedObject}
                unit={currentProject.unit}
              />
            )}

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
