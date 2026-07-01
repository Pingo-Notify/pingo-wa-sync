import { describe, it, expect } from 'vitest';
import { isAllowedOrigin, isAllowedApiUrl } from '../src/lib/origins';

describe('isAllowedOrigin', () => {
  it('accepts pingonotify.com and its subdomains', () => {
    expect(isAllowedOrigin('https://pingonotify.com')).toBe(true);
    expect(isAllowedOrigin('https://app.pingonotify.com')).toBe(true);
    expect(isAllowedOrigin('https://www.pingonotify.com')).toBe(true);
  });

  it('accepts localhost for development (any port)', () => {
    expect(isAllowedOrigin('http://localhost')).toBe(true);
    expect(isAllowedOrigin('http://localhost:3001')).toBe(true);
    expect(isAllowedOrigin('http://127.0.0.1:4000')).toBe(true);
  });

  it('rejects any other origin, including look-alikes', () => {
    expect(isAllowedOrigin('https://evil.com')).toBe(false);
    expect(isAllowedOrigin('https://pingonotify.com.evil.com')).toBe(false);
    expect(isAllowedOrigin('https://notpingonotify.com')).toBe(false);
    expect(isAllowedOrigin('https://pingonotify.evil.com')).toBe(false);
  });

  it('rejects empty/invalid input', () => {
    expect(isAllowedOrigin(undefined)).toBe(false);
    expect(isAllowedOrigin(null)).toBe(false);
    expect(isAllowedOrigin('')).toBe(false);
    expect(isAllowedOrigin('not a url')).toBe(false);
  });
});

describe('isAllowedApiUrl', () => {
  it('accepts http(s) URLs on a Pingo host', () => {
    expect(isAllowedApiUrl('https://app.pingonotify.com/v3/connections/sync-session/complete')).toBe(true);
    expect(isAllowedApiUrl('http://localhost:4000/v3/connections/sync-session/complete')).toBe(true);
  });

  it('rejects non-Pingo hosts and non-http(s) schemes', () => {
    expect(isAllowedApiUrl('https://evil.com/steal')).toBe(false);
    expect(isAllowedApiUrl('https://pingonotify.com.evil.com/steal')).toBe(false);
    expect(isAllowedApiUrl('ftp://localhost/x')).toBe(false);
    expect(isAllowedApiUrl('file:///etc/passwd')).toBe(false);
  });

  it('rejects empty/invalid input', () => {
    expect(isAllowedApiUrl(undefined)).toBe(false);
    expect(isAllowedApiUrl('')).toBe(false);
    expect(isAllowedApiUrl('nonsense')).toBe(false);
  });
});
