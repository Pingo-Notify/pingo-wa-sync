import { describe, it, expect } from 'vitest';
import { parseConfigMessage, mergeConfig, isConfigComplete, sanitizeReturnUrl } from '../src/lib/config';

describe('parseConfigMessage', () => {
  it('rejects non-objects and wrong source', () => {
    expect(parseConfigMessage(null)).toBeNull();
    expect(parseConfigMessage('x')).toBeNull();
    expect(parseConfigMessage({ source: 'OTHER', payload: { name: 'a' } })).toBeNull();
  });

  it('extracts name/apiUrl/authorization from payload', () => {
    const r = parseConfigMessage({
      source: 'WA_SYNC_CONFIG',
      payload: { name: 'Bot', apiUrl: 'https://api.x/y', authorization: 'Bearer abc' },
    });
    expect(r).toEqual({ name: 'Bot', apiUrl: 'https://api.x/y', authorization: 'Bearer abc' });
  });

  it('accepts aliases API_URL / Authorization / Nome and top-level fields', () => {
    const r = parseConfigMessage({
      source: 'WA_SYNC_CONFIG',
      Nome: 'Bot',
      API_URL: 'https://api.x',
      Authorization: 'token',
    });
    expect(r).toEqual({ name: 'Bot', apiUrl: 'https://api.x', authorization: 'token' });
  });

  it('trims and ignores empty strings', () => {
    const r = parseConfigMessage({ source: 'WA_SYNC_CONFIG', payload: { name: '  Bot  ', apiUrl: '   ' } });
    expect(r).toEqual({ name: 'Bot' });
  });

  it('returns null when no recognized field', () => {
    expect(parseConfigMessage({ source: 'WA_SYNC_CONFIG', payload: { foo: 'bar' } })).toBeNull();
  });

  it('accepts a partial update (single field)', () => {
    expect(parseConfigMessage({ source: 'WA_SYNC_CONFIG', payload: { apiUrl: 'https://a' } })).toEqual({
      apiUrl: 'https://a',
    });
  });

  it('extracts returnUrl (and its aliases)', () => {
    expect(
      parseConfigMessage({ source: 'WA_SYNC_CONFIG', payload: { returnUrl: 'https://pingo.app/back' } }),
    ).toEqual({ returnUrl: 'https://pingo.app/back' });
    expect(
      parseConfigMessage({ source: 'WA_SYNC_CONFIG', payload: { return_url: 'https://pingo.app/x' } }),
    ).toEqual({ returnUrl: 'https://pingo.app/x' });
  });
});

describe('sanitizeReturnUrl', () => {
  it('keeps an http(s) returnUrl under the sender origin', () => {
    const c = { returnUrl: 'https://pingo.app/back' };
    expect(sanitizeReturnUrl(c, 'https://pingo.app')).toEqual(c);
  });
  it('drops a returnUrl on a different origin (anti open-redirect)', () => {
    const c = { name: 'A', returnUrl: 'https://evil.com/x' };
    expect(sanitizeReturnUrl(c, 'https://pingo.app')).toEqual({ name: 'A' });
  });
  it('drops a non-http(s) returnUrl', () => {
    expect(sanitizeReturnUrl({ returnUrl: 'javascript:alert(1)' }, undefined)).toEqual({});
  });
  it('keeps any http(s) returnUrl when no sender origin is known', () => {
    const c = { returnUrl: 'https://pingo.app/back' };
    expect(sanitizeReturnUrl(c, undefined)).toEqual(c);
  });
  it('is a no-op when there is no returnUrl', () => {
    expect(sanitizeReturnUrl({ name: 'A' }, 'https://pingo.app')).toEqual({ name: 'A' });
  });
});

describe('mergeConfig', () => {
  it('updates fields and preserves the missing ones', () => {
    const base = { name: 'A', apiUrl: 'u1', authorization: 't1' };
    expect(mergeConfig(base, { apiUrl: 'u2' })).toEqual({ name: 'A', apiUrl: 'u2', authorization: 't1' });
  });
  it('fills in from empty', () => {
    expect(mergeConfig({}, { name: 'A' })).toEqual({ name: 'A', apiUrl: undefined, authorization: undefined });
  });
});

describe('isConfigComplete', () => {
  it('true only with all three fields', () => {
    expect(isConfigComplete({ name: 'A', apiUrl: 'u', authorization: 't' })).toBe(true);
  });
  it('false if any is missing', () => {
    expect(isConfigComplete({ name: 'A', apiUrl: 'u' })).toBe(false);
    expect(isConfigComplete({})).toBe(false);
    expect(isConfigComplete({ name: '', apiUrl: 'u', authorization: 't' })).toBe(false);
  });
});
