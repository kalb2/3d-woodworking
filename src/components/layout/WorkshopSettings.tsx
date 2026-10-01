import React from 'react';
import { Grid, Magnet } from 'lucide-react';
import { useAppStore } from '../../state/useAppStore';
import { useProjectStore } from '../../state/useProjectStore';
import { useIsPhone } from '../../hooks/useIsPhone';
import { useReliableTap } from '../../utils/reliableTap';
import { OverlayDismissButton } from './OverlayChrome';
import { PHONE_SHEET_EMBEDDED_STYLE } from './phoneSheet';

interface SettingSwitchProps {
  testId: string;
  icon: React.ReactNode;
  label: string;
  description: string;
  on: boolean;
  onToggle: () => void;
}

const SettingSwitch: React.FC<SettingSwitchProps> = ({
  testId,
  icon,
  label,
  description,
  on,
  onToggle,
}) => {
  const onTap = useReliableTap(onToggle);
  return (
    <button
      type="button"
      className={`settings-row${on ? ' is-on' : ''}`}
      onClick={onTap}
      onPointerUp={onTap}
      role="switch"
      aria-checked={on}
      aria-label={`${label}: ${on ? 'on' : 'off'}. ${description}`}
      data-testid={testId}
    >
      <span className="settings-row-icon">{icon}</span>
      <span className="settings-row-copy">
        <strong>{label}</strong>
        <span>{description}</span>
      </span>
      <span className="settings-switch" aria-hidden="true" />
    </button>
  );
};

/** Floor and Magnet live here so the dock stays focused on building tools. */
export const WorkshopSettings: React.FC = () => {
  const isPhone = useIsPhone();
  const { overlays, setOverlayOpen } = useAppStore();
  const { projects, activeProjectId, toggleFloor, updateSnapSettings } = useProjectStore();
  const currentProject = projects.find((project) => project.id === activeProjectId);

  if (!overlays.settings || !currentProject) return null;

  const close = () => setOverlayOpen('settings', false);
  const floorOn = currentProject.showFloor;
  const magnetOn = currentProject.snapSettings.enabled;

  const toggles = (
    <div className="settings-list">
      <SettingSwitch
        testId="tool-floor"
        icon={<Grid size={18} strokeWidth={1.8} />}
        label="Floor"
        description="Workshop grid on the ground"
        on={floorOn}
        onToggle={toggleFloor}
      />
      <SettingSwitch
        testId="tool-magnet"
        icon={<Magnet size={18} strokeWidth={1.8} />}
        label="Magnet"
        description="Snap parts as you move them"
        on={magnetOn}
        onToggle={() => updateSnapSettings({ enabled: !magnetOn })}
      />
    </div>
  );

  if (isPhone) {
    return (
      <div
        className="phone-sheet-embed"
        data-testid="overlay-settings"
        style={PHONE_SHEET_EMBEDDED_STYLE}
      >
        <div className="phone-sheet-header">
          <span className="phone-sheet-title">Settings</span>
          <OverlayDismissButton onDismiss={close} />
        </div>
        {toggles}
      </div>
    );
  }

  return (
    <aside className="glass-panel workshop-settings" data-testid="overlay-settings">
      <div className="workshop-settings-header">
        <span>Settings</span>
        <OverlayDismissButton onDismiss={close} />
      </div>
      {toggles}
    </aside>
  );
};
