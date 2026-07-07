import { CONFIG_SOURCE, CONFIG_ACK, DETECT_PING, DETECT_PONG, DETECT_ANNOUNCE, type MessageResponse } from './types';
import { debugLog } from './lib/debug';

// A page can receive this bridge more than once: the manifest injects it on load,
// and background.ts re-injects it into an already-open Pingo tab after install or
// after the extension is reloaded/updated (so the site detects the extension
// without a refresh). Each injection claims the page with a fresh "generation"
// counter; only the newest generation acts. This means:
//   - we never register two LIVE listeners (which would double-forward config), and
//   - a reload/update always installs a working listener that supersedes the
//     now-orphaned previous one, instead of a stale flag blocking re-injection.
const bridgeWindow = window as unknown as { __pingoWaSyncBridgeGen?: number };
const myGeneration = (bridgeWindow.__pingoWaSyncBridgeGen ?? 0) + 1;
bridgeWindow.__pingoWaSyncBridgeGen = myGeneration;

debugLog('content-bridge loaded on', location.href, '— generation', myGeneration);

window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== window) return;
  // Superseded by a newer injection (e.g. this copy was orphaned by an extension
  // reload and a fresh bridge took over the page): stand down so exactly one
  // bridge answers.
  if (bridgeWindow.__pingoWaSyncBridgeGen !== myGeneration) return;
  // Orphaned by an extension reload/update with no newer bridge yet: our chrome.*
  // context is invalidated and would throw on every call — stay quiet.
  if (!chrome.runtime?.id) return;

  const data: unknown = event.data;
  if (!data || typeof data !== 'object') return;
  const source = (data as { source?: unknown }).source;

  if (source === DETECT_PING) {
    debugLog('detect ping from', event.origin, '-> pong');
    window.postMessage(
      { source: DETECT_PONG, installed: true, version: chrome.runtime.getManifest().version },
      event.origin || '*',
    );
    return;
  }

  if (source === CONFIG_SOURCE) {
    debugLog('config from page (origin', event.origin, ') -> forwarding to background');
    chrome.runtime.sendMessage({ type: 'config', data, origin: event.origin }, (resp: MessageResponse | undefined) => {
      void chrome.runtime.lastError;
      debugLog('config ack from background:', resp);
      window.postMessage(
        { source: CONFIG_ACK, ok: !!resp?.ok, complete: !!resp?.complete, config: resp?.config },
        event.origin || '*',
      );
    });
  }
});

// Announce ourselves unprompted so a page already open when this bridge is
// injected (after install or an extension reload) detects the extension without
// being pinged and without a refresh. Pages that only listen for DETECT_PONG
// ignore this message.
if (chrome.runtime?.id) {
  window.postMessage(
    { source: DETECT_ANNOUNCE, installed: true, version: chrome.runtime.getManifest().version },
    location.origin,
  );
}
