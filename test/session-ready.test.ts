import { describe, it, expect } from 'vitest';
import { sessionMissingFields } from '../src/lib/session-ready';
import type { SessionExport, SignalMetaRecord, SignalStoreRow } from '../src/types';

type TestSession = SessionExport & {
  signalMeta: Record<string, SignalMetaRecord | undefined>;
  localStorage: Record<string, string | null>;
  signedPreKeys: SignalStoreRow[];
};

function completeSession(): TestSession {
  return {
    noiseCandidates: [{ privateB64: 'p', publicB64: 'q' }],
    signalStaticPrivB64: 'priv',
    signalStaticPubB64: 'pub',
    localStorage: { 'last-wid-md': '"5511999999999:1@c.us"' },
    signalMeta: {
      signal_reg_id: { value: 1234 },
      signal_next_pk_id: { value: 50 },
      signal_first_unupload_pk_id: { value: 40 },
      signal_last_spk_id: { value: 7 },
      adv_signed_identity: { value: { details: { __ab: 'x' } } },
    },
    signedPreKeys: [{ key: 7, value: { keyId: 7, keyPair: {} } }],
  };
}

describe('sessionMissingFields', () => {
  it('reports nothing missing for a complete session', () => {
    expect(sessionMissingFields(completeSession())).toEqual([]);
  });

  it('treats null/garbage as a missing session', () => {
    expect(sessionMissingFields(null)).toEqual(['session']);
    expect(sessionMissingFields(undefined)).toEqual(['session']);
    expect(sessionMissingFields('nope')).toEqual(['session']);
  });

  it('flags the signed-prekey metadata that a fresh QR login writes last', () => {
    const s = completeSession();
    s.signalMeta.signal_last_spk_id = undefined;
    s.signalMeta.signal_next_pk_id = undefined;
    s.signalMeta.signal_first_unupload_pk_id = undefined;
    const missing = sessionMissingFields(s);
    expect(missing).toContain('signalMeta.signal_last_spk_id');
    expect(missing).toContain('signalMeta.signal_next_pk_id');
    expect(missing).toContain('signalMeta.signal_first_unupload_pk_id');
    expect(missing).not.toContain('signedPreKeys[signal_last_spk_id]');
  });

  it('flags missing noise candidates', () => {
    const s = completeSession();
    s.noiseCandidates = [];
    expect(sessionMissingFields(s)).toContain('noiseCandidates');
  });

  it('flags missing signal static identity', () => {
    const s = completeSession();
    s.signalStaticPubB64 = '';
    expect(sessionMissingFields(s)).toContain('signalStatic');
  });

  it('flags a missing last-wid-md (account id)', () => {
    const s = completeSession();
    s.localStorage = {};
    expect(sessionMissingFields(s)).toContain('last-wid-md');
  });

  it('flags a missing/invalid adv_signed_identity', () => {
    const s = completeSession();
    s.signalMeta.adv_signed_identity = { value: {} };
    expect(sessionMissingFields(s)).toContain('signalMeta.adv_signed_identity');
  });

  it('flags when the signed prekey for signal_last_spk_id is not stored yet', () => {
    const s = completeSession();
    s.signedPreKeys = [{ key: 99, value: { keyId: 99, keyPair: {} } }];
    expect(sessionMissingFields(s)).toEqual(['signedPreKeys[signal_last_spk_id]']);
  });

  it('accepts id value 0 as present (not treated as missing)', () => {
    const s = completeSession();
    s.signalMeta.signal_first_unupload_pk_id = { value: 0 };
    expect(sessionMissingFields(s)).toEqual([]);
  });
});
