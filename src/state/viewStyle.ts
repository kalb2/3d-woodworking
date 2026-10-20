/** Clean = flat colors + outlines; Realistic = grain + shadows. Stored per project. */
export type ViewStyle = 'clean' | 'realistic';

/** What the app shipped with before the style was per project. */
export const DEFAULT_VIEW_STYLE: ViewStyle = 'realistic';

/** Same key as useAppStore's preferences (kept separate so the project store does not import the app store). */
const APP_PREFS_KEY = 'ipad_3d_furniture_app_prefs_v1';

export const isViewStyle = (v: unknown): v is ViewStyle => v === 'clean' || v === 'realistic';

/**
 * The style saved in app preferences: the old app-wide setting, and since per-project styles,
 * the last style picked. Old projects adopt it once; new projects start with it.
 */
export function savedAppStyle(): ViewStyle {
  try {
    const v = JSON.parse(localStorage.getItem(APP_PREFS_KEY) || '{}')?.viewStyle;
    return isViewStyle(v) ? v : DEFAULT_VIEW_STYLE;
  } catch {
    return DEFAULT_VIEW_STYLE;
  }
}

/** A project's render style (stamped on load, so the fallback is only for safety). */
export const projectStyle = (p?: { viewStyle?: unknown } | null): ViewStyle =>
  (isViewStyle(p?.viewStyle) ? p.viewStyle : DEFAULT_VIEW_STYLE);
