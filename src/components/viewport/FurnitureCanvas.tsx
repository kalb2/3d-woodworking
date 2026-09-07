import React, { useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, ContactShadows } from '@react-three/drei';
import { useProjectStore } from '../../state/useProjectStore';
import { useAppStore } from '../../state/useAppStore';
import { FurnitureMesh } from './FurnitureMesh';
import { TransparentFloor } from './TransparentFloor';
import { TouchGizmo3D } from './TouchGizmo3D';
import { ResizeHandles3D } from './ResizeHandles3D';
import { DimensionOverlay } from './DimensionOverlay';

export const FurnitureCanvas: React.FC = () => {
  const {
    projects,
    activeProjectId,
    selectedObjectId,
    selectObject,
    activeGizmoMode
  } = useProjectStore();

  const { preferences } = useAppStore();

  const orbitControlsRef = useRef<any>(null);
  const currentProject = projects.find(p => p.id === activeProjectId);

  if (!currentProject) return null;

  const selectedObject = currentProject.objects.find(o => o.id === selectedObjectId);
  const bgColor = currentProject.backgroundColor || preferences.backgroundColor || '#0f1117';

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
        camera={{ position: [50, 45, 65], fov: 45 }}
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

        {/* See-through floor & grid */}
        <TransparentFloor
          visible={currentProject.showFloor}
          opacity={currentProject.floorOpacity}
        />

        {/* Dynamic shadow ground contact */}
        <ContactShadows
          position={[0, 0, 0]}
          opacity={0.6}
          scale={120}
          blur={2}
          far={10}
        />

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
            {/* Dimension callout HUD overlay */}
            <DimensionOverlay
              object={selectedObject}
              unit={currentProject.unit}
            />

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
