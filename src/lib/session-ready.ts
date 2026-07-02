import type { SessionExport } from '../types';

export function sessionMissingFields(session: unknown): string[] {
  if (!session || typeof session !== 'object') return ['session'];
  const s = session as SessionExport;
  const missing: string[] = [];

  if (!(Array.isArray(s.noiseCandidates) && s.noiseCandidates.length > 0)) missing.push('noiseCandidates');
  if (!s.signalStaticPrivB64 || !s.signalStaticPubB64) missing.push('signalStatic');
  if (!s.localStorage || !s.localStorage['last-wid-md']) missing.push('last-wid-md');

  const meta = s.signalMeta ?? {};
  for (const k of ['signal_reg_id', 'signal_next_pk_id', 'signal_first_unupload_pk_id', 'signal_last_spk_id']) {
    if (meta[k]?.value == null) missing.push('signalMeta.' + k);
  }
  if (!isAdvSignedIdentity(meta.adv_signed_identity)) missing.push('signalMeta.adv_signed_identity');

  const spkId = meta.signal_last_spk_id?.value;
  const hasSpk = Array.isArray(s.signedPreKeys) && s.signedPreKeys.some((r) => r?.value?.keyId === spkId);
  if (spkId != null && !hasSpk) missing.push('signedPreKeys[signal_last_spk_id]');

  return missing;
}

function isAdvSignedIdentity(record: { value: unknown } | undefined): boolean {
  const value = record?.value;
  return typeof value === 'object' && value !== null && 'details' in value && (value as { details: unknown }).details != null;
}
