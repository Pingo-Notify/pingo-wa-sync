/**
 * popup.ts — shows the stored config and the last sync status;
 * button to force a sync.
 */
import { debugLog } from './lib/debug';

interface StatusResponse {
  config?: { name?: string; apiUrl?: string; authorization?: string };
  state?: { lastSyncedWid?: string | null; lastSyncedAt?: number; lastStatus?: number | string };
  debug?: boolean;
}

function el(id: string): HTMLElement {
  const e = document.getElementById(id);
  if (!e) throw new Error('missing #' + id);
  return e;
}

function render(status: StatusResponse): void {
  const c = status.config || {};
  const s = status.state || {};
  const complete = !!(c.name && c.apiUrl && c.authorization);
  el('config').innerHTML =
    `<div class="row"><span class="k">Name:</span> <span class="v">${c.name ?? '—'}</span></div>` +
    `<div class="row"><span class="k">API_URL:</span> <span class="v">${c.apiUrl ?? '—'}</span></div>` +
    `<div class="row"><span class="k">Authorization:</span> <span class="v">${c.authorization ?? '—'}</span></div>` +
    `<div class="row ${complete ? 'ok' : 'err'}">${complete ? 'Config complete' : 'Config incomplete'}</div>`;

  const when = s.lastSyncedAt ? new Date(s.lastSyncedAt).toLocaleString() : '—';
  el('state').innerHTML =
    `<div class="row"><span class="k">Last sync:</span> <span class="v">${when}</span></div>` +
    `<div class="row"><span class="k">Status:</span> <span class="v">${s.lastStatus ?? '—'}</span></div>` +
    `<div class="row"><span class="k">wid:</span> <span class="v">${s.lastSyncedWid ?? '—'}</span></div>`;
}

async function refresh(): Promise<void> {
  const status = await chrome.runtime.sendMessage({ type: 'get-status' });
  debugLog('popup status:', status);
  render(status || {});
}

el('sync').addEventListener('click', async () => {
  el('sync').textContent = 'Syncing…';
  await chrome.runtime.sendMessage({ type: 'sync-now' });
  await refresh();
  el('sync').textContent = 'Sync now';
});

void refresh();
