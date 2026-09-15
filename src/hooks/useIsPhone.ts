import { useEffect, useState } from 'react';
import { COMPACT_BREAKPOINT_PX, isCompactChrome } from '../utils/compactLayout';

/** iPhone / compact chrome — not just CSS innerWidth (unreliable in Capacitor WKWebView). */
export function useIsPhone(): boolean {
  const [isPhone, setIsPhone] = useState(isCompactChrome);

  useEffect(() => {
    const sync = () => setIsPhone(isCompactChrome());
    sync();

    const media = window.matchMedia(`(max-width: ${COMPACT_BREAKPOINT_PX - 1}px)`);
    media.addEventListener('change', sync);
    window.addEventListener('resize', sync);
    window.addEventListener('orientationchange', sync);
    window.visualViewport?.addEventListener('resize', sync);

    return () => {
      media.removeEventListener('change', sync);
      window.removeEventListener('resize', sync);
      window.removeEventListener('orientationchange', sync);
      window.visualViewport?.removeEventListener('resize', sync);
    };
  }, []);

  return isPhone;
}
