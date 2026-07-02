import type { CompleteConfig, SyncRequest } from '../types';

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
