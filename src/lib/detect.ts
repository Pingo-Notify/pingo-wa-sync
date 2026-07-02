export interface LoginChecks {
  /** WANoiseInfo exists in localStorage (session Noise keys). */
  hasNoiseInfo: boolean;
  /** signal_reg_id exists in IndexedDB signal-storage (Signal identity). */
  hasSignalReg: boolean;
}

/**
 * A WhatsApp Web login is active when both the Noise keys and the Signal
 * identity exist. Absence = QR screen / not logged in.
 */
export function computeLoggedIn(c: LoginChecks): boolean {
  return !!(c.hasNoiseInfo && c.hasSignalReg);
}

/**
 * Given the background's response to a 'wa-logged-in' notification, decide whether
 * the content script should STOP retrying the sync for the current login.
 *
 * Right after a QR scan the encrypted session is written progressively, so the
 * first detection can happen before the session is fully extractable; a transient
 * network error can also drop the POST. In those recoverable cases the background
 * reports it and we keep retrying on the next tick (bounded by a max-attempt cap in
 * the caller). Every other outcome (synced ok, no payload stored yet, cooldown,
 * disallowed api, an HTTP error status, or an unknown error) is terminal for this
 * login, so we stop to avoid spamming the background.
 */
export function shouldStopRetrying(resp: { ok?: boolean; error?: string } | null | undefined): boolean {
  if (resp?.ok) return true;
  const err = resp?.error ?? '';
  const recoverable =
    err.startsWith('incomplete session') ||
    err.startsWith('extract failed') ||
    err.startsWith('fetch failed');
  return !recoverable;
}
