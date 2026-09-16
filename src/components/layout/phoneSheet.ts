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

/** Content rendered inside the floating phone tool sheet — no second frame. */
export const PHONE_SHEET_EMBEDDED_STYLE: CSSProperties = {
  position: 'relative',
  top: 'auto',
  left: 'auto',
  right: 'auto',
  bottom: 'auto',
  width: '100%',
  maxHeight: 'none',
  borderRadius: 0,
  zIndex: 'auto',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  boxShadow: 'none',
  border: 'none',
  background: 'transparent',
  backdropFilter: 'none',
};

/** Standalone phone sheets (menu) — same floating card language as the tool sheet. */
export const PHONE_FLOATING_SHEET_STYLE: CSSProperties = {
  position: 'absolute',
  top: 'auto',
  left: 12,
  right: 12,
  bottom: 'calc(var(--phone-sheet-float-bottom) + var(--phone-sheet-collapsed-height) + 8px)',
  width: 'auto',
  maxHeight: 'var(--phone-sheet-max-height)',
  borderRadius: 24,
  zIndex: 52,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};
