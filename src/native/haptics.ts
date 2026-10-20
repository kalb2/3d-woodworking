import { Capacitor } from '@capacitor/core';

/** A light tick (iOS haptics in the app; a short vibrate where the web allows; else nothing). */
export async function lightHaptic(): Promise<void> {
  try {
    if (Capacitor.isNativePlatform()) {
      const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
      await Haptics.impact({ style: ImpactStyle.Light });
      return;
    }
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(10);
  } catch {
    /* no haptics here */
  }
}
