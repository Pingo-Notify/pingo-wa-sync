/** Configuration that a website (e.g. Pingo) can send and the extension stores. */
export interface SyncConfig {
  name?: string;
  apiUrl?: string;
  authorization?: string;
  /** Where to navigate the tab back to after a successful sync (Pingo goback). */
  returnUrl?: string;
}

/** Complete config: the three core fields required; returnUrl optional. */
export type CompleteConfig = Required<Pick<SyncConfig, 'name' | 'apiUrl' | 'authorization'>> &
  Pick<SyncConfig, 'returnUrl'>;

/** Guard state used to avoid re-sending the same session repeatedly. */
export interface SyncGuardState {
  lastSyncedWid?: string | null;
  lastSyncedAt?: number;
  lastStatus?: number | string;
}

/** HTTP request ready for fetch. */
export interface SyncRequest {
  url: string;
  method: 'POST';
  headers: Record<string, string>;
  body: string;
}

/** Marker used in window.postMessage messages coming from a website. */
export const CONFIG_SOURCE = 'WA_SYNC_CONFIG';
export const CONFIG_ACK = 'WA_SYNC_CONFIG_ACK';

/** Detection handshake: a page posts DETECT, the extension replies DETECT_ACK. */
export const DETECT_PING = 'WA_SYNC_DETECT';
export const DETECT_PONG = 'WA_SYNC_DETECT_ACK';
