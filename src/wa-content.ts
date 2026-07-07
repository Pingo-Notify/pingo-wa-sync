import { computeLoggedIn, shouldStopRetrying } from './lib/detect';
import { debugLog } from './lib/debug';
import { getToast } from './wa-toast';
import { isSyncStage } from './lib/sync-stage';
import { getUiSettings, normalizeUiSettings } from './lib/ui-settings';
import { SYNC_PROGRESS, UI_SETTINGS_KEY, type SyncOutcome, type SyncStage } from './types';

// --- On-screen status toast (bottom-right of WhatsApp Web) ------------------
// The background pushes SyncStage updates here via chrome.tabs.sendMessage; the
// user can turn the whole thing off from the extension popup.

let toastEnabled = true;
let toastShown = false;

function renderStage(stage: SyncStage, detail?: string): void {
  if (!toastEnabled) return;
  toastShown = true;
  getToast().show(stage, detail);
}

void getUiSettings().then((s) => {
  toastEnabled = s.toastEnabled;
  if (toastEnabled) renderStage('init');
});

// React live when the user flips the switch in the popup.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes[UI_SETTINGS_KEY]) return;
  toastEnabled = normalizeUiSettings(changes[UI_SETTINGS_KEY].newValue).toastEnabled;
  if (!toastEnabled && toastShown) getToast().destroy();
});

// Progress updates streamed from the background service worker.
chrome.runtime.onMessage.addListener((msg: unknown) => {
  const m = (typeof msg === 'object' && msg ? msg : {}) as Record<string, unknown>;
  if (m.type === SYNC_PROGRESS && isSyncStage(m.stage)) {
    renderStage(m.stage, typeof m.detail === 'string' ? m.detail : undefined);
  }
});

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
  const raw = localStorage.getItem('last-wid-md');
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'string' ? parsed : raw;
  } catch {
    return raw;
  }
}

function isAppLoaded(): boolean {
  return !!(document.querySelector('#pane-side') || document.querySelector('#side'));
}

let handled = false;
let attempts = 0;
const MAX_ATTEMPTS = 30;
let ticking = false;
let timer: ReturnType<typeof setInterval> | undefined;

async function tick(): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    const hasNoiseInfo = !!localStorage.getItem('WANoiseInfo');
    if (!hasNoiseInfo) {
      if (handled || attempts) debugLog('tick: logged out (no WANoiseInfo) — re-armed');
      handled = false;
      attempts = 0;
      return;
    }
    if (handled) return;

    const signalReg = await hasSignalReg();
    const loggedIn = computeLoggedIn({ hasNoiseInfo, hasSignalReg: signalReg });
    if (!loggedIn) {
      debugLog('tick: WANoiseInfo present but signal identity not ready yet (signalReg', signalReg, ') — waiting');
      return;
    }

    if (!isAppLoaded()) {
      debugLog('tick: logged in but WhatsApp is still loading (chat list not ready) — waiting');
      return;
    }

    debugLog('tick: login detected + app loaded — notifying background (attempt', attempts + 1, 'of', MAX_ATTEMPTS, ', wid', currentWid(), ')');
    let resp: SyncOutcome | undefined;
    try {
      resp = await chrome.runtime.sendMessage({ type: 'wa-logged-in', wid: currentWid() });
    } catch {
      if (!chrome.runtime?.id) {
        debugLog('tick: extension context invalidated — stopping. Reload this tab.');
        if (timer) clearInterval(timer);
        return;
      }
      debugLog('tick: transient send failure — will retry next tick');
      return;
    }

    attempts++;
    debugLog('tick: background responded', resp, attempts >= MAX_ATTEMPTS ? '(max attempts reached)' : '');
    if (shouldStopRetrying(resp) || attempts >= MAX_ATTEMPTS) handled = true;
  } finally {
    ticking = false;
  }
}

debugLog('wa-content loaded on', location.href, '— polling for login every 2500ms');
timer = setInterval(() => { void tick(); }, 2500);
void tick();

window.addEventListener('beforeunload', () => { if (timer) clearInterval(timer); });
