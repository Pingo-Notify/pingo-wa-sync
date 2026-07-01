/**
 * background.ts — orchestrator service worker.
 *  - Receives config (name, apiUrl, authorization, returnUrl) from a website
 *    (e.g. Pingo) via the content-bridge, and stores it.
 *  - Answers a detection handshake so a page can tell the extension is installed.
 *  - When WhatsApp Web is logged in, extracts the session and POSTs to API_URL.
 *  - On a successful sync: CLEARS the stored config, waits a short delay, then in one
 *    atomic in-page step wipes this tab's WhatsApp session (localStorage + IndexedDB,
 *    WITHOUT logging out) and redirects it to the Pingo connections page (derived from
 *    returnUrl's origin). Clearing and redirecting together is what stops WhatsApp Web
 *    from reloading itself over the redirect. The copied session reuses THIS device's
 *    identity, so leaving WhatsApp Web connected/reconnectable here while the backend
 *    connects with the same session makes WhatsApp flap between the two.
 */
import { parseConfigMessage, mergeConfig, isConfigComplete, sanitizeReturnUrl } from './lib/config';
import { isAllowedOrigin, isAllowedApiUrl } from './lib/origins';
import { buildSyncRequest } from './lib/payload';
import { shouldSync } from './lib/sync-state';
import type { SyncConfig, SyncGuardState } from './types';
import { extractWhatsAppSessionPage, clearSessionAndRedirectPage } from './injected/page-functions';

const CONFIG_KEY = 'config';
const STATE_KEY = 'syncState';

/**
 * Delay applied after a successful sync before disconnecting the live WhatsApp
 * session, giving the backend a moment to take over the copied session cleanly.
 */
export const POST_SYNC_DISCONNECT_DELAY_MS = 3000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Build the Pingo connections page URL from the returnUrl's (Pingo) origin, e.g.
 * "https://app.pingonotify.com/dashboard/connections". Returns null when returnUrl
 * is missing or not an http(s) URL.
 */
function connectionsUrl(returnUrl?: string): string | null {
  if (!returnUrl || !/^https?:\/\//i.test(returnUrl)) return null;
  try {
    return new URL('/dashboard/connections', returnUrl).toString();
  } catch {
    return null;
  }
}

/**
 * Clear this tab's WhatsApp session (no logout) AND redirect it to the Pingo
 * connections page, as a single atomic step inside the page. Doing both in one
 * injected, synchronous function is what makes the redirect reliable: clearing and
 * navigating in separate steps let WhatsApp Web reload itself (reacting to the wiped
 * storage) and override the redirect. If injection fails (tab gone / not injectable),
 * fall back to a plain tab navigation.
 */
async function finalizeAndRedirect(tabId: number, returnUrl?: string): Promise<void> {
  const dest = connectionsUrl(returnUrl) ?? 'about:blank';
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: clearSessionAndRedirectPage,
      args: [dest],
    });
  } catch {
    // Could not inject — best-effort direct navigation so the tab still leaves WA.
    try { await chrome.tabs.update(tabId, { url: dest }); } catch { /* tab gone */ }
  }
}

async function getConfig(): Promise<SyncConfig> {
  const r = await chrome.storage.local.get(CONFIG_KEY);
  return (r[CONFIG_KEY] as SyncConfig) || {};
}
async function setConfig(c: SyncConfig): Promise<void> {
  await chrome.storage.local.set({ [CONFIG_KEY]: c });
}
async function clearConfig(): Promise<void> {
  await chrome.storage.local.remove(CONFIG_KEY);
}
async function getState(): Promise<SyncGuardState> {
  const r = await chrome.storage.local.get(STATE_KEY);
  return (r[STATE_KEY] as SyncGuardState) || {};
}
async function setState(s: SyncGuardState): Promise<void> {
  await chrome.storage.local.set({ [STATE_KEY]: s });
}
function redact(c: SyncConfig) {
  return {
    name: c.name,
    apiUrl: c.apiUrl,
    authorization: c.authorization ? '***' : undefined,
    returnUrl: c.returnUrl,
  };
}

/** Extract the session (MAIN world) and POST to API_URL; on success clear + redirect to connections. */
async function trySync(tabId: number, wid: string | null): Promise<{ ok: boolean; status?: number | string; error?: string }> {
  const config = await getConfig();
  if (!isConfigComplete(config)) return { ok: false, error: 'incomplete config' };
  // Defense in depth: the session may only ever be POSTed to a Pingo host.
  if (!isAllowedApiUrl(config.apiUrl)) return { ok: false, error: 'api url not allowed' };

  const state = await getState();
  const now = Date.now();
  if (!shouldSync(config, wid, state, now)) return { ok: false, error: 'cooldown' };

  let session: any;
  try {
    const [inj] = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: extractWhatsAppSessionPage,
    });
    session = inj?.result;
  } catch (e) {
    return { ok: false, error: 'extract failed: ' + String((e as Error)?.message || e) };
  }
  if (!session || !session.signalStaticPrivB64) {
    return { ok: false, error: 'incomplete session (not logged in?)' };
  }

  const effectiveWid: string | null = wid ?? (session.localStorage && session.localStorage['last-wid-md']) ?? null;
  const req = buildSyncRequest(config, session);
  let resp: Response;
  try {
    resp = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body });
  } catch (e) {
    const msg = String((e as Error)?.message || e);
    await setState({ ...state, lastStatus: 'error: ' + msg });
    return { ok: false, error: 'fetch failed: ' + msg }; // keep config for retry
  }

  await setState({ lastSyncedWid: effectiveWid, lastSyncedAt: now, lastStatus: resp.status });

  if (resp.ok) {
    // After a successful sync: clear the stored config, then — because the copied
    // session shares this device's identity — wait a short delay and, in one atomic
    // step, clear this tab's WhatsApp session from the browser (no logout) and
    // redirect it to the Pingo connections page, so it does not conflict with the
    // backend.
    const returnUrl = config.returnUrl;
    await clearConfig();
    await delay(POST_SYNC_DISCONNECT_DELAY_MS);
    await finalizeAndRedirect(tabId, returnUrl);
  }
  return { ok: resp.ok, status: resp.status };
}

/** Iterate over all open WhatsApp Web tabs and try to sync. */
async function trySyncAllWaTabs(): Promise<void> {
  const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
  for (const t of tabs) if (t.id != null) await trySync(t.id, null);
}

/** Shared handler for both onMessage (content scripts) and onMessageExternal (pages). */
async function handleMessage(msg: any, senderOrigin?: string): Promise<any> {
  if (msg?.type === 'pingo-detect' || msg?.type === 'detect') {
    return { ok: true, installed: true, version: chrome.runtime.getManifest().version };
  }
  if (msg?.type === 'config') {
    const origin = msg.origin ?? senderOrigin;
    // Only Pingo may configure the extension — this is the primary guard that
    // stops any other site from pointing the session at its own server.
    if (!isAllowedOrigin(origin)) return { ok: false, error: 'origin not allowed' };
    const parsed = parseConfigMessage(msg.data);
    if (!parsed) return { ok: false, error: 'invalid payload' };
    const partial = sanitizeReturnUrl(parsed, origin);
    const merged = mergeConfig(await getConfig(), partial);
    await setConfig(merged);
    if (isConfigComplete(merged)) trySyncAllWaTabs().catch(() => {});
    return { ok: true, complete: isConfigComplete(merged), config: redact(merged) };
  }
  if (msg?.type === 'sync-now') {
    await trySyncAllWaTabs();
    return { ok: true };
  }
  if (msg?.type === 'get-status') {
    return { config: redact(await getConfig()), state: await getState() };
  }
  return { ok: false, error: 'unknown type' };
}

// From content scripts (content-bridge, wa-content).
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.type === 'wa-logged-in') {
        const tabId = sender.tab?.id;
        sendResponse(tabId != null ? await trySync(tabId, msg.wid ?? null) : { ok: false, error: 'no tab' });
        return;
      }
      sendResponse(await handleMessage(msg, sender.origin));
    } catch (e) {
      sendResponse({ ok: false, error: String((e as Error)?.message || e) });
    }
  })();
  return true; // async response
});

// From a website directly (requires externally_connectable in the manifest).
chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      sendResponse(await handleMessage(msg, sender.origin));
    } catch (e) {
      sendResponse({ ok: false, error: String((e as Error)?.message || e) });
    }
  })();
  return true; // async response
});
