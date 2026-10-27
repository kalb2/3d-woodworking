import { AI_ERROR_TEXT, AiRequestError, aiMockEnabled, requestSpec, type AiClientError } from './client';
import { ON_DEVICE_REASON_TEXT, OnDeviceError, onDeviceGenerate, type OnDeviceBridge, type OnDeviceReason } from './onDevice';
import { MAX_PROMPT, type AiSpec } from './spec';

/**
 * Which AI makes the design: Apple's on-device model first (free, private),
 * then the Workbench cloud (Workers AI on the sync Worker). The sheet shows a
 * one-line label for the source.
 */

export type AiSource = 'on-device' | 'cloud' | 'mock';

export const AI_SOURCE_LABEL: Record<AiSource, string> = {
  'on-device': 'Made on this device with Apple Intelligence',
  cloud: 'Made with the Workbench cloud AI',
  mock: 'Sample design (mock mode)',
};

export interface RouteDeps {
  /** Null off iOS. */
  onDevice: OnDeviceBridge | null;
  cloud: (prompt: string, current: AiSpec | null) => Promise<AiSpec>;
  mock: boolean;
}

/** Cloud errors that mean "the cloud can't be used here", not "it tried and failed". */
const CLOUD_UNAVAILABLE = new Set<AiClientError>(['not_configured', 'network', 'sign_in']);

export async function generateSpec(prompt: string, current: AiSpec | null, deps: RouteDeps): Promise<{ spec: AiSpec; source: AiSource }> {
  const text = prompt.trim();
  if (text.length > MAX_PROMPT) throw new AiRequestError('too_long');
  if (deps.mock) return { spec: await deps.cloud(text, current), source: 'mock' };

  let reason: OnDeviceReason = 'not_ios';
  let onDeviceFailure: OnDeviceError | null = null;
  if (deps.onDevice) {
    const status = await deps.onDevice.status().catch(() => ({ available: false, reason: 'unavailable' as const }));
    if (status.available) {
      try {
        return { spec: await onDeviceGenerate(text, current, deps.onDevice), source: 'on-device' };
      } catch (e) {
        onDeviceFailure = e instanceof OnDeviceError ? e : new OnDeviceError('failed', 'The on-device model failed.');
      }
    } else {
      reason = status.reason ?? 'unavailable';
    }
  }

  try {
    return { spec: await deps.cloud(text, current), source: 'cloud' };
  } catch (e) {
    const err = e instanceof AiRequestError ? e : new AiRequestError('server');
    if (!CLOUD_UNAVAILABLE.has(err.code)) throw err;
    const device = onDeviceFailure ? onDeviceFailure.message : ON_DEVICE_REASON_TEXT[reason];
    throw new AiRequestError('unavailable', `Describe it can't run right now. ${device} ${AI_ERROR_TEXT[err.code]}`);
  }
}

/** The app's wiring: the native bridge, the Worker, and mock mode. */
export async function describeSpec(prompt: string, current: AiSpec | null): Promise<{ spec: AiSpec; source: AiSource }> {
  const { onDeviceBridge } = await import('../native/onDeviceAi');
  const mock = aiMockEnabled();
  return generateSpec(prompt, current, { onDevice: mock ? null : onDeviceBridge(), cloud: (p, c) => requestSpec(p, c, { mock }), mock });
}
