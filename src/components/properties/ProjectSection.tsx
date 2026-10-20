import React, { useEffect, useState } from 'react';
import { BoxSelect, Link2, List, Ruler, ScanLine, SquareDashed, Tv } from 'lucide-react';
import { useAppStore } from '../../state/useAppStore';
import { useProjectStore } from '../../state/useProjectStore';
import { useBuiltInFlow } from '../../builtins/useBuiltInFlow';
import { useMeasure } from '../../measure/useMeasure';
import { isWallScanSupported, scanWalls } from '../../native/wallScan';
import { roomFromScan } from '../../generators/roomScan';
import { DEFAULT_RESIZE_STEP, RESIZE_STEPS } from '../../utils/resizeRules';
import type { LengthUnit } from '../../types/furniture';
import { ActionRow, Row, Section, Seg, SwitchRow } from './rows';
import { useJoinFlow } from '../../joinery/useJoinFlow';
import { fitCheck } from '../../joinery/fitCheck';

const UNITS: { id: LengthUnit; label: string }[] = [
  { id: 'in', label: 'in' }, { id: 'ft', label: 'ft' }, { id: 'cm', label: 'cm' }, { id: 'mm', label: 'mm' },
];

/** Everything that belongs to this one project (moved here from ••• and the old Settings sheet). */
export const ProjectSection: React.FC = () => {
  const { openOverlay, setOverlayOpen, setSidebarPanel } = useAppStore();
  const viewStyle = useAppStore((s) => s.preferences.viewStyle ?? 'realistic');
  const updatePreferences = useAppStore((s) => s.updatePreferences);
  const { projects, activeProjectId, selectedObjectId, renameProject, setUnit, toggleFloor, updateSnapSettings } = useProjectStore();
  const project = projects.find((p) => p.id === activeProjectId);
  const [name, setName] = useState(project?.name ?? '');
  useEffect(() => setName(project?.name ?? ''), [project?.id, project?.name]);
  const [canScan, setCanScan] = useState(false);
  const [scanning, setScanning] = useState(false);
  useEffect(() => {
    let alive = true;
    void isWallScanSupported().then((ok) => { if (alive) setCanScan(ok); });
    return () => { alive = false; };
  }, []);
  if (!project) return null;

  const close = () => setOverlayOpen('inspector', false);
  const commitName = () => {
    const n = name.trim();
    if (n && n !== project.name) renameProject(project.id, n);
    else setName(project.name);
  };
  const magnetOn = project.snapSettings.enabled;
  const imperial = project.unit === 'in' || project.unit === 'ft';
  const hasRoom = Boolean(project.scannedRoom?.walls.length);
  const roomLocked = project.roomLocked !== false;
  const hasBuiltIns = project.objects.some((o) => o.shape === 'group' && o.builtIn);
  const byId = new Map(project.objects.map((o) => [o.id, o]));
  const joints = (project.joints ?? []).filter((j) => byId.has(j.receiverId) && byId.has(j.materId));
  const needLook = joints.filter((j) => fitCheck(j, byId.get(j.receiverId), byId.get(j.materId), project.unit).status !== 'fits').length;

  const scanRoom = () => {
    if (scanning) return;
    if (hasRoom && !window.confirm('Replace scanned room? Your parts and built-ins stay.')) return;
    setScanning(true);
    close();
    void scanWalls()
      .then((result) => {
        if (!useProjectStore.getState().addScannedRoom(roomFromScan(result))) {
          window.alert('No walls found. Try scanning again.');
          return;
        }
        useBuiltInFlow.getState().requestFrame();
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        if (!/cancel/i.test(msg)) window.alert(`Scan failed: ${msg}`);
      })
      .finally(() => setScanning(false));
  };
  const toggleRoomLock = () => {
    const flow = useBuiltInFlow.getState();
    useProjectStore.getState().setRoomLocked(!roomLocked, roomLocked ? flow.focusWallId : null);
    if (roomLocked && flow.focusWallId) { flow.focusWall(null); close(); }
  };
  const squareUp = () => {
    if (!window.confirm('Square up walls? Lines the room up with the grid and squares near-right corners. Built-ins on walls follow; other parts stay put.')) return;
    if (useProjectStore.getState().squareUpWalls()) useBuiltInFlow.getState().requestFrame();
    close();
  };

  return (
    <>
      <Section title="Project" testId="props-project">
        <Row label="Name">
          <input className="props-input" data-testid="project-name" aria-label="Project name" value={name}
            onChange={(e) => setName(e.target.value)} onBlur={commitName}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
        </Row>
        <Row label="Units">
          <Seg label="Units" testId="project-units" value={project.unit} options={UNITS} onChange={(u) => setUnit(u)} />
        </Row>
        <Row label="Style">
          <Seg label="Style" testId="style" value={viewStyle} onChange={(v) => updatePreferences({ viewStyle: v })}
            options={[{ id: 'clean', label: 'Clean' }, { id: 'realistic', label: 'Realistic' }]} />
        </Row>
      </Section>

      <Section title="Workspace" testId="props-workspace">
        <SwitchRow label="Floor grid" testId="tool-floor" on={project.showFloor} onToggle={toggleFloor} />
        <SwitchRow label="Magnet (snap parts)" testId="tool-magnet" on={magnetOn} onToggle={() => updateSnapSettings({ enabled: !magnetOn })} />
        {magnetOn && imperial && (
          <Row label="Resize step" testId="resize-step">
            <Seg label="Resize step" testId="resize-step" value={String(project.snapSettings.resizeStep ?? DEFAULT_RESIZE_STEP)}
              options={RESIZE_STEPS.map((s) => ({ id: String(s), label: s === 0.25 ? '¼″' : '½″' }))}
              onChange={(v) => updateSnapSettings({ resizeStep: Number(v) })} />
          </Row>
        )}
      </Section>

      {(canScan || hasRoom) && (
        <Section title="Room" testId="props-room">
          {canScan && <ActionRow label={scanning ? 'Scanning…' : hasRoom ? 'Rescan room' : 'Scan room'} icon={<ScanLine size={18} />} testId="menu-scan-room" disabled={scanning} onTap={scanRoom} />}
          {hasRoom && <SwitchRow label="Lock scanned walls" testId="menu-lock-walls" on={roomLocked} onToggle={toggleRoomLock} />}
          {hasRoom && <ActionRow label="Square up walls" icon={<SquareDashed size={18} />} testId="menu-square-walls" onTap={squareUp} />}
        </Section>
      )}

      {joints.length > 0 && (
        <Section title="Joints" testId="props-project-joints">
          <ActionRow label={`${joints.length} joint${joints.length === 1 ? '' : 's'}${needLook ? ` · ${needLook} need${needLook === 1 ? 's' : ''} a look` : ' · all fit'}`}
            icon={<Link2 size={18} />} testId="menu-all-joints" onTap={() => { close(); useJoinFlow.getState().list(); }} />
        </Section>
      )}

      <Section title="Tools" testId="props-tools">
        <ActionRow label="Parts list" icon={<List size={18} />} testId="menu-parts" onTap={() => { setSidebarPanel('scene'); openOverlay('sidebar'); }} />
        <ActionRow label="Measure" icon={<Ruler size={18} />} testId="menu-measure" onTap={() => {
          close();
          useProjectStore.getState().selectObject(null);
          useMeasure.getState().start();
        }} />
        {hasBuiltIns && <ActionRow label="Built-ins" icon={<Tv size={18} />} testId="menu-builtins" onTap={() => { close(); useBuiltInFlow.getState().openList(); }} />}
        {!selectedObjectId && <ActionRow label="Select area" icon={<BoxSelect size={18} />} testId="menu-select-area" onTap={() => {
          const st = useProjectStore.getState();
          if (!st.multiSelect) st.toggleMultiSelect();
          close();
        }} />}
      </Section>
    </>
  );
};
