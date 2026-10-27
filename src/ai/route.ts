import { AI_ERROR_TEXT, AiRequestError, aiMockEnabled, requestSpec, type AiClientError } from './client';
import { ON_DEVICE_REASON_TEXT, OnDeviceError, onDeviceGenerate, type OnDeviceBridge, type OnDeviceReason } from './onDevice';
import { MAX_PROMPT, type AiSpec } from './spec';
import { DESCRIBE_CLOUD_ENABLED } from '../config/features';

/**
 * Which AI makes the design: Apple's on-device model first (free, private),
 * then, only when DESCRIBE_CLOUD_ENABLED is on, the Workbench cloud (Workers AI
 * on the sync Worker). For 1.0 the cloud is off: on-device only, and no network
 * call. The sheet shows a one-line label for the source.
 */

/** Shown when the cloud is off and Apple Intelligence can't run here. */
export const NEEDS_APPLE_INTELLIGENCE = 'Describe it needs Apple Intelligence on this device.';

export type AiSource = 'on-device' | 'cloud' | 'mock';

export const AI_SOURCE_LABEL: Record<AiSource, string> = {
  'on-device': 'Made on this device with Apple Intelligence',
  cloud: 'Made with the Workbench cloud AI',
  mock: 'Sample design (mock mode)',
};

export interface RouteDeps {
  /** Null off iOS. */
  onDevice: OnDeviceBridge | null;
  /** Null: cloud fallback off (1.0). Mock mode still uses this for the canned design. */
  cloud: ((prompt: string, current: AiSpec | null) => Promise<AiSpec>) | null;
  mock: boolean;
}

/** Cloud errors that mean "the cloud can't be used here", not "it tried and failed". */
const CLOUD_UNAVAILABLE = new Set<AiClientError>(['not_configured', 'network', 'sign_in']);

export async function generateSpec(prompt: string, current: AiSpec | null, deps: RouteDeps): Promise<{ spec: AiSpec; source: AiSource }> {
  const text = prompt.trim();
  if (text.length > MAX_PROMPT) throw new AiRequestError('too_long');
  if (deps.mock && deps.cloud) return { spec: await deps.cloud(text, current), source: 'mock' };

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

  if (!deps.cloud) {
    // On-device only: say why, never fall back to the network.
    if (onDeviceFailure) throw new AiRequestError('unavailable', onDeviceFailure.message);
    throw new AiRequestError('unavailable', `${NEEDS_APPLE_INTELLIGENCE} ${ON_DEVICE_REASON_TEXT[reason]}`);
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

/** The cloud step for this build: off unless DESCRIBE_CLOUD_ENABLED (mock mode never calls out). */
export function cloudStep(mock: boolean, cloudEnabled = DESCRIBE_CLOUD_ENABLED): RouteDeps['cloud'] {
  if (mock) return (p, c) => requestSpec(p, c, { mock: true });
  if (!cloudEnabled) return null;
  return (p, c) => requestSpec(p, c, { mock: false });
}

/** The app's wiring: the native bridge, the Worker (if enabled), and mock mode. */
export async function describeSpec(prompt: string, current: AiSpec | null): Promise<{ spec: AiSpec; source: AiSource }> {
  const { onDeviceBridge } = await import('../native/onDeviceAi');
  const mock = aiMockEnabled();
  return generateSpec(prompt, current, { onDevice: mock ? null : onDeviceBridge(), cloud: cloudStep(mock), mock });
}
