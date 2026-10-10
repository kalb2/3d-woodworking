import { Capacitor, registerPlugin } from '@capacitor/core';
import type { ScannedOpening, ScannedWall } from '../types/furniture';

export interface RawScanWall { id: string; width: number; height: number; transform: number[] }
export interface RawScanOpening { id: string; kind: ScannedOpening['kind']; wallId: string; width: number; height: number; offsetX: number; bottom: number }
export interface WallScanResult { walls: RawScanWall[]; windows: RawScanOpening[]; doors: RawScanOpening[]; openings: RawScanOpening[] }

interface WallScanPlugin {
  isSupported(): Promise<{ supported: boolean }>;
  scan(): Promise<WallScanResult>;
}

const WallScan = registerPlugin<WallScanPlugin>('WallScan', {
  web: { isSupported: async () => ({ supported: false }), scan: async () => { throw new Error('Wall scan needs a LiDAR iPhone'); } },
});

let cached: Promise<boolean> | null = null;
/** True only on a LiDAR iOS device with RoomPlan. Never throws. */
export function isWallScanSupported(): Promise<boolean> {
  if (!cached) {
    cached = Capacitor.getPlatform() !== 'ios'
      ? Promise.resolve(false)
      : WallScan.isSupported().then((r) => !!r.supported).catch(() => false);
  }
  return cached;
}

export function scanWalls(): Promise<WallScanResult> {
  return WallScan.scan();
}

export function describeWall(w: ScannedWall): string {
  const count = (k: ScannedOpening['kind'], word: string) => {
    const n = w.openings.filter((o) => o.kind === k).length;
    return n ? `${n} ${word}${n > 1 ? 's' : ''}` : '';
  };
  const extras = [count('window', 'window'), count('door', 'door'), count('opening', 'opening')].filter(Boolean).join(', ');
  return `${w.label} — ${Math.round(w.width)}×${Math.round(w.height)} in${extras ? `, ${extras}` : ''}`;
}
