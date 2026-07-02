import type { NoiseCandidate, SessionExport, SignalMetaRecord, SignalStoreRow } from '../types';

interface LoginDetection {
  loggedIn: boolean;
  wid: string | null;
  lid: string | null;
  checks: Record<string, boolean>;
  error: string | null;
}

export async function detectWhatsAppLoginPage(): Promise<LoginDetection> {
  const out: LoginDetection = { loggedIn: false, wid: null, lid: null, checks: {}, error: null };
  try {
    const ls = (k: string): string | null => localStorage.getItem(k);
    const noise = ls('WANoiseInfo');
    const widRaw = ls('last-wid-md');
    const lidRaw = ls('WALid');
    out.checks.WANoiseInfo = !!noise;
    out.checks['last-wid-md'] = !!widRaw;
    out.checks.WALid = !!lidRaw;
    try { out.wid = widRaw ? (JSON.parse(widRaw) as string) : null; } catch { out.wid = widRaw; }
    try { out.lid = lidRaw ? (JSON.parse(lidRaw) as string) : null; } catch { out.lid = lidRaw; }

    let hasSignalReg = false;
    try {
      hasSignalReg = await new Promise<boolean>((resolve) => {
        const req = indexedDB.open('signal-storage');
        req.onerror = () => resolve(false);
        req.onsuccess = () => {
          const db = req.result;
          try {
            const tx = db.transaction('signal-meta-store', 'readonly');
            const g = tx.objectStore('signal-meta-store').get('signal_reg_id');
            g.onsuccess = () => { db.close(); resolve(g.result != null); };
            g.onerror = () => { db.close(); resolve(false); };
          } catch { db.close(); resolve(false); }
        };
      });
    } catch {}
    out.checks.signalRegId = hasSignalReg;
    out.loggedIn = !!(noise && hasSignalReg);
  } catch (e) {
    out.error = String((e as Error)?.message || e);
  }
  return out;
}

export function clearSessionAndRedirectPage(redirectUrl: string): void {
  try {
    const lsKeys = ['WANoiseInfo', 'WANoiseInfoIv', 'WAWebEncKeySalt', 'WALid', 'last-wid-md'];
    for (const k of lsKeys) {
      try { localStorage.removeItem(k); } catch {}
    }
  } catch {}

  try {
    for (const db of ['signal-storage', 'wawc_db_enc']) {
      try { indexedDB.deleteDatabase(db); } catch {}
    }
  } catch {}

  try { window.onbeforeunload = null; } catch {}
  window.location.replace(redirectUrl);
}

export async function extractWhatsAppSessionPage(): Promise<SessionExport> {
  function b64(bytes: ArrayBuffer | ArrayBufferView): string {
    const arr = bytes instanceof ArrayBuffer
      ? new Uint8Array(bytes)
      : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let s = '';
    for (const x of arr) s += String.fromCharCode(x);
    return btoa(s);
  }
  function fromB64(value: string): Uint8Array<ArrayBuffer> {
    const bin = atob(value);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }
  function encode(value: unknown): unknown {
    if (value == null) return value;
    if (value instanceof ArrayBuffer) return { __ab: b64(value) };
    if (ArrayBuffer.isView(value)) return { __ab: b64(value) };
    if (Array.isArray(value)) return (value as unknown[]).map((item) => encode(item));
    if (typeof value === 'object') {
      const ctor = (value as { constructor?: { name?: string } }).constructor;
      if (ctor && ctor.name === 'CryptoKey') return { __cryptoKey: true };
      const o: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) o[k] = encode(v);
      return o;
    }
    return value;
  }
  function openDB(dbName: string): Promise<IDBDatabase> {
    return new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(dbName);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
    });
  }
  async function getRecord(dbName: string, storeName: string, key: IDBValidKey): Promise<unknown> {
    const db = await openDB(dbName);
    try {
      return await new Promise<unknown>((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const g = tx.objectStore(storeName).get(key);
        g.onsuccess = () => resolve(g.result);
        g.onerror = () => reject(g.error);
      });
    } finally { db.close(); }
  }
  async function readAll(dbName: string, storeName: string): Promise<SignalStoreRow[]> {
    const db = await openDB(dbName);
    try {
      return await new Promise<SignalStoreRow[]>((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const rows: SignalStoreRow[] = [];
        const cursor = tx.objectStore(storeName).openCursor();
        cursor.onsuccess = () => {
          const c = cursor.result;
          if (c) { rows.push({ key: encode(c.key), value: encode(c.value) as SignalStoreRow['value'] }); c.continue(); }
        };
        cursor.onerror = () => reject(cursor.error);
        tx.oncomplete = () => resolve(rows);
        tx.onerror = () => reject(tx.error);
      });
    } finally { db.close(); }
  }
  const ls = (k: string): string | null => localStorage.getItem(k);

  const errors: string[] = [];
  const result: SessionExport = { version: 1, errors };

  const localStorageDump: Record<string, string | null> = {
    WANoiseInfo: ls('WANoiseInfo'),
    WANoiseInfoIv: ls('WANoiseInfoIv'),
    WAWebEncKeySalt: ls('WAWebEncKeySalt'),
    WALid: ls('WALid'),
    'last-wid-md': ls('last-wid-md'),
  };
  result.localStorage = localStorageDump;
  if (!localStorageDump.WANoiseInfo) errors.push('WANoiseInfo missing (not logged in?)');

  const noiseCandidates: NoiseCandidate[] = [];
  result.noiseCandidates = noiseCandidates;
  try {
    const dbKeyRec = (await getRecord('wawc_db_enc', 'keys', 1)) as { key: CryptoKey };
    const dbKey = dbKeyRec.key;
    const salt = fromB64(JSON.parse(ls('WAWebEncKeySalt') as string) as string);
    const ivs = (JSON.parse(ls('WANoiseInfoIv') as string) as string[]).map(fromB64);
    const noise = JSON.parse(ls('WANoiseInfo') as string) as { privKey: string; pubKey: string; recoveryToken?: string };
    const priv = fromB64(noise.privKey);
    const pub = fromB64(noise.pubKey);
    const aesKey = await crypto.subtle.deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt, info: new Uint8Array([0]) },
      dbKey, { name: 'AES-CBC', length: 128 }, false, ['decrypt'],
    );
    for (let i = 0; i < ivs.length; i++) {
      for (let j = 0; j < ivs.length; j++) {
        try {
          const pk = await crypto.subtle.decrypt({ name: 'AES-CBC', iv: ivs[i] }, aesKey, priv);
          const pubk = await crypto.subtle.decrypt({ name: 'AES-CBC', iv: ivs[j] }, aesKey, pub);
          if (pk.byteLength === 32 && pubk.byteLength === 32) {
            noiseCandidates.push({ privIv: i, pubIv: j, privateB64: b64(pk), publicB64: b64(pubk) });
          }
        } catch {}
      }
    }
    result.recoveryToken = noise.recoveryToken || null;
  } catch (e) {
    errors.push('noise: ' + String((e as Error)?.message || e));
  }

  async function decryptStatic(name: string): Promise<string> {
    const rec = (await getRecord('signal-storage', 'signal-meta-store', name)) as {
      value: { encKey: CryptoKey; value: BufferSource };
    };
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-CTR', counter: new Uint8Array(16), length: 64 }, rec.value.encKey, rec.value.value,
    );
    if (pt.byteLength !== 32) throw new Error(name + ' -> ' + pt.byteLength + ' bytes');
    return b64(pt);
  }
  try {
    result.signalStaticPrivB64 = await decryptStatic('signal_static_privkey');
    result.signalStaticPubB64 = await decryptStatic('signal_static_pubkey');
  } catch (e) {
    errors.push('signalStatic: ' + String((e as Error)?.message || e));
  }

  try {
    const metaNames = ['signal_reg_id', 'signal_next_pk_id', 'signal_first_unupload_pk_id', 'signal_last_spk_id', 'adv_signed_identity'];
    const meta: Record<string, SignalMetaRecord | undefined> = {};
    for (const n of metaNames) {
      meta[n] = encode(await getRecord('signal-storage', 'signal-meta-store', n)) as SignalMetaRecord | undefined;
    }
    result.signalMeta = meta;
    result.preKeys = await readAll('signal-storage', 'prekey-store');
    result.signedPreKeys = await readAll('signal-storage', 'signed-prekey-store');
    result.identities = await readAll('signal-storage', 'identity-store');
  } catch (e) {
    errors.push('signalStores: ' + String((e as Error)?.message || e));
  }

  return result;
}
