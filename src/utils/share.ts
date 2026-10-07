import type { FurnitureProject } from '../types/furniture';

const DEVICE_SHARES_KEY = 'workbench_local_shares_v1';

/**
 * Offline-first share for Capacitor.
 *
 * Live:
 * - JSON share payload (copy, download, paste-to-import)
 * - System share sheet via navigator.share when the WebView provides it (iOS does)
 * - "Publish on this device" writes a snapshot into localStorage for the Community tab
 *
 * Stubbed (no backend in this build):
 * - Public https links and accounts
 * - A remote community feed
 * - Cross-device sync of published items
 */
export interface DeviceShare {
  id: string;
  title: string;
  sharedAt: number;
  source: 'device';
  project: FurnitureProject;
}

export interface SharePayload {
  formatVersion: 1;
  kind: 'workbench-share';
  exportedAt: string;
  project: FurnitureProject;
}

export function buildSharePayload(project: FurnitureProject): SharePayload {
  return {
    formatVersion: 1,
    kind: 'workbench-share',
    exportedAt: new Date().toISOString(),
    project,
  };
}

export function sharePayloadString(project: FurnitureProject): string {
  return JSON.stringify(buildSharePayload(project), null, 2);
}

export function canUseSystemShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

export async function systemShareProject(
  project: FurnitureProject,
): Promise<'shared' | 'cancelled' | 'unavailable' | 'failed'> {
  if (!canUseSystemShare()) return 'unavailable';
  try {
    await navigator.share({
      title: project.name,
      text: sharePayloadString(project),
    });
    return 'shared';
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
    return 'failed';
  }
}

function readShares(): DeviceShare[] {
  try {
    const raw = localStorage.getItem(DEVICE_SHARES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && typeof item.id === 'string' && item.project);
  } catch {
    return [];
  }
}

function writeShares(shares: DeviceShare[]) {
  localStorage.setItem(DEVICE_SHARES_KEY, JSON.stringify(shares));
}

export function listDeviceShares(): DeviceShare[] {
  return readShares().sort((a, b) => b.sharedAt - a.sharedAt);
}

export function publishDeviceShare(project: FurnitureProject): DeviceShare {
  const snapshot = JSON.parse(JSON.stringify(project)) as FurnitureProject;
  const share: DeviceShare = {
    id: `share_${Date.now()}`,
    title: snapshot.name,
    sharedAt: Date.now(),
    source: 'device',
    project: snapshot,
  };
  const next = [share, ...readShares()].slice(0, 40);
  writeShares(next);
  return share;
}

export function removeDeviceShare(id: string) {
  writeShares(readShares().filter((share) => share.id !== id));
}
