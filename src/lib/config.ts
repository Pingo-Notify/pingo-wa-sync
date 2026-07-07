import { CONFIG_SOURCE, type SyncConfig, type CompleteConfig, type SyncSettings } from '../types';

function firstString(...vals: unknown[]): string | undefined {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim() !== '') return v.trim();
  }
  return undefined;
}

/** The WhatsApp settings the extension forwards (kept in sync with SyncSettings). */
const SETTING_KEYS = [
  'readMessages',
  'alwaysOnline',
  'groupsIgnore',
  'syncFullHistory',
  'rejectCall',
  'readStatus',
] as const;

/** Extract only the known boolean settings; returns undefined when none are present. */
function parseSettings(raw: unknown): SyncSettings | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const src = raw as Record<string, unknown>;
  const out: SyncSettings = {};
  for (const key of SETTING_KEYS) {
    if (typeof src[key] === 'boolean') out[key] = src[key] as boolean;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function parseConfigMessage(data: unknown): SyncConfig | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (d.source !== CONFIG_SOURCE) return null;

  const p =
    d.payload && typeof d.payload === 'object'
      ? (d.payload as Record<string, unknown>)
      : d;

  const name = firstString(p.name, p.Name, p.nome, p.Nome);
  const apiUrl = firstString(p.apiUrl, p.API_URL, p.api_url, p.apiURL, p.url);
  const authorization = firstString(p.authorization, p.Authorization, p.auth, p.token);
  const returnUrl = firstString(p.returnUrl, p.return_url, p.origin);
  const settings = parseSettings(p.settings);

  const out: SyncConfig = {};
  if (name !== undefined) out.name = name;
  if (apiUrl !== undefined) out.apiUrl = apiUrl;
  if (authorization !== undefined) out.authorization = authorization;
  if (returnUrl !== undefined) out.returnUrl = returnUrl;
  if (settings !== undefined) out.settings = settings;

  return Object.keys(out).length > 0 ? out : null;
}

export function mergeConfig(existing: SyncConfig, update: SyncConfig): SyncConfig {
  return {
    name: update.name ?? existing.name,
    apiUrl: update.apiUrl ?? existing.apiUrl,
    authorization: update.authorization ?? existing.authorization,
    returnUrl: update.returnUrl ?? existing.returnUrl,
    settings: update.settings ?? existing.settings,
  };
}

export function isConfigComplete(c: SyncConfig): c is CompleteConfig {
  return !!(c.name && c.apiUrl && c.authorization);
}

export function sanitizeReturnUrl(config: SyncConfig, senderOrigin: string | undefined): SyncConfig {
  if (!config.returnUrl) return config;
  const ok =
    /^https?:\/\//i.test(config.returnUrl) &&
    (!senderOrigin || config.returnUrl.startsWith(senderOrigin));
  if (ok) return config;
  const { returnUrl: _dropped, ...rest } = config;
  return rest;
}
