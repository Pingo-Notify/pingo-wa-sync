/**
 * wa-content.ts — content script on web.whatsapp.com (isolated world).
 * Detects (by polling) when a login is active by reading localStorage + IndexedDB
 * and notifies the background, which then extracts the session and syncs.
 */
import { computeLoggedIn } from './lib/detect';

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

let notified = false;

async function tick(): Promise<void> {
  if (notified) return;
  const loggedIn = computeLoggedIn({
    hasNoiseInfo: !!localStorage.getItem('WANoiseInfo'),
    hasSignalReg: await hasSignalReg(),
  });
  if (!loggedIn) return;
  notified = true;
  try {
    chrome.runtime.sendMessage({ type: 'wa-logged-in', wid: currentWid() }, () => {
      void chrome.runtime.lastError;
    });
  } catch {
    /* the service worker may be restarting; the next tick covers it */
    notified = false;
  }
}

const timer = setInterval(() => {
  void tick();
}, 2500);
void tick();

// Stop polling when the page unloads.
window.addEventListener('beforeunload', () => clearInterval(timer));
