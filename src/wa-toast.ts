import type { SyncStage } from './types';
import { stageView, type StageKind } from './lib/sync-stage';

// On-screen status toast injected into WhatsApp Web (bottom-right corner).
//
// Everything lives inside a Shadow DOM so WhatsApp's stylesheet can never leak
// in and ours can never leak out. The host is attached to <html> (not <body>)
// because WhatsApp re-renders body's subtree aggressively and could otherwise
// tear our node out.

const HOST_ID = 'pingo-wa-sync-toast';
/** A working toast (ttl 0) never lingers past this, even if no newer stage arrives. */
const SAFETY_FALLBACK_MS = 45_000;
/** Matches the CSS slide-out transition so we don't hide mid-animation. */
const EXIT_MS = 260;

const ICONS: Record<StageKind, string> = {
  // Spinner is drawn in CSS; the working icon is just its track holder.
  working: '<span class="spinner"></span>',
  success:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  idle:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01"/><path d="M11 12h1v4h1"/></svg>',
  error:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
};

const STYLE = `
:host { all: initial; }
.wrap {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 2147483647;
  display: flex;
  align-items: flex-start;
  gap: 11px;
  width: 320px;
  max-width: calc(100vw - 40px);
  padding: 13px 14px;
  border-radius: 14px;
  border: 1px solid var(--edge, rgba(110, 227, 26, 0.22));
  background:
    radial-gradient(120% 140% at 100% 0%, rgba(110, 227, 26, 0.10), transparent 60%),
    #0a0e0b;
  color: #eaf2ea;
  font: 13px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
  box-shadow: 0 12px 34px -10px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(0, 0, 0, 0.2);
  -webkit-font-smoothing: antialiased;
  opacity: 0;
  transform: translateY(12px) scale(0.98);
  transition: opacity ${EXIT_MS}ms ease, transform ${EXIT_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1);
  pointer-events: none;
}
.wrap[data-open="true"] {
  opacity: 1;
  transform: translateY(0) scale(1);
  pointer-events: auto;
}
.icon {
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: 9px;
  color: var(--accent, #6ee31a);
  background: var(--accent-soft, rgba(110, 227, 26, 0.12));
}
.icon svg { width: 18px; height: 18px; }
.spinner {
  width: 17px;
  height: 17px;
  border-radius: 50%;
  border: 2.4px solid rgba(110, 227, 26, 0.3);
  border-top-color: var(--accent, #6ee31a);
  animation: pingo-spin 0.75s linear infinite;
}
.body { flex: 1 1 auto; min-width: 0; padding-top: 1px; }
.title { font-weight: 700; font-size: 13px; letter-spacing: -0.01em; }
.subtitle { margin-top: 2px; font-size: 11.5px; color: #8b968b; }
.close {
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  margin: -3px -3px 0 0;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: #6c766c;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.close:hover { background: rgba(255, 255, 255, 0.06); color: #eaf2ea; }

/* Accent per stage kind */
.wrap[data-kind="success"] { --accent: #6ee31a; --edge: rgba(110, 227, 26, 0.3);  --accent-soft: rgba(110, 227, 26, 0.12); }
.wrap[data-kind="idle"]    { --accent: #ffcc4d; --edge: rgba(255, 204, 77, 0.24); --accent-soft: rgba(255, 204, 77, 0.14); }
.wrap[data-kind="error"]   { --accent: #ff6b6b; --edge: rgba(255, 107, 107, 0.26); --accent-soft: rgba(255, 107, 107, 0.14); }

@keyframes pingo-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
  .wrap { transition: opacity ${EXIT_MS}ms ease; transform: none; }
  .wrap[data-open="true"] { transform: none; }
  .spinner { animation: none; }
}
`;

export interface Toast {
  show(stage: SyncStage, detail?: string): void;
  hide(): void;
  /** Remove the toast node entirely (used when the feature is toggled off). */
  destroy(): void;
}

function buildToast(): Toast {
  const host = document.createElement('div');
  host.id = HOST_ID;
  const root = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = STYLE;

  const wrap = document.createElement('div');
  wrap.className = 'wrap';
  wrap.setAttribute('data-open', 'false');
  wrap.setAttribute('role', 'status');
  wrap.setAttribute('aria-live', 'polite');
  wrap.innerHTML =
    '<div class="icon"></div>' +
    '<div class="body"><div class="title"></div><div class="subtitle"></div></div>' +
    '<button class="close" type="button" aria-label="Fechar">&times;</button>';

  root.append(style, wrap);

  const iconEl = wrap.querySelector('.icon') as HTMLElement;
  const titleEl = wrap.querySelector('.title') as HTMLElement;
  const subtitleEl = wrap.querySelector('.subtitle') as HTMLElement;
  const closeEl = wrap.querySelector('.close') as HTMLButtonElement;

  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  let removeTimer: ReturnType<typeof setTimeout> | undefined;

  function ensureAttached(): void {
    if (!host.isConnected) document.documentElement.appendChild(host);
  }

  function hide(): void {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = undefined; }
    wrap.setAttribute('data-open', 'false');
  }

  function show(stage: SyncStage, detail?: string): void {
    if (removeTimer) { clearTimeout(removeTimer); removeTimer = undefined; }
    ensureAttached();
    const view = stageView(stage);
    wrap.setAttribute('data-kind', view.kind);
    iconEl.innerHTML = ICONS[view.kind];
    titleEl.textContent = view.title;
    subtitleEl.textContent = detail && detail.trim() ? detail.trim() : view.subtitle;

    // Force a reflow so re-showing an already-open toast replays the transition.
    void wrap.offsetWidth;
    wrap.setAttribute('data-open', 'true');

    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, view.ttl > 0 ? view.ttl : SAFETY_FALLBACK_MS);
  }

  closeEl.addEventListener('click', hide);

  function destroy(): void {
    if (hideTimer) clearTimeout(hideTimer);
    if (removeTimer) clearTimeout(removeTimer);
    hide();
    removeTimer = setTimeout(() => host.remove(), EXIT_MS);
  }

  return { show, hide, destroy };
}

let instance: Toast | undefined;

/** Lazily create (once) and return the singleton toast controller. */
export function getToast(): Toast {
  if (!instance) instance = buildToast();
  return instance;
}
