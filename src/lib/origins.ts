const ALLOWED_HOST_SUFFIXES = ['pingonotify.com'];

function hostIsAllowed(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
  return ALLOWED_HOST_SUFFIXES.some((suffix) => hostname === suffix || hostname.endsWith('.' + suffix));
}

export function isAllowedOrigin(origin: string | undefined | null): boolean {
  if (!origin) return false;
  try {
    return hostIsAllowed(new URL(origin).hostname);
  } catch {
    return false;
  }
}

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
