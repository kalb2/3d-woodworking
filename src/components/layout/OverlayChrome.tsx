import React from 'react';
import { X } from 'lucide-react';

interface OverlayDismissButtonProps {
  onDismiss: () => void;
  label?: string;
}

/** Obvious iOS-style dismiss control for project overlays. */
export const OverlayDismissButton: React.FC<OverlayDismissButtonProps> = ({
  onDismiss,
  label = 'Done',
}) => (
  <button
    type="button"
    className="glass-button overlay-dismiss-btn"
    onClick={onDismiss}
    aria-label={label}
    title={label}
    data-testid="overlay-dismiss"
  >
    <X size={16} />
    <span>{label}</span>
  </button>
);

interface OverlayLaunchTabProps {
  label: string;
  icon: React.ReactNode;
  onOpen: () => void;
  placement: 'left' | 'right-top' | 'right-bottom';
}

/** Compact reopen control shown after an overlay is dismissed. */
export const OverlayLaunchTab: React.FC<OverlayLaunchTabProps> = ({
  label,
  icon,
  onOpen,
  placement,
}) => {
  const positionStyle: React.CSSProperties =
    placement === 'left'
      ? { top: 88, left: 8 }
      : placement === 'right-top'
        ? { top: 88, right: 8 }
        : { bottom: 24, right: 8 };

  return (
    <button
      type="button"
      className="glass-panel glass-button overlay-launch-tab"
      style={positionStyle}
      onClick={onOpen}
      aria-label={`Open ${label}`}
      title={`Open ${label}`}
      data-testid={`overlay-launch-${label.toLowerCase()}`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
};
