import { useEffect, useState } from 'react';

/** Matches iPhone portrait and other narrow viewports where stacked overlays bury the canvas. */
export const PHONE_BREAKPOINT_PX = 768;

function readIsPhone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < PHONE_BREAKPOINT_PX;
}

export function useIsPhone(): boolean {
  const [isPhone, setIsPhone] = useState(readIsPhone);

  useEffect(() => {
    const media = window.matchMedia(`(max-width: ${PHONE_BREAKPOINT_PX - 1}px)`);
    const sync = () => setIsPhone(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  return isPhone;
}
