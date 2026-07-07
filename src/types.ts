/**
 * WhatsApp connection settings, forwarded verbatim to the Pingo API (which
 * relays them to Evolution). The extension never applies these to WhatsApp Web
 * itself — it only carries them so a Sync-Session connection can be created /
 * reconnected with the same settings a QR-code connection collects.
 */
export interface SyncSettings {
  readMessages?: boolean;
  alwaysOnline?: boolean;
  groupsIgnore?: boolean;
  syncFullHistory?: boolean;
  rejectCall?: boolean;
  readStatus?: boolean;
}

export interface SyncConfig {
  name?: string;
  apiUrl?: string;
  authorization?: string;
  returnUrl?: string;
  settings?: SyncSettings;
}

export type CompleteConfig = Required<Pick<SyncConfig, 'name' | 'apiUrl' | 'authorization'>> &
  Pick<SyncConfig, 'returnUrl' | 'settings'>;

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
  settings?: SyncSettings;
}

export interface SyncOutcome {
  ok: boolean;
  status?: number | string;
  error?: string;
}

/** User-controlled on-screen UI preferences (stored under UI_SETTINGS_KEY). */
export interface UiSettings {
  /** Show the sync-status toast on WhatsApp Web. Default: true. */
  toastEnabled: boolean;
}

/**
 * Lifecycle stages surfaced to the user through the on-screen toast:
 *  - init            the extension is active and checking the session
 *  - payload-loaded  a complete Pingo config (payload) is present, sync starting
 *  - payload-missing no complete payload yet — nothing to sync, we stop
 *  - loading         extracting and uploading the session
 *  - redirecting     sync succeeded, sending the user back to Pingo
 *  - error           the sync failed
 */
export type SyncStage =
  | 'init'
  | 'payload-loaded'
  | 'payload-missing'
  | 'loading'
  | 'redirecting'
  | 'error';

/** background -> wa-content one-way message that drives the toast. */
export interface SyncProgressMessage {
  type: typeof SYNC_PROGRESS;
  stage: SyncStage;
  detail?: string;
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
/** Bridge -> page: unsolicited "I'm here" broadcast, emitted when the bridge loads. */
export const DETECT_ANNOUNCE = 'WA_SYNC_ANNOUNCE';

/** chrome.storage.local key holding the UiSettings object. */
export const UI_SETTINGS_KEY = 'uiSettings';
/** background -> wa-content message type carrying a SyncStage update. */
export const SYNC_PROGRESS = 'wa-sync-progress';
