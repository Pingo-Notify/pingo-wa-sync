export interface SyncConfig {
  name?: string;
  apiUrl?: string;
  authorization?: string;
  returnUrl?: string;
}

export type CompleteConfig = Required<Pick<SyncConfig, 'name' | 'apiUrl' | 'authorization'>> &
  Pick<SyncConfig, 'returnUrl'>;

export interface SyncGuardState {
  lastSyncedWid?: string | null;
  lastSyncedAt?: number;
  lastStatus?: number | string;
}

export interface SyncRequest {
  url: string;
  method: 'POST';
  headers: Record<string, string>;
  body: string;
}

export interface RedactedConfig {
  name?: string;
  apiUrl?: string;
  authorization?: string;
  returnUrl?: string;
}

export interface SyncOutcome {
  ok: boolean;
  status?: number | string;
  error?: string;
}

export interface MessageResponse {
  ok?: boolean;
  installed?: boolean;
  version?: string;
  error?: string;
  complete?: boolean;
  config?: RedactedConfig;
  state?: SyncGuardState;
}

export interface SessionExport {
  version?: number;
  errors?: string[];
  localStorage?: Record<string, string | null>;
  noiseCandidates?: NoiseCandidate[];
  recoveryToken?: string | null;
  signalStaticPrivB64?: string;
  signalStaticPubB64?: string;
  signalMeta?: Record<string, SignalMetaRecord | undefined>;
  preKeys?: SignalStoreRow[];
  signedPreKeys?: SignalStoreRow[];
  identities?: SignalStoreRow[];
}

export interface NoiseCandidate {
  privIv?: number;
  pubIv?: number;
  privateB64: string;
  publicB64: string;
}

export interface SignalMetaRecord {
  value: unknown;
}

export interface SignalStoreRow {
  key: unknown;
  value?: SignalStoreRowValue;
}

export interface SignalStoreRowValue {
  keyId?: number;
  keyPair?: unknown;
  [field: string]: unknown;
}

export const CONFIG_SOURCE = 'WA_SYNC_CONFIG';
export const CONFIG_ACK = 'WA_SYNC_CONFIG_ACK';

export const DETECT_PING = 'WA_SYNC_DETECT';
export const DETECT_PONG = 'WA_SYNC_DETECT_ACK';
