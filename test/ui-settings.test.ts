import { describe, it, expect } from 'vitest';
import { normalizeUiSettings, DEFAULT_UI_SETTINGS } from '../src/lib/ui-settings';

describe('normalizeUiSettings', () => {
  it('defaults to enabled when nothing is stored', () => {
    expect(normalizeUiSettings(undefined)).toEqual({ toastEnabled: true });
    expect(normalizeUiSettings(null)).toEqual({ toastEnabled: true });
    expect(normalizeUiSettings('x')).toEqual({ toastEnabled: true });
  });

  it('keeps an explicit boolean', () => {
    expect(normalizeUiSettings({ toastEnabled: false })).toEqual({ toastEnabled: false });
    expect(normalizeUiSettings({ toastEnabled: true })).toEqual({ toastEnabled: true });
  });

  it('falls back to the default for a non-boolean value', () => {
    expect(normalizeUiSettings({ toastEnabled: 'no' })).toEqual({ toastEnabled: true });
    expect(normalizeUiSettings({})).toEqual({ toastEnabled: true });
  });

  it('returns a fresh copy, never the shared default object', () => {
    const out = normalizeUiSettings(undefined);
    expect(out).not.toBe(DEFAULT_UI_SETTINGS);
  });
});
