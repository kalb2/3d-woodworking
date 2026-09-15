import React from 'react';
import { Eye, X } from 'lucide-react';
import { fireReliableTap } from '../../utils/reliableTap';

export const PhoneSheetGrab: React.FC = () => (
  <div className="phone-sheet-grab" aria-hidden="true" />
);

interface OverlayDismissButtonProps {
  onDismiss: () => void;
  label?: string;
}

/** Obvious dismiss control — pointerup so iOS WKWebView does not drop click. */
export const OverlayDismissButton: React.FC<OverlayDismissButtonProps> = ({
  onDismiss,
  label = 'Done',
}) => (
  <button
    type="button"
    className="glass-button overlay-dismiss-btn"
    onClick={(event) => fireReliableTap(event, onDismiss)}
    onPointerUp={(event) => fireReliableTap(event, onDismiss)}
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
}) => (
  <button
    type="button"
    className={`glass-panel glass-button overlay-launch-tab overlay-launch-tab-${placement}`}
    onClick={(event) => fireReliableTap(event, onOpen)}
    onPointerUp={(event) => fireReliableTap(event, onOpen)}
    aria-label={`Open ${label}`}
    title={`Open ${label}`}
    data-testid={`overlay-launch-${label.toLowerCase()}`}
  >
    {icon}
    <span>{label}</span>
  </button>
);

interface CanvasReturnButtonProps {
  onHide: () => void;
}

/**
 * Always-on-top hide control. Sits in the iOS safe area, above the iPad header
 * z-index, so Shapes / properties / finish can still be dismissed when Done
 * is covered or the WKWebView dropped in-panel clicks.
 */
export const CanvasReturnButton: React.FC<CanvasReturnButtonProps> = ({ onHide }) => (
  <button
    type="button"
    className="glass-panel canvas-return-btn"
    onClick={(event) => fireReliableTap(event, onHide)}
    onPointerUp={(event) => fireReliableTap(event, onHide)}
    aria-label="Hide menus"
    title="Hide menus and return to the 3D canvas"
    data-testid="canvas-return"
  >
    <Eye size={18} />
    <span>Hide menus</span>
  </button>
);
