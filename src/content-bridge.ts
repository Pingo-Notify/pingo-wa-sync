import { CONFIG_SOURCE, CONFIG_ACK, DETECT_PING, DETECT_PONG, DETECT_ANNOUNCE, type MessageResponse } from './types';
import { debugLog } from './lib/debug';

// A tab can receive this bridge twice: the manifest injects it on page load, and
// background.ts re-injects it into an already-open Pingo tab right after install
// (so detection works without a refresh). Both copies share the same content-
// script (isolated) window, so a window flag keeps the script idempotent — a
// second copy must not register a second 'message' listener, otherwise every
// detect/config from the page would be handled (and forwarded) twice.
const bridgeWindow = window as unknown as { __pingoWaSyncBridge?: boolean };

if (bridgeWindow.__pingoWaSyncBridge) {
  debugLog('content-bridge already active on', location.href, '— skipping duplicate injection');
} else {
  bridgeWindow.__pingoWaSyncBridge = true;
  debugLog('content-bridge loaded on', location.href);

  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== window) return;
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

  // Announce ourselves unprompted so a page that was already open when this
  // bridge got injected (right after install) can detect the extension without
  // waiting to be pinged and without a refresh. Pages that only listen for
  // DETECT_PONG simply ignore this message.
  window.postMessage(
    { source: DETECT_ANNOUNCE, installed: true, version: chrome.runtime.getManifest().version },
    location.origin,
  );
}
