import { describe, it, expect } from 'vitest';
import { computeLoggedIn } from '../src/lib/detect';

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
