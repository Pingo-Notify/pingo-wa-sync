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
import { debugLog as log, isDebug, setDebug } from './lib/debug';
import { sessionMissingFields } from './lib/session-ready';

const CONFIG_KEY = 'config';
const STATE_KEY = 'syncState';

/**
 * A safe, key-material-free structural summary of an extracted session, so we can
 * see WHAT is being sent (field presence, array lengths, signalMeta shape) without
 * ever logging private keys. Mirrors the fields Evolution's parser reads.
 */
function describeSession(s: any): unknown {
  try {
    const metaShape: Record<string, string> = {};
    const meta = s?.signalMeta ?? {};
    for (const k of Object.keys(meta)) {
      const v = meta[k];
      metaShape[k] =
        v == null
          ? 'MISSING'
          : typeof v === 'object'
            ? 'value' in v
              ? `has .value (${typeof v.value})`
              : `obj{${Object.keys(v).join(',')}}`
            : typeof v;
    }
    return {
      version: s?.version,
      errors: s?.errors,
      localStoragePresent: s?.localStorage
        ? Object.keys(s.localStorage).filter((k) => s.localStorage[k] != null)
        : [],
      noiseCandidates: s?.noiseCandidates?.length,
      hasSignalStatic: !!(s?.signalStaticPrivB64 && s?.signalStaticPubB64),
      recoveryToken: s?.recoveryToken ? 'present' : 'MISSING',
      signalMeta: metaShape,
      preKeys: s?.preKeys?.length,
      signedPreKeys: s?.signedPreKeys?.length,
      identities: s?.identities?.length,
      signedPreKeyRowKeys: s?.signedPreKeys?.[0] ? Object.keys(s.signedPreKeys[0]) : null,
      signedPreKeyValueKeys:
        s?.signedPreKeys?.[0]?.value && typeof s.signedPreKeys[0].value === 'object'
          ? Object.keys(s.signedPreKeys[0].value)
          : null,
      preKeyRowKeys: s?.preKeys?.[0] ? Object.keys(s.preKeys[0]) : null,
    };
  } catch (e) {
    return { describeError: String((e as Error)?.message || e) };
  }
}

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
async function runSync(tabId: number, wid: string | null): Promise<{ ok: boolean; status?: number | string; error?: string }> {
  log('runSync: start — tab', tabId, 'wid', wid ?? '(none)');
  const config = await getConfig();
  log('runSync: config', redact(config), '-> complete:', isConfigComplete(config));
  if (!isConfigComplete(config)) return { ok: false, error: 'incomplete config' };
  // Defense in depth: the session may only ever be POSTed to a Pingo host.
  if (!isAllowedApiUrl(config.apiUrl)) {
    log('runSync: api url not allowed ->', config.apiUrl);
    return { ok: false, error: 'api url not allowed' };
  }

  const state = await getState();
  const now = Date.now();
  if (!shouldSync(config, wid, state, now)) {
    log('runSync: skipped by cooldown — lastSyncedWid', state.lastSyncedWid, 'lastSyncedAt', state.lastSyncedAt);
    return { ok: false, error: 'cooldown' };
  }

  log('runSync: extracting session (MAIN world) from tab', tabId);
  let session: any;
  try {
    const [inj] = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: extractWhatsAppSessionPage,
    });
    session = inj?.result;
  } catch (e) {
    log('runSync: extract threw ->', String((e as Error)?.message || e));
    return { ok: false, error: 'extract failed: ' + String((e as Error)?.message || e) };
  }
  // Only POST a session that has EVERYTHING Evolution's parser needs. Right after a
  // QR login these fields land progressively, so retry until they are all present
  // (the content script re-fires on 'incomplete session'); an already-logged-in
  // session has them from the first tick.
  const missing = sessionMissingFields(session);
  if (missing.length) {
    log('runSync: session not fully ready — missing', missing, '| shape', describeSession(session));
    return { ok: false, error: 'incomplete session (not logged in?)' };
  }
  const effectiveWid: string | null = wid ?? session.localStorage['last-wid-md'] ?? null;
  log('runSync: session ready — wid', effectiveWid, 'signedPreKeys', session.signedPreKeys?.length, 'errors', session.errors);

  const req = buildSyncRequest(config, session);
  log('runSync: POST ->', req.url, 'wid', effectiveWid);
  let resp: Response;
  try {
    resp = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body });
  } catch (e) {
    const msg = String((e as Error)?.message || e);
    log('runSync: POST threw ->', msg);
    await setState({ ...state, lastStatus: 'error: ' + msg });
    return { ok: false, error: 'fetch failed: ' + msg }; // keep config for retry
  }
  log('runSync: POST responded', resp.status, resp.ok ? '(ok)' : '(not ok)');

  if (resp.ok) {
    // Record the successful sync (this also arms the per-wid cooldown), then — because
    // the copied session shares this device's identity — clear the stored config, wait
    // a short delay and, in one atomic step, clear this tab's WhatsApp session from the
    // browser (no logout) and redirect it to the Pingo connections page, so it does not
    // conflict with the backend.
    await setState({ lastSyncedWid: effectiveWid, lastSyncedAt: now, lastStatus: resp.status });
    const returnUrl = config.returnUrl;
    await clearConfig();
    log('runSync: synced ok — config cleared; disconnecting + redirecting in', POST_SYNC_DISCONNECT_DELAY_MS, 'ms to', returnUrl);
    await delay(POST_SYNC_DISCONNECT_DELAY_MS);
    await finalizeAndRedirect(tabId, returnUrl);
    log('runSync: tab', tabId, 'disconnected + redirected');
    return { ok: true, status: resp.status };
  }
  // Failed HTTP: read the response body so the reason (e.g. a 400 validation message)
  // is visible in the logs and the popup. Preserve the prior sync state so an error
  // response does not arm the cooldown or suppress a retry.
  let body = '';
  try { body = await resp.text(); } catch { /* body unavailable */ }
  const snippet = body.replace(/\s+/g, ' ').trim().slice(0, 500);
  log('runSync: POST rejected', resp.status, '— body:', snippet || '(empty)');
  return { ok: false, status: resp.status, error: `http ${resp.status}: ${snippet.slice(0, 200) || '(empty body)'}` };
}

/**
 * trySync wraps runSync so every outcome is observable: it logs the result and,
 * on failure, records the reason into lastStatus so the popup shows WHY nothing
 * synced (e.g. "incomplete config", "cooldown") instead of failing silently.
 */
async function trySync(tabId: number, wid: string | null): Promise<{ ok: boolean; status?: number | string; error?: string }> {
  const r = await runSync(tabId, wid);
  log('sync tab', tabId, 'wid', wid ?? '(none)', '->', r);
  if (!r.ok) {
    const prev = await getState();
    await setState({ ...prev, lastStatus: r.error ?? r.status ?? 'failed' });
  }
  return r;
}

/** Iterate over all open WhatsApp Web tabs and try to sync. */
async function trySyncAllWaTabs(): Promise<void> {
  const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
  log('trySyncAllWaTabs: found', tabs.length, 'WhatsApp Web tab(s)');
  for (const t of tabs) if (t.id != null) await trySync(t.id, null);
}

/** Shared handler for both onMessage (content scripts) and onMessageExternal (pages). */
async function handleMessage(msg: any, senderOrigin?: string): Promise<any> {
  log('message:', msg?.type, 'from', senderOrigin ?? '(content script)');
  if (msg?.type === 'pingo-detect' || msg?.type === 'detect') {
    return { ok: true, installed: true, version: chrome.runtime.getManifest().version };
  }
  if (msg?.type === 'config') {
    const origin = msg.origin ?? senderOrigin;
    // Only Pingo may configure the extension — this is the primary guard that
    // stops any other site from pointing the session at its own server.
    if (!isAllowedOrigin(origin)) {
      log('config: origin not allowed ->', origin);
      return { ok: false, error: 'origin not allowed' };
    }
    const parsed = parseConfigMessage(msg.data);
    if (!parsed) {
      log('config: invalid payload', msg.data);
      return { ok: false, error: 'invalid payload' };
    }
    const partial = sanitizeReturnUrl(parsed, origin);
    const merged = mergeConfig(await getConfig(), partial);
    await setConfig(merged);
    const complete = isConfigComplete(merged);
    log('config: stored', redact(merged), '-> complete:', complete, complete ? '(triggering sync)' : '(waiting for missing fields)');
    if (complete) trySyncAllWaTabs().catch((e) => log('config: auto-sync failed', String(e)));
    return { ok: true, complete, config: redact(merged) };
  }
  if (msg?.type === 'sync-now') {
    log('sync-now: requested');
    await trySyncAllWaTabs();
    return { ok: true };
  }
  if (msg?.type === 'get-status') {
    return { config: redact(await getConfig()), state: await getState(), debug: isDebug() };
  }
  // Toggle debug logging at runtime (e.g. to inspect a packed build). Send
  // { type: 'set-debug', on: true } from the service-worker console or a page.
  if (msg?.type === 'set-debug') {
    setDebug(typeof msg.on === 'boolean' ? msg.on : undefined);
    log('set-debug ->', isDebug());
    return { ok: true, debug: isDebug() };
  }
  return { ok: false, error: 'unknown type' };
}

log('service worker booted — debug', isDebug(), 'version', chrome.runtime.getManifest().version);

// From content scripts (content-bridge, wa-content).
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.type === 'wa-logged-in') {
        const tabId = sender.tab?.id;
        log('wa-logged-in from tab', sender.tab?.id, 'wid', msg.wid ?? '(none)');
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
