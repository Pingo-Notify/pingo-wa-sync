/**
 * content-bridge.ts — content script on Pingo origins (pingonotify.com) + localhost.
 * Bridge between the Pingo website and the extension:
 *  - DETECT handshake: the page posts { source: 'WA_SYNC_DETECT' } and gets a PONG,
 *    so the page can tell whether the extension is installed.
 *  - CONFIG: the page posts { source: 'WA_SYNC_CONFIG', payload: { name, apiUrl,
 *    authorization, returnUrl } }; this forwards it (with the sender origin) to the
 *    background, which stores it. Sends an ACK back.
 */
import { CONFIG_SOURCE, CONFIG_ACK, DETECT_PING, DETECT_PONG } from './types';
import { debugLog } from './lib/debug';

debugLog('content-bridge loaded on', location.href);

window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== window) return; // only messages from the page itself
  const data = event.data as unknown;
  if (!data || typeof data !== 'object') return;
  const source = (data as { source?: unknown }).source;

  // Detection handshake — answer immediately, no background round-trip needed.
  if (source === DETECT_PING) {
    debugLog('detect ping from', event.origin, '-> pong');
    window.postMessage(
      { source: DETECT_PONG, installed: true, version: chrome.runtime.getManifest().version },
      event.origin || '*',
    );
    return;
  }

  // Config from the page -> background (carry the origin for returnUrl validation).
  if (source === CONFIG_SOURCE) {
    debugLog('config from page (origin', event.origin, ') -> forwarding to background');
    chrome.runtime.sendMessage({ type: 'config', data, origin: event.origin }, (resp) => {
      void chrome.runtime.lastError;
      debugLog('config ack from background:', resp);
      window.postMessage(
        { source: CONFIG_ACK, ok: !!(resp && resp.ok), complete: !!(resp && resp.complete), config: resp?.config },
        event.origin || '*',
      );
    });
  }
});
