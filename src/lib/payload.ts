import type { CompleteConfig, SyncRequest } from '../types';

/**
 * Build the sync request: POST to API_URL, with an Authorization header and a
 * complete payload containing name, authorization and the session.
 * Pure and deterministic (easy to test).
 */
export function buildSyncRequest(config: CompleteConfig, session: unknown): SyncRequest {
  const body = {
    name: config.name,
    authorization: config.authorization,
    session,
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
