import { create } from 'zustand';

const APP_PREFS_KEY = 'ipad_3d_furniture_app_prefs_v1';

export interface AccentColorPreset {
  id: string;
  name: string;
  color: string;
}

export const ACCENT_COLOR_PRESETS: AccentColorPreset[] = [
  { id: 'amber', name: 'Warm Amber', color: '#d97706' },
  { id: 'blue', name: 'Ocean Blue', color: '#2563eb' },
  { id: 'emerald', name: 'Emerald Forest', color: '#059669' },
  { id: 'indigo', name: 'Modern Indigo', color: '#6366f1' },
  { id: 'rose', name: 'Crimson Rose', color: '#e11d48' },
  { id: 'violet', name: 'Royal Violet', color: '#7c3aed' },
  { id: 'orange', name: 'Burnt Orange', color: '#ea580c' },
  { id: 'teal', name: 'Teal Cyan', color: '#0d9488' },
  { id: 'wood', name: 'Teak Brown', color: '#9a3412' },
  { id: 'slate', name: 'Modern Slate', color: '#475569' },
];

export interface AppPreferences {
  defaultUnit: 'in' | 'cm' | 'mm';
  defaultSnapEnabled: boolean;
  defaultFloorEnabled: boolean;
  defaultFloorOpacity: number;
  backgroundColor: string;
  accentColor: string;
}

const DEFAULT_PREFS: AppPreferences = {
  defaultUnit: 'in',
  defaultSnapEnabled: true,
  defaultFloorEnabled: true,
  defaultFloorOpacity: 0.4,
  backgroundColor: '#f8fafc',
  accentColor: '#d97706',
};

function hexToRgba(hex: string, alpha: number): string {
  const cleanHex = hex.replace('#', '');
  let r = 217, g = 119, b = 6;
  if (cleanHex.length === 6) {
    r = parseInt(cleanHex.substring(0, 2), 16);
    g = parseInt(cleanHex.substring(2, 4), 16);
    b = parseInt(cleanHex.substring(4, 6), 16);
  } else if (cleanHex.length === 3) {
    r = parseInt(cleanHex[0] + cleanHex[0], 16);
    g = parseInt(cleanHex[1] + cleanHex[1], 16);
    b = parseInt(cleanHex[2] + cleanHex[2], 16);
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function applyThemeVariables(accentColor: string) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty('--accent-primary', accentColor);
  root.style.setProperty('--accent-amber', accentColor);
  root.style.setProperty('--accent-primary-glow', hexToRgba(accentColor, 0.28));
  root.style.setProperty('--accent-amber-glow', hexToRgba(accentColor, 0.28));
  root.style.setProperty('--accent-primary-subtle', hexToRgba(accentColor, 0.1));
}

export type OverlayId = 'sidebar' | 'inspector' | 'materials';

export interface OverlayVisibility {
  sidebar: boolean;
  inspector: boolean;
  materials: boolean;
}

const ALL_OVERLAYS_OPEN: OverlayVisibility = {
  sidebar: true,
  inspector: true,
  materials: true,
};

const ALL_OVERLAYS_CLOSED: OverlayVisibility = {
  sidebar: false,
  inspector: false,
  materials: false,
};

function initialOverlayVisibility(): OverlayVisibility {
  if (typeof window !== 'undefined' && window.innerWidth < 768) {
    return { ...ALL_OVERLAYS_CLOSED };
  }
  return { ...ALL_OVERLAYS_OPEN };
}

interface AppState {
  currentView: 'home' | 'editor';
  preferences: AppPreferences;
  overlays: OverlayVisibility;

  setView: (view: 'home' | 'editor') => void;
  updatePreferences: (updates: Partial<AppPreferences>) => void;
  loadPreferences: () => void;
  setOverlayOpen: (id: OverlayId, open: boolean) => void;
  openOverlay: (id: OverlayId, exclusive?: boolean) => void;
  dismissOverlays: () => void;
  resetOverlaysForLayout: (isPhone: boolean) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  currentView: 'home',
  preferences: { ...DEFAULT_PREFS },
  overlays: initialOverlayVisibility(),

  setView: (view) => set({ currentView: view }),

  updatePreferences: (updates) => {
    const newPrefs = { ...get().preferences, ...updates };
    set({ preferences: newPrefs });
    if (newPrefs.accentColor) {
      applyThemeVariables(newPrefs.accentColor);
    }
    try {
      localStorage.setItem(APP_PREFS_KEY, JSON.stringify(newPrefs));
    } catch (err) {
      console.warn('Failed to save preferences:', err);
    }
  },

  loadPreferences: () => {
    try {
      const saved = localStorage.getItem(APP_PREFS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        const merged = { ...DEFAULT_PREFS, ...parsed };
        set({ preferences: merged });
        if (merged.accentColor) {
          applyThemeVariables(merged.accentColor);
        }
      } else {
        applyThemeVariables(DEFAULT_PREFS.accentColor);
      }
    } catch (err) {
      console.warn('Failed to load preferences:', err);
      applyThemeVariables(DEFAULT_PREFS.accentColor);
    }
  },

  setOverlayOpen: (id, open) =>
    set((state) => ({
      overlays: { ...state.overlays, [id]: open },
    })),

  openOverlay: (id, exclusive) =>
    set((state) => {
      if (!exclusive) {
        return { overlays: { ...state.overlays, [id]: true } };
      }
      return {
        overlays: {
          sidebar: id === 'sidebar',
          inspector: id === 'inspector',
          materials: id === 'materials',
        },
      };
    }),

  dismissOverlays: () => set({ overlays: { ...ALL_OVERLAYS_CLOSED } }),

  resetOverlaysForLayout: (isPhone) =>
    set({ overlays: isPhone ? { ...ALL_OVERLAYS_CLOSED } : { ...ALL_OVERLAYS_OPEN } }),
}));
