import { CONFIG_SOURCE, CONFIG_ACK, DETECT_PING, DETECT_PONG, type MessageResponse } from './types';
import { debugLog } from './lib/debug';

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
