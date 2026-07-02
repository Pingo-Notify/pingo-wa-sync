import { debugLog } from './lib/debug';
import type { MessageResponse } from './types';

type StatusResponse = Pick<MessageResponse, 'config' | 'state'>;

function el(id: string): HTMLElement {
  const e = document.getElementById(id);
  if (!e) throw new Error('missing #' + id);
  return e;
}

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function row(label: string, value: unknown): string {
  const has = value !== undefined && value !== null && value !== '';
  const cls = has ? 'v' : 'v muted';
  return `<div class="row"><span class="k">${esc(label)}</span>` +
    `<span class="${cls}">${has ? esc(value) : '—'}</span></div>`;
}

function render(status: StatusResponse): void {
  const c = status.config ?? {};
  const s = status.state ?? {};
  const complete = !!(c.name && c.apiUrl && c.authorization);

  el('status-dot').className = `status-dot ${complete ? 'ok' : 'err'}`;
  const banner = el('banner');
  banner.className = `banner ${complete ? 'ok' : 'err'}`;
  banner.innerHTML = complete
    ? `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"
           stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
       <span>Ready to sync</span>`
    : `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
           stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/>
           <path d="M12 8v5"/><path d="M12 16h.01"/></svg>
       <span>Waiting for Pingo<small>Open a connection in Pingo to configure it.</small></span>`;

  el('config').innerHTML =
    row('Name', c.name) +
    row('API URL', c.apiUrl) +
    row('Authorization', c.authorization);

  const when = s.lastSyncedAt ? new Date(s.lastSyncedAt).toLocaleString() : undefined;
  el('state').innerHTML =
    row('Last sync', when) +
    row('Status', s.lastStatus) +
    row('WID', s.lastSyncedWid ?? undefined);
}

async function refresh(): Promise<void> {
  const status: StatusResponse | undefined = await chrome.runtime.sendMessage({ type: 'get-status' });
  debugLog('popup status:', status);
  render(status ?? {});
}

const syncBtn = el('sync') as HTMLButtonElement;
const syncLabel = el('sync-label');

syncBtn.addEventListener('click', async () => {
  syncBtn.disabled = true;
  syncBtn.classList.add('is-busy');
  syncLabel.textContent = 'Syncing…';
  try {
    await chrome.runtime.sendMessage({ type: 'sync-now' });
    await refresh();
  } finally {
    syncBtn.disabled = false;
    syncBtn.classList.remove('is-busy');
    syncLabel.textContent = 'Sync now';
  }
});

void refresh();
