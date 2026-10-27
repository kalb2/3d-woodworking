import { Capacitor, registerPlugin } from '@capacitor/core';
import type { OnDeviceBridge, OnDeviceCall, OnDeviceStatus } from '../ai/onDevice';

interface OnDeviceAIPlugin {
  status(): Promise<OnDeviceStatus>;
  plan(o: OnDeviceCall): Promise<{ json: string }>;
  boards(o: OnDeviceCall): Promise<{ json: string }>;
  selfTest(): Promise<{ requested: boolean }>;
}

const notIos = async (): Promise<never> => { throw Object.assign(new Error('Apple Intelligence works in the iPhone and iPad app.'), { code: 'unavailable' }); };
const OnDeviceAI = registerPlugin<OnDeviceAIPlugin>('OnDeviceAI', {
  web: { status: async () => ({ available: false, reason: 'not_ios' }), plan: notIos, boards: notIos, selfTest: async () => ({ requested: false }) },
});

/** The native bridge on iOS; null elsewhere. An older app build without the plugin reports unavailable. */
export function onDeviceBridge(): OnDeviceBridge | null {
  if (Capacitor.getPlatform() !== 'ios') return null;
  return {
    status: () => OnDeviceAI.status().catch((): OnDeviceStatus => ({ available: false, reason: 'unavailable' })),
    plan: (o) => OnDeviceAI.plan(o),
    boards: (o) => OnDeviceAI.boards(o),
  };
}

/** Debug builds launched with WB_AI_SELFTEST=1. */
export function aiSelfTestRequested(): Promise<boolean> {
  if (Capacitor.getPlatform() !== 'ios') return Promise.resolve(false);
  return OnDeviceAI.selfTest().then((r) => r.requested).catch(() => false);
}
