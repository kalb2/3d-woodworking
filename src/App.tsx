import React, { useEffect, useState } from 'react';
import { Box, Palette, SlidersHorizontal } from 'lucide-react';
import { useProjectStore } from './state/useProjectStore';
import { useAppStore } from './state/useAppStore';
import { useIsPhone } from './hooks/useIsPhone';
import { FurnitureCanvas } from './components/viewport/FurnitureCanvas';
import { IPadHeader } from './components/layout/iPadHeader';
import { CanvasReturnButton, OverlayLaunchTab } from './components/layout/OverlayChrome';
import {
  PhoneBottomSheet,
  PhoneCanvasHeader,
  PhoneMenuSheet,
  PhoneToolsSheet,
} from './components/layout/PhoneCanvasChrome';
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
    dismissOverlays,
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
  const anyOverlayOpen =
    overlays.sidebar ||
    overlays.inspector ||
    overlays.materials ||
    overlays.tools ||
    overlays.menu;
  const showDesktopLaunchers = !isPhone;

  return (
    <div className={`editor-root${isPhone ? ' is-phone' : ''}`}>
      {/* 3D Furniture Viewport */}
      <FurnitureCanvas />

      {isPhone && anyOverlayOpen && (
        <div
          className="overlay-backdrop"
          data-testid="overlay-backdrop"
          onPointerUp={(event) => {
            event.preventDefault();
            event.stopPropagation();
            dismissOverlays();
          }}
        />
      )}

      {isPhone ? (
        <PhoneCanvasHeader />
      ) : (
        <IPadHeader
          onOpenProjectModal={() => setIsProjectModalOpen(true)}
          onOpenCutList={() => setIsCutListOpen(true)}
        />
      )}

      {isPhone && (
        <>
          <PhoneBottomSheet hasSelection={hasSelection}>
            <SidebarNav />
            <PhoneToolsSheet />
            <ObjectInspector />
            <MaterialPicker />
          </PhoneBottomSheet>
          <PhoneMenuSheet
            onOpenProjectModal={() => setIsProjectModalOpen(true)}
            onOpenCutList={() => setIsCutListOpen(true)}
          />
        </>
      )}

      {showDesktopLaunchers && !overlays.sidebar && (
        <OverlayLaunchTab
          label="Shapes"
          icon={<Box size={16} color="#e09f3e" />}
          placement="left"
          onOpen={() => openOverlay('sidebar', isPhone)}
        />
      )}

      {showDesktopLaunchers && !overlays.inspector && hasSelection && (
        <OverlayLaunchTab
          label="Properties"
          icon={<SlidersHorizontal size={16} color="#e09f3e" />}
          placement="right-top"
          onOpen={() => openOverlay('inspector', isPhone)}
        />
      )}

      {showDesktopLaunchers && !overlays.materials && hasSelection && (
        <OverlayLaunchTab
          label="Finish"
          icon={<Palette size={16} color="#e09f3e" />}
          placement="right-bottom"
          onOpen={() => openOverlay('materials', isPhone)}
        />
      )}

      {anyOverlayOpen && (
        <CanvasReturnButton onHide={dismissOverlays} />
      )}

      {!isPhone && (
        <>
          <SidebarNav />
          <ObjectInspector />
          <MaterialPicker />
        </>
      )}

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
