import { describe, it, expect } from 'vitest';
import { stageView, isSyncStage } from '../src/lib/sync-stage';
import type { SyncStage } from '../src/types';

const ALL: SyncStage[] = [
  'init',
  'payload-loaded',
  'payload-missing',
  'loading',
  'redirecting',
  'error',
];

describe('isSyncStage', () => {
  it('accepts every known stage', () => {
    for (const s of ALL) expect(isSyncStage(s)).toBe(true);
  });
  it('rejects anything else', () => {
    expect(isSyncStage('done')).toBe(false);
    expect(isSyncStage('')).toBe(false);
    expect(isSyncStage(undefined)).toBe(false);
    expect(isSyncStage(42)).toBe(false);
  });
});

describe('stageView', () => {
  it('returns copy + kind + ttl for every stage', () => {
    for (const s of ALL) {
      const v = stageView(s);
      expect(v.title).toMatch(/Wa Sync/);
      expect(v.subtitle.length).toBeGreaterThan(0);
      expect(['working', 'success', 'idle', 'error']).toContain(v.kind);
      expect(v.ttl).toBeGreaterThanOrEqual(0);
    }
  });

  it('keeps working stages up until superseded (ttl 0)', () => {
    expect(stageView('payload-loaded').ttl).toBe(0);
    expect(stageView('loading').ttl).toBe(0);
    expect(stageView('redirecting').ttl).toBe(0);
  });

  it('auto-dismisses terminal stages (ttl > 0)', () => {
    expect(stageView('init').ttl).toBeGreaterThan(0);
    expect(stageView('payload-missing').ttl).toBeGreaterThan(0);
    expect(stageView('error').ttl).toBeGreaterThan(0);
  });

  it('maps kinds sensibly', () => {
    expect(stageView('redirecting').kind).toBe('success');
    expect(stageView('payload-missing').kind).toBe('idle');
    expect(stageView('error').kind).toBe('error');
  });
});
