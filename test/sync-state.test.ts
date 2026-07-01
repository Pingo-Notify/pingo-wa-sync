import { describe, it, expect } from 'vitest';
import { shouldSync, DEFAULT_COOLDOWN_MS } from '../src/lib/sync-state';

const full = { name: 'A', apiUrl: 'u', authorization: 't' };

describe('shouldSync', () => {
  it('false when the config is incomplete', () => {
    expect(shouldSync({ name: 'A' }, 'wid1', {}, 1000)).toBe(false);
  });

  it('true when complete and wid is unknown', () => {
    expect(shouldSync(full, null, {}, 1000)).toBe(true);
  });

  it('true when complete and this wid was never synced', () => {
    expect(shouldSync(full, 'wid1', {}, 1000)).toBe(true);
  });

  it('false when the same wid was synced within the cooldown', () => {
    const state = { lastSyncedWid: 'wid1', lastSyncedAt: 1000 };
    expect(shouldSync(full, 'wid1', state, 1000 + DEFAULT_COOLDOWN_MS - 1)).toBe(false);
  });

  it('true when the same wid is past the cooldown', () => {
    const state = { lastSyncedWid: 'wid1', lastSyncedAt: 1000 };
    expect(shouldSync(full, 'wid1', state, 1000 + DEFAULT_COOLDOWN_MS + 1)).toBe(true);
  });

  it('true when the wid differs from the last synced', () => {
    const state = { lastSyncedWid: 'wid1', lastSyncedAt: 1000 };
    expect(shouldSync(full, 'wid2', state, 1001)).toBe(true);
  });

  it('respects a custom cooldown', () => {
    const state = { lastSyncedWid: 'wid1', lastSyncedAt: 0 };
    expect(shouldSync(full, 'wid1', state, 500, 1000)).toBe(false);
    expect(shouldSync(full, 'wid1', state, 1500, 1000)).toBe(true);
  });
});
