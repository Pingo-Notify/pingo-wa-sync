import type { SyncStage } from '../types';

const STAGES: readonly SyncStage[] = [
  'init',
  'payload-loaded',
  'payload-missing',
  'loading',
  'redirecting',
  'error',
];

export function isSyncStage(v: unknown): v is SyncStage {
  return typeof v === 'string' && (STAGES as readonly string[]).includes(v);
}

export type StageKind = 'working' | 'success' | 'idle' | 'error';

export interface StageView {
  title: string;
  subtitle: string;
  kind: StageKind;
  /**
   * Milliseconds until the toast auto-dismisses. 0 means "keep it up until a
   * newer stage replaces it" (the controller still applies a long safety
   * fallback so a working toast can never linger forever).
   */
  ttl: number;
}

/**
 * User-facing copy for each lifecycle stage. Titles keep the "Wa Sync" wordmark
 * the user asked for; subtitles add just enough context so nobody feels lost.
 * (Product copy is pt-BR by request; code/logs stay English.)
 */
export function stageView(stage: SyncStage): StageView {
  switch (stage) {
    case 'init':
      return {
        title: 'Wa Sync inicializado',
        subtitle: 'Verificando a sua sessão do WhatsApp…',
        kind: 'working',
        ttl: 4000,
      };
    case 'payload-loaded':
      return {
        title: 'Wa Sync — payload carregado',
        subtitle: 'Configuração recebida do Pingo.',
        kind: 'working',
        ttl: 0,
      };
    case 'payload-missing':
      return {
        title: 'Wa Sync — payload não carregado',
        subtitle: 'Nada para sincronizar por enquanto.',
        kind: 'idle',
        ttl: 6000,
      };
    case 'loading':
      return {
        title: 'Wa Sync carregando informações',
        subtitle: 'Preparando os dados da sessão…',
        kind: 'working',
        ttl: 0,
      };
    case 'redirecting':
      return {
        title: 'Wa Sync redirecionando',
        subtitle: 'Tudo pronto! Voltando para o Pingo…',
        kind: 'success',
        ttl: 0,
      };
    case 'error':
      return {
        title: 'Wa Sync — falha na sincronização',
        subtitle: 'Tente novamente pelo painel do Pingo.',
        kind: 'error',
        ttl: 9000,
      };
  }
}
