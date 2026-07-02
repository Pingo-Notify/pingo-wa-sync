/**
 * wa-content.ts — content script on web.whatsapp.com (isolated world).
 * Watches (by polling) for an active WhatsApp Web login and notifies the
 * background, which extracts the session and syncs it (only if a payload/config
 * is stored).
 *
 * Detecting the exact login moment reliably means two things:
 *  - RE-ARM on a genuine logout, so a later login (e.g. a different number) is
 *    synced again if a payload arrives while logged out. We key the re-arm off the
 *    reliable, synchronous localStorage login key (WANoiseInfo), NOT the flaky
 *    IndexedDB read, so a transient IndexedDB hiccup never re-triggers a sync.
 *  - RETRY until it actually works. Right after a QR scan the encrypted session is
 *    written progressively, so the first detection can beat the session being fully
 *    extractable; we keep asking the background (bounded by MAX_ATTEMPTS) until it
 *    reports the sync succeeded or that there is nothing to do.
 */
import { computeLoggedIn, shouldStopRetrying } from './lib/detect';
import { debugLog } from './lib/debug';

async function hasSignalReg(): Promise<boolean> {
  try {
    return await new Promise<boolean>((resolve) => {
      const req = indexedDB.open('signal-storage');
      req.onerror = () => resolve(false);
      req.onsuccess = () => {
        const db = req.result;
        try {
          const tx = db.transaction('signal-meta-store', 'readonly');
          const g = tx.objectStore('signal-meta-store').get('signal_reg_id');
          g.onsuccess = () => { db.close(); resolve(g.result != null); };
          g.onerror = () => { db.close(); resolve(false); };
        } catch {
          db.close();
          resolve(false);
        }
      };
    });
  } catch {
    return false;
  }
}

function currentWid(): string | null {
  try {
    const raw = localStorage.getItem('last-wid-md');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return localStorage.getItem('last-wid-md');
  }
}

/**
 * WhatsApp Web shows a loading screen every time it opens (and especially right
 * after a QR login) while it finishes syncing and writing the session to storage.
 * Extracting during that window yields a HALF-WRITTEN session that the backend
 * rejects. The chat-list pane only renders once that load is done, so we treat its
 * presence as "fully loaded" and refuse to extract until then.
 */
function isAppLoaded(): boolean {
  return !!(document.querySelector('#pane-side') || document.querySelector('#side'));
}

/** Whether the current login has already been handled (synced, or nothing to do). */
let handled = false;
/** Sync attempts for the current login, so a not-ready/transient failure can't retry forever. */
let attempts = 0;
/** ~75s of retries: a fresh QR login needs time to write the signed-prekey metadata. */
const MAX_ATTEMPTS = 30;
/** Re-entrancy guard: tick() awaits IndexedDB + the background round-trip. */
let ticking = false;
let timer: ReturnType<typeof setInterval> | undefined;

async function tick(): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    // WANoiseInfo is the reliable, synchronous login key: its absence = logged out
    // (QR screen). Re-arm so the next login is detected and synced again.
    const hasNoiseInfo = !!localStorage.getItem('WANoiseInfo');
    if (!hasNoiseInfo) {
      if (handled || attempts) debugLog('tick: logged out (no WANoiseInfo) — re-armed');
      handled = false;
      attempts = 0;
      return;
    }
    if (handled) return;

    // Both signals must be present before we bother the background; a transient
    // IndexedDB miss here just waits for the next tick (it does not re-arm).
    const signalReg = await hasSignalReg();
    const loggedIn = computeLoggedIn({ hasNoiseInfo, hasSignalReg: signalReg });
    if (!loggedIn) {
      debugLog('tick: WANoiseInfo present but signal identity not ready yet (signalReg', signalReg, ') — waiting');
      return;
    }

    // Wait for WhatsApp to FULLY load before extracting — the session is written
    // progressively during the load, so extracting early produces a broken session.
    if (!isAppLoaded()) {
      debugLog('tick: logged in but WhatsApp is still loading (chat list not ready) — waiting');
      return;
    }

    debugLog('tick: login detected + app loaded — notifying background (attempt', attempts + 1, 'of', MAX_ATTEMPTS, ', wid', currentWid(), ')');
    let resp: { ok?: boolean; error?: string } | undefined;
    try {
      resp = await chrome.runtime.sendMessage({ type: 'wa-logged-in', wid: currentWid() });
    } catch {
      // Extension context invalidated (extension reloaded/updated): this content
      // script is orphaned and cannot recover until the page reloads — stop polling.
      if (!chrome.runtime?.id) {
        debugLog('tick: extension context invalidated — stopping. Reload this tab.');
        if (timer) clearInterval(timer);
        return;
      }
      // Otherwise a transient send failure; the next tick retries.
      debugLog('tick: transient send failure — will retry next tick');
      return;
    }

    attempts++;
    debugLog('tick: background responded', resp, attempts >= MAX_ATTEMPTS ? '(max attempts reached)' : '');
    if (shouldStopRetrying(resp) || attempts >= MAX_ATTEMPTS) handled = true;
    // else: session not fully written yet / recoverable error -> retry next tick.
  } finally {
    ticking = false;
  }
}

debugLog('wa-content loaded [build: wait-for-load] on', location.href, '— polling for login every 2500ms');
timer = setInterval(() => { void tick(); }, 2500);
void tick();

// Stop polling when the page unloads.
window.addEventListener('beforeunload', () => { if (timer) clearInterval(timer); });
