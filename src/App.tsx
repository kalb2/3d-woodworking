import React, { useEffect, useState } from 'react';
import { Box, Palette, SlidersHorizontal } from 'lucide-react';
import { useProjectStore } from './state/useProjectStore';
import { useAppStore } from './state/useAppStore';
import { useIsPhone } from './hooks/useIsPhone';
import { FurnitureCanvas } from './components/viewport/FurnitureCanvas';
import { IPadHeader } from './components/layout/iPadHeader';
import { OverlayLaunchTab } from './components/layout/OverlayChrome';
import { SidebarNav } from './components/sidebar/SidebarNav';
import { ObjectInspector } from './components/inspector/ObjectInspector';
import { MaterialPicker } from './components/inspector/MaterialPicker';
import { ProjectModal } from './components/modals/ProjectModal';
import { CutListDrawer } from './components/modals/CutListDrawer';
import { HomeScreen } from './components/home/HomeScreen';

export const App: React.FC = () => {
  const { loadProjects, selectedObjectId } = useProjectStore();
  const {
    currentView,
    loadPreferences,
    overlays,
    openOverlay,
    resetOverlaysForLayout,
    setOverlayOpen,
  } = useAppStore();
  const isPhone = useIsPhone();
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [isCutListOpen, setIsCutListOpen] = useState(false);

  useEffect(() => {
    loadProjects();
    loadPreferences();
  }, [loadProjects, loadPreferences]);

  useEffect(() => {
    if (currentView !== 'editor') return;
    resetOverlaysForLayout(isPhone);
  }, [currentView, isPhone, resetOverlaysForLayout]);

  useEffect(() => {
    if (currentView !== 'editor' || !isPhone || selectedObjectId) return;
    setOverlayOpen('inspector', false);
    setOverlayOpen('materials', false);
  }, [selectedObjectId, isPhone, currentView, setOverlayOpen]);

  if (currentView === 'home') {
    return <HomeScreen />;
  }

  const hasSelection = Boolean(selectedObjectId);
  const anyOverlayOpen = overlays.sidebar || overlays.inspector || overlays.materials;
  const showLaunchers = !isPhone || !anyOverlayOpen;

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden' }}>
      {/* 3D Furniture Viewport */}
      <FurnitureCanvas />

      {/* iPad Top Header Toolbar */}
      <IPadHeader
        onOpenProjectModal={() => setIsProjectModalOpen(true)}
        onOpenCutList={() => setIsCutListOpen(true)}
      />

      {showLaunchers && !overlays.sidebar && (
        <OverlayLaunchTab
          label="Shapes"
          icon={<Box size={16} color="#e09f3e" />}
          placement="left"
          onOpen={() => openOverlay('sidebar', isPhone)}
        />
      )}

      {showLaunchers && !overlays.inspector && hasSelection && (
        <OverlayLaunchTab
          label="Properties"
          icon={<SlidersHorizontal size={16} color="#e09f3e" />}
          placement="right-top"
          onOpen={() => openOverlay('inspector', isPhone)}
        />
      )}

      {showLaunchers && !overlays.materials && hasSelection && (
        <OverlayLaunchTab
          label="Finish"
          icon={<Palette size={16} color="#e09f3e" />}
          placement="right-bottom"
          onOpen={() => openOverlay('materials', isPhone)}
        />
      )}

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
