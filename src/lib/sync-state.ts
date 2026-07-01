import type { SyncConfig, SyncGuardState } from '../types';
import { isConfigComplete } from './config';

/** Default cooldown: do not re-send the same session (wid) within 60s. */
export const DEFAULT_COOLDOWN_MS = 60_000;

/**
 * Decide whether to sync now:
 *  - config must be complete;
 *  - if this wid was synced recently (< cooldown), skip;
 *  - if the wid is unknown, allow (best-effort).
 */
export function shouldSync(
  config: SyncConfig,
  currentWid: string | null,
  state: SyncGuardState,
  now: number,
  cooldownMs: number = DEFAULT_COOLDOWN_MS,
): boolean {
  if (!isConfigComplete(config)) return false;
  if (!currentWid) return true;
  if (
    state.lastSyncedWid === currentWid &&
    typeof state.lastSyncedAt === 'number' &&
    now - state.lastSyncedAt < cooldownMs
  ) {
    return false;
  }
  return true;
}
