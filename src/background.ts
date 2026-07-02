import { parseConfigMessage, mergeConfig, isConfigComplete, sanitizeReturnUrl } from './lib/config';
import { isAllowedOrigin, isAllowedApiUrl } from './lib/origins';
import { buildSyncRequest } from './lib/payload';
import { shouldSync } from './lib/sync-state';
import type {
  MessageResponse,
  RedactedConfig,
  SessionExport,
  SyncConfig,
  SyncGuardState,
  SyncOutcome,
} from './types';
import { extractWhatsAppSessionPage, clearSessionAndRedirectPage } from './injected/page-functions';
import { debugLog as log } from './lib/debug';
import { sessionMissingFields } from './lib/session-ready';

const CONFIG_KEY = 'config';
const STATE_KEY = 'syncState';

export const POST_SYNC_DISCONNECT_DELAY_MS = 3000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function describeSession(session: unknown): unknown {
  try {
    if (!session || typeof session !== 'object') return { session: typeof session };
    const s = session as SessionExport;
    const meta = s.signalMeta ?? {};
    const metaShape: Record<string, string> = {};
    for (const key of Object.keys(meta)) {
      const record = meta[key];
      metaShape[key] = record == null ? 'MISSING' : `has .value (${typeof record.value})`;
    }
    return {
      version: s.version,
      errors: s.errors,
      localStoragePresent: s.localStorage
        ? Object.keys(s.localStorage).filter((k) => s.localStorage?.[k] != null)
        : [],
      noiseCandidates: s.noiseCandidates?.length,
      hasSignalStatic: !!(s.signalStaticPrivB64 && s.signalStaticPubB64),
      recoveryToken: s.recoveryToken ? 'present' : 'MISSING',
      signalMeta: metaShape,
      preKeys: s.preKeys?.length,
      signedPreKeys: s.signedPreKeys?.length,
      identities: s.identities?.length,
      signedPreKeyValueKeys: s.signedPreKeys?.[0]?.value ? Object.keys(s.signedPreKeys[0].value) : null,
    };
  } catch (e) {
    return { describeError: String((e as Error)?.message || e) };
  }
}

function connectionsUrl(returnUrl?: string): string | null {
  if (!returnUrl || !/^https?:\/\//i.test(returnUrl)) return null;
  try {
    return new URL('/dashboard/connections', returnUrl).toString();
  } catch {
    return null;
  }
}

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
    try { await chrome.tabs.update(tabId, { url: dest }); } catch {}
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

function redact(c: SyncConfig): RedactedConfig {
  return {
    name: c.name,
    apiUrl: c.apiUrl,
    authorization: c.authorization ? '***' : undefined,
    returnUrl: c.returnUrl,
  };
}

async function runSync(tabId: number, wid: string | null): Promise<SyncOutcome> {
  log('runSync: start — tab', tabId, 'wid', wid ?? '(none)');
  const config = await getConfig();
  log('runSync: config', redact(config), '-> complete:', isConfigComplete(config));
  if (!isConfigComplete(config)) return { ok: false, error: 'incomplete config' };
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
  let rawSession: unknown;
  try {
    const [inj] = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: extractWhatsAppSessionPage,
    });
    rawSession = inj?.result;
  } catch (e) {
    log('runSync: extract threw ->', String((e as Error)?.message || e));
    return { ok: false, error: 'extract failed: ' + String((e as Error)?.message || e) };
  }

  const missing = sessionMissingFields(rawSession);
  if (missing.length) {
    log('runSync: session not fully ready — missing', missing, '| shape', describeSession(rawSession));
    return { ok: false, error: 'incomplete session (not logged in?)' };
  }
  const session = rawSession as SessionExport;
  const effectiveWid: string | null = wid ?? session.localStorage?.['last-wid-md'] ?? null;
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
    return { ok: false, error: 'fetch failed: ' + msg };
  }
  log('runSync: POST responded', resp.status, resp.ok ? '(ok)' : '(not ok)');

  if (resp.ok) {
    await setState({ lastSyncedWid: effectiveWid, lastSyncedAt: now, lastStatus: resp.status });
    const returnUrl = config.returnUrl;
    await clearConfig();
    log('runSync: synced ok — config cleared; disconnecting + redirecting in', POST_SYNC_DISCONNECT_DELAY_MS, 'ms to', returnUrl);
    await delay(POST_SYNC_DISCONNECT_DELAY_MS);
    await finalizeAndRedirect(tabId, returnUrl);
    log('runSync: tab', tabId, 'disconnected + redirected');
    return { ok: true, status: resp.status };
  }

  let body = '';
  try { body = await resp.text(); } catch {}
  const snippet = body.replace(/\s+/g, ' ').trim().slice(0, 500);
  log('runSync: POST rejected', resp.status, '— body:', snippet || '(empty)');
  return { ok: false, status: resp.status, error: `http ${resp.status}: ${snippet.slice(0, 200) || '(empty body)'}` };
}

async function trySync(tabId: number, wid: string | null): Promise<SyncOutcome> {
  const r = await runSync(tabId, wid);
  log('sync tab', tabId, 'wid', wid ?? '(none)', '->', r);
  if (!r.ok) {
    const prev = await getState();
    await setState({ ...prev, lastStatus: r.error ?? r.status ?? 'failed' });
  }
  return r;
}

async function trySyncAllWaTabs(): Promise<void> {
  const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
  log('trySyncAllWaTabs: found', tabs.length, 'WhatsApp Web tab(s)');
  for (const t of tabs) if (t.id != null) await trySync(t.id, null);
}

async function handleMessage(msg: unknown, senderOrigin?: string): Promise<MessageResponse> {
  const m: Record<string, unknown> = typeof msg === 'object' && msg !== null ? (msg as Record<string, unknown>) : {};
  const type = m.type;
  log('message:', type, 'from', senderOrigin ?? '(content script)');

  if (type === 'pingo-detect' || type === 'detect') {
    return { ok: true, installed: true, version: chrome.runtime.getManifest().version };
  }
  if (type === 'config') {
    const origin = typeof m.origin === 'string' ? m.origin : senderOrigin;
    if (!isAllowedOrigin(origin)) {
      log('config: origin not allowed ->', origin);
      return { ok: false, error: 'origin not allowed' };
    }
    const parsed = parseConfigMessage(m.data);
    if (!parsed) {
      log('config: invalid payload', m.data);
      return { ok: false, error: 'invalid payload' };
    }
    const partial = sanitizeReturnUrl(parsed, origin);
    const merged = mergeConfig(await getConfig(), partial);
    await setConfig(merged);
    const complete = isConfigComplete(merged);
    log('config: stored', redact(merged), '-> complete:', complete, complete ? '(triggering sync)' : '(waiting for missing fields)');
    if (complete) void trySyncAllWaTabs().catch((e: unknown) => { log('config: auto-sync failed', String(e)); });
    return { ok: true, complete, config: redact(merged) };
  }
  if (type === 'sync-now') {
    log('sync-now: requested');
    await trySyncAllWaTabs();
    return { ok: true };
  }
  if (type === 'get-status') {
    return { config: redact(await getConfig()), state: await getState() };
  }
  return { ok: false, error: 'unknown type' };
}

// Must mirror manifest.json content_scripts[content-bridge].matches so we only
// ever inject the bridge where it would already run on a normal page load.
const BRIDGE_TAB_MATCHES = [
  'https://*.pingonotify.com/*',
  'https://pingonotify.com/*',
  'http://localhost/*',
];

// Chrome does not run a freshly-installed content script in tabs that were
// already open — those pages would have to be reloaded before the bridge exists
// and Pingo can detect the extension. Inject the bridge into any already-open
// Pingo tab on install so detection works without a manual refresh. The bridge
// is idempotent (guards against a duplicate 'message' listener), so this stays
// safe even if a tab also loads it the normal way.
async function injectBridgeIntoOpenTabs(): Promise<void> {
  let tabs: chrome.tabs.Tab[];
  try {
    tabs = await chrome.tabs.query({ url: BRIDGE_TAB_MATCHES });
  } catch (e) {
    log('injectBridge: tabs.query failed ->', String((e as Error)?.message || e));
    return;
  }
  log('injectBridge: found', tabs.length, 'open Pingo tab(s)');
  for (const t of tabs) {
    if (t.id == null) continue;
    try {
      await chrome.scripting.executeScript({ target: { tabId: t.id }, files: ['content-bridge.js'] });
      log('injectBridge: injected into tab', t.id, t.url);
    } catch (e) {
      log('injectBridge: skipped tab', t.id, '->', String((e as Error)?.message || e));
    }
  }
}

chrome.runtime.onInstalled.addListener((details) => {
  log('onInstalled:', details.reason, '— injecting bridge into open Pingo tabs');
  void injectBridgeIntoOpenTabs();
});

log('service worker booted — version', chrome.runtime.getManifest().version);

chrome.runtime.onMessage.addListener((msg: unknown, sender, sendResponse) => {
  void (async () => {
    try {
      const m: Record<string, unknown> = typeof msg === 'object' && msg !== null ? (msg as Record<string, unknown>) : {};
      if (m.type === 'wa-logged-in') {
        const tabId = sender.tab?.id;
        const wid = typeof m.wid === 'string' ? m.wid : null;
        log('wa-logged-in from tab', tabId, 'wid', wid ?? '(none)');
        sendResponse(tabId != null ? await trySync(tabId, wid) : { ok: false, error: 'no tab' });
        return;
      }
      sendResponse(await handleMessage(msg, sender.origin));
    } catch (e) {
      sendResponse({ ok: false, error: String((e as Error)?.message || e) });
    }
  })();
  return true;
});

chrome.runtime.onMessageExternal.addListener((msg: unknown, sender, sendResponse) => {
  void (async () => {
    try {
      sendResponse(await handleMessage(msg, sender.origin));
    } catch (e) {
      sendResponse({ ok: false, error: String((e as Error)?.message || e) });
    }
  })();
  return true;
});
