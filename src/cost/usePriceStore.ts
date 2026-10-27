import { create } from 'zustand';
import { resolvePrices, sanitizePrices, type PriceSettings, type ResolvedPrices } from './cost';
import type { FurnitureProject } from '../types/furniture';

const KEY = 'workbench_prices_v1';

function load(): PriceSettings {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    return (raw && sanitizePrices(JSON.parse(raw))) || {};
  } catch {
    return {};
  }
}

export type ExtraField = 'taxPct' | 'wastePct' | 'flat';

/**
 * Set a price in a list (or clear it with null): the list without that entry
 * falls back to the next one down (project → device → example).
 */
export function editPrices(list: PriceSettings | undefined, key: string | ExtraField, value: number | null): PriceSettings | undefined {
  const next: PriceSettings = { ...(list ?? {}), items: { ...(list?.items ?? {}) } };
  if (key === 'taxPct' || key === 'wastePct' || key === 'flat') {
    if (value == null) delete next[key]; else next[key] = value;
  } else if (value == null) delete next.items![key];
  else next.items![key] = value;
  return sanitizePrices(next);
}

interface PriceState {
  /** This device's prices (all projects). */
  device: PriceSettings;
  setDevicePrice: (key: string | ExtraField, value: number | null) => void;
  resetDevice: () => void;
}

export const usePriceStore = create<PriceState>((set, get) => {
  const save = (device: PriceSettings) => {
    set({ device });
    try { localStorage.setItem(KEY, JSON.stringify(device)); } catch { /* private mode: keep it in memory */ }
  };
  return {
    device: load(),
    setDevicePrice: (key, value) => save(editPrices(get().device, key, value) ?? {}),
    resetDevice: () => save({}),
  };
});

/** The prices a project is costed with: examples ← this device ← the project's own. */
export const pricesFor = (project: Pick<FurnitureProject, 'prices'> | undefined): ResolvedPrices =>
  resolvePrices(usePriceStore.getState().device, project?.prices);
