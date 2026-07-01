# Pingo WhatsApp Sync

Extensão que **sincroniza a sessão atual do seu WhatsApp Web com o Pingo Notify**, criando a conexão entre a sua conta e o Pingo.

## Como funciona

- A sincronização é **uma escolha sua**: você inicia a conexão pelo painel do Pingo, já logado(a).
- O Pingo envia a configuração (o *payload*: `name`, `apiUrl` e `authorization`) para a extensão.
- **Nada é sincronizado enquanto esse payload não estiver preenchido.** Só depois de recebê-lo, com o WhatsApp Web aberto e logado, a extensão envia a sessão para a API do Pingo.

## Segurança

- Só o Pingo (`pingonotify.com`) pode configurar a extensão; a sessão só é enviada para o Pingo.
- O código é aberto — dá para conferir tudo em [`src/`](src/), começando por [`background.ts`](src/background.ts) (fluxo) e [`origins.ts`](src/lib/origins.ts) (só-Pingo).
