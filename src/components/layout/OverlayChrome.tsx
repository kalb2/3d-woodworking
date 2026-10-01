import React from 'react';
import { ChevronDown, X } from 'lucide-react';
import { useReliableTap } from '../../utils/reliableTap';
import { useIsPhone } from '../../hooks/useIsPhone';

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
}) => {
  const isPhone = useIsPhone();
  const onTap = useReliableTap(onDismiss);
  return (
    <button
      type="button"
      className={isPhone ? 'phone-sheet-dismiss' : 'glass-button overlay-dismiss-btn'}
      onClick={onTap}
      onPointerUp={onTap}
      aria-label={label}
      title={label}
      data-testid="overlay-dismiss"
    >
      {isPhone ? (
        <ChevronDown size={22} strokeWidth={1.75} />
      ) : (
        <>
          <X size={16} />
          <span>{label}</span>
        </>
      )}
    </button>
  );
};

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
  const onTap = useReliableTap(onOpen);
  return (
    <button
      type="button"
      className={`glass-panel glass-button overlay-launch-tab overlay-launch-tab-${placement}`}
      onClick={onTap}
      onPointerUp={onTap}
      aria-label={`Open ${label}`}
      title={`Open ${label}`}
      data-testid={`overlay-launch-${label.toLowerCase()}`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
};
