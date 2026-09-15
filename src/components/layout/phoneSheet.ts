import type { CSSProperties } from 'react';

/** Phone overlays sit as a bottom sheet above the dock, not as side walls. */
export const PHONE_SHEET_STYLE: CSSProperties = {
  position: 'absolute',
  top: 'auto',
  left: 0,
  right: 0,
  bottom: 'calc(var(--phone-dock-height) + env(safe-area-inset-bottom, 0px))',
  width: 'auto',
  maxHeight: 'var(--phone-sheet-max-height)',
  borderRadius: '20px 20px 0 0',
  zIndex: 40,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};
