/**
 * Gate for "is this extracted WhatsApp Web session complete enough to sync?".
 *
 * These are exactly the fields Evolution's session parser dereferences. Right
 * after a QR login WhatsApp writes them progressively — the signed-prekey metadata
 * (signal_last_spk_id and friends) and the signed-prekey store are written LAST,
 * during the initial server handshake — so a session extracted too early is missing
 * them and makes Evolution crash. We therefore wait until ALL of them are present
 * before POSTing; an already-logged-in session has them from the first tick.
 *
 * Returns the list of missing field names (empty = ready to sync).
 */
export function sessionMissingFields(s: any): string[] {
  if (!s || typeof s !== 'object') return ['session'];
  const missing: string[] = [];

  if (!(Array.isArray(s.noiseCandidates) && s.noiseCandidates.length > 0)) missing.push('noiseCandidates');
  if (!s.signalStaticPrivB64 || !s.signalStaticPubB64) missing.push('signalStatic');
  if (!s.localStorage || !s.localStorage['last-wid-md']) missing.push('last-wid-md');

  const meta = s.signalMeta ?? {};
  for (const k of ['signal_reg_id', 'signal_next_pk_id', 'signal_first_unupload_pk_id', 'signal_last_spk_id']) {
    if (meta[k]?.value == null) missing.push('signalMeta.' + k);
  }
  if (!meta.adv_signed_identity?.value?.details) missing.push('signalMeta.adv_signed_identity');

  // The signed prekey referenced by signal_last_spk_id must already be stored.
  const spkId = meta.signal_last_spk_id?.value;
  const hasSpk = Array.isArray(s.signedPreKeys) && s.signedPreKeys.some((r: any) => r?.value?.keyId === spkId);
  if (spkId != null && !hasSpk) missing.push('signedPreKeys[signal_last_spk_id]');

  return missing;
}
