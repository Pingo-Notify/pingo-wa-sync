// @ts-nocheck
/**
 * Functions that run INSIDE the web.whatsapp.com page (MAIN world), injected
 * via chrome.scripting.executeScript({ world: 'MAIN', func }).
 *
 * IMPORTANT: each function must be 100% SELF-CONTAINED (nested helpers), because
 * Chrome serializes the function via toString() and it loses the module scope.
 * Hence no imports here, and @ts-nocheck (browser code).
 *
 * Decryption happens inside the page because the master key in wawc_db_enc is a
 * NON-EXTRACTABLE CryptoKey (it can only be used, never exported).
 * Method based on WhiskeySockets/Baileys#2672 (familymachlin-git).
 */

/** Detect an active login by reading localStorage + IndexedDB (no decryption). */
export async function detectWhatsAppLoginPage() {
  const out = { loggedIn: false, wid: null, lid: null, checks: {}, error: null };
  try {
    const ls = (k) => localStorage.getItem(k);
    const noise = ls('WANoiseInfo');
    const widRaw = ls('last-wid-md');
    const lidRaw = ls('WALid');
    out.checks.WANoiseInfo = !!noise;
    out.checks['last-wid-md'] = !!widRaw;
    out.checks.WALid = !!lidRaw;
    try { out.wid = widRaw ? JSON.parse(widRaw) : null; } catch (_) { out.wid = widRaw; }
    try { out.lid = lidRaw ? JSON.parse(lidRaw) : null; } catch (_) { out.lid = lidRaw; }

    let hasSignalReg = false;
    try {
      hasSignalReg = await new Promise((resolve) => {
        const req = indexedDB.open('signal-storage');
        req.onerror = () => resolve(false);
        req.onsuccess = () => {
          const db = req.result;
          try {
            const tx = db.transaction('signal-meta-store', 'readonly');
            const g = tx.objectStore('signal-meta-store').get('signal_reg_id');
            g.onsuccess = () => { db.close(); resolve(g.result != null); };
            g.onerror = () => { db.close(); resolve(false); };
          } catch (_) { db.close(); resolve(false); }
        };
      });
    } catch (_) { /* no signal-storage */ }
    out.checks.signalRegId = hasSignalReg;
    out.loggedIn = !!(noise && hasSignalReg);
  } catch (e) {
    out.error = String((e && e.message) || e);
  }
  return out;
}

/**
 * Clear this browser's WhatsApp session AND redirect the tab — as one atomic,
 * SYNCHRONOUS step inside the page. The order matters: we remove the login keys and
 * then call location.replace() with NO await in between, so the redirect starts
 * before the WhatsApp app can react to the wiped storage by reloading itself back
 * to web.whatsapp.com (which is what was overriding our redirect).
 *
 * This does NOT log out / unlink the device: it only deletes the local session copy,
 * so the copied session stays valid for the backend. Removing the localStorage login
 * keys already de-authenticates the page (next load shows the QR); the IndexedDB
 * deletes are fired best-effort and finalize once this navigation closes the app's
 * open DB connections.
 */
export function clearSessionAndRedirectPage(redirectUrl) {
  // 1) Synchronously drop the login material (noise keys, salt, wid/lid). This is
  //    the step that actually prevents a future reconnect, and it cannot be raced.
  try {
    const lsKeys = ['WANoiseInfo', 'WANoiseInfoIv', 'WAWebEncKeySalt', 'WALid', 'last-wid-md'];
    for (const k of lsKeys) {
      try { localStorage.removeItem(k); } catch (_) { /* ignore one key */ }
    }
  } catch (_) { /* localStorage unavailable */ }

  // 2) Fire-and-forget delete of the session databases. We do NOT await: awaiting a
  //    blocked delete (the app still holds connections) is exactly what gave WhatsApp
  //    time to reload. The delete is queued and finalizes when the navigation below
  //    closes those connections.
  try {
    for (const db of ['signal-storage', 'wawc_db_enc']) {
      try { indexedDB.deleteDatabase(db); } catch (_) { /* ignore one db */ }
    }
  } catch (_) { /* indexedDB unavailable */ }

  // 3) Drop any unload guard and hard-redirect from within the page, immediately.
  try { window.onbeforeunload = null; } catch (_) { /* ignore */ }
  window.location.replace(redirectUrl);
}

/** Extract + decrypt the full session and return a JSON-serializable object. */
export async function extractWhatsAppSessionPage() {
  function b64(bytes) {
    const arr = bytes instanceof ArrayBuffer
      ? new Uint8Array(bytes)
      : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let s = '';
    for (const x of arr) s += String.fromCharCode(x);
    return btoa(s);
  }
  function fromB64(value) {
    return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
  }
  function encode(value) {
    if (value == null) return value;
    if (value instanceof ArrayBuffer) return { __ab: b64(value) };
    if (ArrayBuffer.isView(value)) return { __ab: b64(value) };
    if (Array.isArray(value)) return value.map(encode);
    if (typeof value === 'object') {
      if (value.constructor && value.constructor.name === 'CryptoKey') return { __cryptoKey: true };
      const o = {};
      for (const [k, v] of Object.entries(value)) o[k] = encode(v);
      return o;
    }
    return value;
  }
  function openDB(dbName) {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(dbName);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
    });
  }
  async function getRecord(dbName, storeName, key) {
    const db = await openDB(dbName);
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const g = tx.objectStore(storeName).get(key);
        g.onsuccess = () => resolve(g.result);
        g.onerror = () => reject(g.error);
      });
    } finally { db.close(); }
  }
  async function readAll(dbName, storeName) {
    const db = await openDB(dbName);
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const rows = [];
        const cursor = tx.objectStore(storeName).openCursor();
        cursor.onsuccess = () => {
          const c = cursor.result;
          if (c) { rows.push({ key: encode(c.key), value: encode(c.value) }); c.continue(); }
        };
        cursor.onerror = () => reject(cursor.error);
        tx.oncomplete = () => resolve(rows);
        tx.onerror = () => reject(tx.error);
      });
    } finally { db.close(); }
  }
  const ls = (k) => localStorage.getItem(k);
  const result = { version: 1, errors: [] };

  result.localStorage = {
    WANoiseInfo: ls('WANoiseInfo'),
    WANoiseInfoIv: ls('WANoiseInfoIv'),
    WAWebEncKeySalt: ls('WAWebEncKeySalt'),
    WALid: ls('WALid'),
    'last-wid-md': ls('last-wid-md'),
  };
  if (!result.localStorage.WANoiseInfo) result.errors.push('WANoiseInfo missing (not logged in?)');

  // Noise keys: HKDF -> AES-CBC using the non-extractable CryptoKey from wawc_db_enc.
  result.noiseCandidates = [];
  try {
    const dbKeyRec = await getRecord('wawc_db_enc', 'keys', 1);
    const dbKey = dbKeyRec.key;
    const salt = fromB64(JSON.parse(ls('WAWebEncKeySalt')));
    const ivs = JSON.parse(ls('WANoiseInfoIv')).map(fromB64);
    const noise = JSON.parse(ls('WANoiseInfo'));
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
            result.noiseCandidates.push({ privIv: i, pubIv: j, privateB64: b64(pk), publicB64: b64(pubk) });
          }
        } catch (_) { /* invalid combination */ }
      }
    }
    result.recoveryToken = noise.recoveryToken || null;
  } catch (e) {
    result.errors.push('noise: ' + String((e && e.message) || e));
  }

  // Signal static identity: AES-CTR with each record's own encKey.
  async function decryptStatic(name) {
    const rec = await getRecord('signal-storage', 'signal-meta-store', name);
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
    result.errors.push('signalStatic: ' + String((e && e.message) || e));
  }

  // Signal meta / prekeys / identities.
  try {
    const metaNames = ['signal_reg_id', 'signal_next_pk_id', 'signal_first_unupload_pk_id', 'signal_last_spk_id', 'adv_signed_identity'];
    const meta = {};
    for (const n of metaNames) meta[n] = encode(await getRecord('signal-storage', 'signal-meta-store', n));
    result.signalMeta = meta;
    result.preKeys = await readAll('signal-storage', 'prekey-store');
    result.signedPreKeys = await readAll('signal-storage', 'signed-prekey-store');
    result.identities = await readAll('signal-storage', 'identity-store');
  } catch (e) {
    result.errors.push('signalStores: ' + String((e && e.message) || e));
  }

  return result;
}
