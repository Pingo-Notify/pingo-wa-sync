import type { CompleteConfig, SyncRequest } from '../types';

export function buildSyncRequest(config: CompleteConfig, session: unknown): SyncRequest {
  const body = {
    name: config.name,
    authorization: config.authorization,
    session,
    // Forwarded verbatim (undefined is dropped by JSON.stringify). The Pingo API
    // relays these to Evolution when creating / reconnecting the connection.
    settings: config.settings,
  };
  return {
    url: config.apiUrl,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: config.authorization,
    },
    body: JSON.stringify(body),
  };
}
