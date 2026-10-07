import React, { useEffect, useState } from 'react';
import { Box, SlidersHorizontal } from 'lucide-react';
import { useProjectStore } from './state/useProjectStore';
import { useAccountStore } from './state/useAccountStore';
import { useAppStore } from './state/useAppStore';
import { useIsPhone } from './hooks/useIsPhone';
import { FurnitureCanvas } from './components/viewport/FurnitureCanvas';
import { IPadHeader } from './components/layout/iPadHeader';
import { OverlayLaunchTab } from './components/layout/OverlayChrome';
import {
  PhoneBottomSheet,
  PhoneCanvasHeader,
  PhoneMenuSheet,
} from './components/layout/PhoneCanvasChrome';
import { WorkshopSettings } from './components/layout/WorkshopSettings';
import { SidebarNav } from './components/sidebar/SidebarNav';
import { ObjectInspector } from './components/inspector/ObjectInspector';
import { CutListDrawer } from './components/modals/CutListDrawer';
import { HomeScreen } from './components/home/HomeScreen';
import { TransformMenu } from './components/layout/TransformMenu';
import { ShareSheet } from './components/share/ShareSheet';

export const App: React.FC = () => {
  const { loadProjects, selectedObjectId, projects, activeProjectId } = useProjectStore();
  const loadSession = useAccountStore((state) => state.loadSession);
  const {
    currentView,
    loadPreferences,
    overlays,
    openOverlay,
    setSidebarPanel,
    resetOverlaysForLayout,
    setOverlayOpen,
    dismissOverlays,
  } = useAppStore();
  const isPhone = useIsPhone();
  const [isCutListOpen, setIsCutListOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);

  useEffect(() => {
    loadProjects();
    loadPreferences();
    void loadSession();
  }, [loadProjects, loadPreferences, loadSession]);

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
    overlays.menu ||
    overlays.settings;
  const showDesktopLaunchers = !isPhone;

  return (
    <div className={`editor-root${isPhone ? ' is-phone' : ''}`}>
      {/* 3D Furniture Viewport */}
      <FurnitureCanvas />

      {anyOverlayOpen && (
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
          onOpenCutList={() => setIsCutListOpen(true)}
          onShareProject={() => setIsShareOpen(true)}
        />
      )}

      {isPhone && (
        <>
          <PhoneBottomSheet>
            <SidebarNav />
            <ObjectInspector />
          </PhoneBottomSheet>
          <PhoneMenuSheet
            onOpenCutList={() => setIsCutListOpen(true)}
            onShareProject={() => setIsShareOpen(true)}
          />
        </>
      )}

      {showDesktopLaunchers && !overlays.sidebar && (
        <OverlayLaunchTab
          label="Shapes"
          icon={<Box size={16} color="#e09f3e" />}
          placement="left"
          onOpen={() => {
            setSidebarPanel('shapes');
            openOverlay('sidebar', isPhone);
          }}
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

      {!isPhone && (
        <>
          <SidebarNav />
          <ObjectInspector />
          <WorkshopSettings />
        </>
      )}

      <TransformMenu />

      <CutListDrawer
        isOpen={isCutListOpen}
        onClose={() => setIsCutListOpen(false)}
      />

      <ShareSheet
        project={isShareOpen ? (projects.find((project) => project.id === activeProjectId) ?? null) : null}
        onClose={() => setIsShareOpen(false)}
      />
    </div>
  );
};

export default App;
