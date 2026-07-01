import { describe, it, expect } from 'vitest';
import { buildSyncRequest } from '../src/lib/payload';

const config = { name: 'Bot', apiUrl: 'https://api.example.com/sync', authorization: 'Bearer XYZ' };

describe('buildSyncRequest', () => {
  it('uses API_URL as the target and POST', () => {
    const r = buildSyncRequest(config, { any: 1 });
    expect(r.url).toBe('https://api.example.com/sync');
    expect(r.method).toBe('POST');
  });

  it('includes the Authorization header and Content-Type', () => {
    const r = buildSyncRequest(config, {});
    expect(r.headers.Authorization).toBe('Bearer XYZ');
    expect(r.headers['Content-Type']).toBe('application/json');
  });

  it('body contains name, authorization and the session', () => {
    const session = { noiseCandidates: [1, 2], signalStaticPrivB64: 'abc' };
    const r = buildSyncRequest(config, session);
    const body = JSON.parse(r.body);
    expect(body).toEqual({ name: 'Bot', authorization: 'Bearer XYZ', session });
  });

  it('is deterministic (same input -> same output)', () => {
    const a = buildSyncRequest(config, { x: 1 });
    const b = buildSyncRequest(config, { x: 1 });
    expect(a).toEqual(b);
  });
});
