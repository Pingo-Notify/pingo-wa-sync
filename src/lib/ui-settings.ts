import { UI_SETTINGS_KEY, type UiSettings } from '../types';

export const DEFAULT_UI_SETTINGS: UiSettings = { toastEnabled: true };

/** Coerce whatever is in storage into a valid UiSettings, filling defaults. */
export function normalizeUiSettings(raw: unknown): UiSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_UI_SETTINGS };
  const r = raw as Record<string, unknown>;
  return {
    toastEnabled:
      typeof r.toastEnabled === 'boolean' ? r.toastEnabled : DEFAULT_UI_SETTINGS.toastEnabled,
  };
}

export async function getUiSettings(): Promise<UiSettings> {
  const r = await chrome.storage.local.get(UI_SETTINGS_KEY);
  return normalizeUiSettings(r[UI_SETTINGS_KEY]);
}

export async function setUiSettings(s: UiSettings): Promise<void> {
  await chrome.storage.local.set({ [UI_SETTINGS_KEY]: s });
}
