import { CONFIG_SOURCE, type SyncConfig, type CompleteConfig } from '../types';

/** First non-empty (trimmed) string value from the list. */
function firstString(...vals: unknown[]): string | undefined {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim() !== '') return v.trim();
  }
  return undefined;
}

/**
 * Validate and normalize a message received from a website.
 * Accepts { source: 'WA_SYNC_CONFIG', payload?: {...} } with field aliases
 * (name/Nome, apiUrl/API_URL, authorization/Authorization, returnUrl/return_url/origin).
 * Returns only the recognized fields, or null if the message is not valid.
 */
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

  const out: SyncConfig = {};
  if (name !== undefined) out.name = name;
  if (apiUrl !== undefined) out.apiUrl = apiUrl;
  if (authorization !== undefined) out.authorization = authorization;
  if (returnUrl !== undefined) out.returnUrl = returnUrl;

  return Object.keys(out).length > 0 ? out : null;
}

/** Merge an existing config with a partial update (undefined does not overwrite). */
export function mergeConfig(existing: SyncConfig, update: SyncConfig): SyncConfig {
  return {
    name: update.name ?? existing.name,
    apiUrl: update.apiUrl ?? existing.apiUrl,
    authorization: update.authorization ?? existing.authorization,
    returnUrl: update.returnUrl ?? existing.returnUrl,
  };
}

/** True only when the three core fields are present and non-empty. */
export function isConfigComplete(c: SyncConfig): c is CompleteConfig {
  return !!(c.name && c.apiUrl && c.authorization);
}

/**
 * Keep returnUrl only if it is an http(s) URL under the sender's origin
 * (anti open-redirect). Returns a config with returnUrl dropped otherwise.
 */
export function sanitizeReturnUrl(config: SyncConfig, senderOrigin: string | undefined): SyncConfig {
  if (!config.returnUrl) return config;
  const ok =
    /^https?:\/\//i.test(config.returnUrl) &&
    (!senderOrigin || config.returnUrl.startsWith(senderOrigin));
  if (ok) return config;
  const { returnUrl: _dropped, ...rest } = config;
  return rest;
}
