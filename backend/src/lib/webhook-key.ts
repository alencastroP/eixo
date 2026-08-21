import { randomBytes } from 'node:crypto';

/**
 * Identificadores da recepção de webhooks POR CONTA.
 *
 * São duas coisas distintas, de propósito:
 *
 *  - `webhookKey` ROTEIA. Vai na URL (`/webhooks/olx/wh_a1b2...`) e só responde
 *    "de qual loja é este lead". Não autentica nada, então não é segredo - o
 *    lojista pode colar essa URL no painel da plataforma sem receio.
 *
 *  - `inboundSecret` AUTENTICA. Vai no header (token) ou assina o corpo (HMAC),
 *    é próprio de cada loja e fica cifrado em repouso.
 *
 * A separação existe porque a verificação precisa saber QUAL segredo comparar
 * antes de comparar. Descobrir a conta testando o segredo contra todas seria
 * O(nº de contas) por requisição e abriria um canal de timing attack.
 */

/** Chave de roteamento: 128 bits em hex, com prefixo legível. */
export function generateWebhookKey(): string {
  return `wh_${randomBytes(16).toString('hex')}`;
}

/** Segredo de autenticação do webhook: 256 bits. */
export function generateInboundSecret(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * URL que o lojista cola no painel da plataforma. `baseUrl` vem de
 * WEBHOOK_PUBLIC_URL (o host do serviço de webhooks, não o da API).
 */
export function buildWebhookUrl(baseUrl: string, platform: string, webhookKey: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/webhooks/${platform}/${webhookKey}`;
}
