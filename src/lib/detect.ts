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
