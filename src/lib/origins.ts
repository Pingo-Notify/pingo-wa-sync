/**
 * Origin allowlist — the extension only accepts configuration from, and only
 * syncs sessions to, the Pingo product (plus localhost for development).
 *
 * This is the security boundary that turns a would-be "any website can harvest
 * your WhatsApp session" surface into a scoped, first-party feature: config is
 * refused unless it comes from a Pingo origin, and the session is only ever
 * POSTed to a Pingo host.
 */

/** Hostname suffixes considered "Pingo". */
const ALLOWED_HOST_SUFFIXES = ['pingonotify.com'];

function hostIsAllowed(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
  return ALLOWED_HOST_SUFFIXES.some((suffix) => hostname === suffix || hostname.endsWith('.' + suffix));
}

/** True if a page origin (e.g. "https://app.pingonotify.com") may talk to us. */
export function isAllowedOrigin(origin: string | undefined | null): boolean {
  if (!origin) return false;
  try {
    return hostIsAllowed(new URL(origin).hostname);
  } catch {
    return false;
  }
}

/** True if the session may be POSTed to this API_URL (must be a Pingo host). */
export function isAllowedApiUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    return hostIsAllowed(u.hostname);
  } catch {
    return false;
  }
}
