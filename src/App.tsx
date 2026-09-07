import React, { useEffect, useState } from 'react';
import { useProjectStore } from './state/useProjectStore';
import { useAppStore } from './state/useAppStore';
import { FurnitureCanvas } from './components/viewport/FurnitureCanvas';
import { IPadHeader } from './components/layout/iPadHeader';
import { SidebarNav } from './components/sidebar/SidebarNav';
import { ObjectInspector } from './components/inspector/ObjectInspector';
import { MaterialPicker } from './components/inspector/MaterialPicker';
import { ProjectModal } from './components/modals/ProjectModal';
import { CutListDrawer } from './components/modals/CutListDrawer';
import { HomeScreen } from './components/home/HomeScreen';

export const App: React.FC = () => {
  const { loadProjects } = useProjectStore();
  const { currentView, loadPreferences } = useAppStore();
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [isCutListOpen, setIsCutListOpen] = useState(false);

  useEffect(() => {
    loadProjects();
    loadPreferences();
  }, [loadProjects, loadPreferences]);

  if (currentView === 'home') {
    return <HomeScreen />;
  }

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden' }}>
      {/* 3D Furniture Viewport */}
      <FurnitureCanvas />

      {/* iPad Top Header Toolbar */}
      <IPadHeader
        onOpenProjectModal={() => setIsProjectModalOpen(true)}
        onOpenCutList={() => setIsCutListOpen(true)}
      />

      {/* Left Drawer Navigation (Shapes, Templates, Scene) */}
      <SidebarNav />

      {/* Right Inspector Panel (Numeric Dimensions, Rotation, Position) */}
      <ObjectInspector />

      {/* Bottom Right Real Wood Material Palette */}
      <MaterialPicker />

      {/* Modals */}
      <ProjectModal
        isOpen={isProjectModalOpen}
        onClose={() => setIsProjectModalOpen(false)}
      />

      <CutListDrawer
        isOpen={isCutListOpen}
        onClose={() => setIsCutListOpen(false)}
      />
    </div>
  );
};

export default App;
