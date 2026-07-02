import { describe, it, expect } from 'vitest';
import { computeLoggedIn, shouldStopRetrying } from '../src/lib/detect';

describe('computeLoggedIn', () => {
  it('logged in when it has Noise + Signal', () => {
    expect(computeLoggedIn({ hasNoiseInfo: true, hasSignalReg: true })).toBe(true);
  });
  it('not logged in if either is missing', () => {
    expect(computeLoggedIn({ hasNoiseInfo: true, hasSignalReg: false })).toBe(false);
    expect(computeLoggedIn({ hasNoiseInfo: false, hasSignalReg: true })).toBe(false);
    expect(computeLoggedIn({ hasNoiseInfo: false, hasSignalReg: false })).toBe(false);
  });
});

describe('shouldStopRetrying', () => {
  it('stops when the sync succeeded', () => {
    expect(shouldStopRetrying({ ok: true, status: 200 } as any)).toBe(true);
  });
  it('retries while the session is not fully written yet', () => {
    expect(shouldStopRetrying({ ok: false, error: 'incomplete session (not logged in?)' })).toBe(false);
    expect(shouldStopRetrying({ ok: false, error: 'extract failed: boom' })).toBe(false);
  });
  it('retries on a transient network error dropping the POST', () => {
    expect(shouldStopRetrying({ ok: false, error: 'fetch failed: NetworkError' })).toBe(false);
  });
  it('stops when there is nothing to do (no payload / cooldown / disallowed api)', () => {
    expect(shouldStopRetrying({ ok: false, error: 'incomplete config' })).toBe(true);
    expect(shouldStopRetrying({ ok: false, error: 'cooldown' })).toBe(true);
    expect(shouldStopRetrying({ ok: false, error: 'api url not allowed' })).toBe(true);
  });
  it('stops on an HTTP error status (no error field) or an unknown/missing response', () => {
    expect(shouldStopRetrying({ ok: false, status: 500 } as any)).toBe(true);
    expect(shouldStopRetrying({ ok: false, error: 'something new' })).toBe(true);
    expect(shouldStopRetrying(undefined)).toBe(true);
    expect(shouldStopRetrying(null)).toBe(true);
  });
});
