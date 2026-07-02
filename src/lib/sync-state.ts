import type { SyncConfig, SyncGuardState } from '../types';
import { isConfigComplete } from './config';

export const DEFAULT_COOLDOWN_MS = 60_000;

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
