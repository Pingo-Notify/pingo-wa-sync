/**
 * Debug mode — verbose logging that is ON only in development.
 *
 * "Development" is detected automatically: an extension loaded unpacked has no
 * `update_url` in its manifest (Chrome adds it only for packed / Web Store
 * installs). So the same build logs verbosely while you develop (loaded unpacked)
 * and stays silent in production, with no separate build step. It can also be
 * forced on/off at runtime via setDebug() — e.g. to debug a packed build, or in
 * tests.
 *
 * Logs must NEVER include secrets (authorization, decrypted session material).
 */

const PREFIX = '[pingo-wa-sync]';

/** When set, overrides the automatic development detection. undefined = auto. */
let forced: boolean | undefined;

/** Force debug on (true) / off (false), or pass undefined to restore auto-detect. */
export function setDebug(on: boolean | undefined): void {
  forced = on;
}

/** True when debug logging is active (forced, or the extension is loaded unpacked). */
export function isDebug(): boolean {
  if (forced !== undefined) return forced;
  try {
    // Unpacked (development) builds have no update_url; packed/store builds do.
    return !('update_url' in chrome.runtime.getManifest());
  } catch {
    return false;
  }
}

/** Log with the shared prefix, only when debug mode is active. */
export function debugLog(...args: unknown[]): void {
  if (!isDebug()) return;
  try {
    console.log(PREFIX, ...args);
  } catch {
    /* console unavailable */
  }
}

/** Warn with the shared prefix, only when debug mode is active. */
export function debugWarn(...args: unknown[]): void {
  if (!isDebug()) return;
  try {
    console.warn(PREFIX, ...args);
  } catch {
    /* console unavailable */
  }
}
