import React, { useEffect, useState } from 'react';
import { Box } from 'lucide-react';
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
import { SidebarNav } from './components/sidebar/SidebarNav';
import { ObjectInspector } from './components/inspector/ObjectInspector';
import { CutListDrawer } from './components/modals/CutListDrawer';
import { BuiltInSheet } from './builtins/BuiltInSheet';
import { GroupBar } from './components/layout/GroupBar';
import { MeasureBar } from './measure/MeasureBar';
import { useMeasure } from './measure/useMeasure';
import { HoleModeBar } from './components/layout/HoleModeBar';
import { useUndoShortcuts } from './components/layout/UndoRedoButtons';
import { HomeScreen } from './components/home/HomeScreen';
import { TransformMenu } from './components/layout/TransformMenu';
import { ShareSheet } from './components/share/ShareSheet';
import { JoinSheet } from './joinery/JoinSheet';

export const App: React.FC = () => {
  useUndoShortcuts();
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
    setOverlayOpen('materials', false);
  }, [selectedObjectId, isPhone, currentView, setOverlayOpen]);

  if (currentView === 'home') {
    return <HomeScreen />;
  }

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


      {!isPhone && (
        <>
          <SidebarNav />
          <ObjectInspector />
        </>
      )}

      <TransformMenu />

      <BuiltInSheet />
      <JoinSheet />
      <MeasureOrGroupBar />
      <HoleModeBar />

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

/** The tape measure (or a selected dimension) takes the top bar; otherwise groups. */
function MeasureOrGroupBar() {
  const busy = useMeasure((m) => m.active || Boolean(m.selectedId));
  return busy ? <MeasureBar /> : <GroupBar />;
}
