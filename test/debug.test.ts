import { describe, it, expect, afterEach } from 'vitest';
import { isDebug, setDebug } from '../src/lib/debug';

afterEach(() => setDebug(undefined)); // restore auto-detection between tests

describe('debug mode', () => {
  it('is off by default when there is no extension manifest (e.g. production/tests)', () => {
    expect(isDebug()).toBe(false);
  });
  it('can be forced on and off at runtime', () => {
    setDebug(true);
    expect(isDebug()).toBe(true);
    setDebug(false);
    expect(isDebug()).toBe(false);
  });
  it('reverts to auto-detection when the override is cleared', () => {
    setDebug(true);
    expect(isDebug()).toBe(true);
    setDebug(undefined);
    expect(isDebug()).toBe(false);
  });
});
