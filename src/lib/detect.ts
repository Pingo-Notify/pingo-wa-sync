import type { SyncOutcome } from '../types';

export interface LoginChecks {
  hasNoiseInfo: boolean;
  hasSignalReg: boolean;
}

export function computeLoggedIn(c: LoginChecks): boolean {
  return !!(c.hasNoiseInfo && c.hasSignalReg);
}

export function shouldStopRetrying(resp: SyncOutcome | null | undefined): boolean {
  if (resp?.ok) return true;
  const err = resp?.error ?? '';
  const recoverable =
    err.startsWith('incomplete session') ||
    err.startsWith('extract failed') ||
    err.startsWith('fetch failed');
  return !recoverable;
}
