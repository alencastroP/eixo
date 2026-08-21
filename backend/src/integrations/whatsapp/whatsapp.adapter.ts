import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { z } from 'zod';
import { logger } from '../../lib/logger';
import {
  AdapterPayloadError,
  type ChannelSender,
  type CredentialCheck,
  type LeadSourceAdapter,
  type NormalizedLead,
  type OutboundReplyInput,
  type OutboundResult,
  type PlatformCredentials,
  type VerifyResult,
} from '../core/types';
import { normalizePhone, safeEqual } from '../core/verify';

/**
 * Adapter WhatsApp - Cloud API oficial da Meta.
 *
 * Diferente de OLX/Mercado Livre/Webmotors (mockados por dependerem de parceria
 * comercial), este fala com a API real: a Cloud API é pública, documentada e
 * gratuita até 1.000 conversas/mês, então não há motivo para simular.
 *
 * Duas pontas com donos diferentes:
 *   - a conta WhatsApp Business (WABA) é da LOJA e o admin a conecta em
 *     Integrações - é dela que vem o token usado em toda chamada;
 *   - o NÚMERO que fala com o cliente é de cada atendente (UserChannel), e
 *     entra no envio via `senderExternalId`.
 *
 * Autenticação do webhook, também em duas etapas e com segredos distintos:
 *   - ATIVAÇÃO (GET): a Meta manda `hub.verify_token`, que conferimos contra o
 *     `inboundSecret` da conta - valor que nós geramos e o lojista cola no
 *     painel da Meta;
 *   - EVENTOS (POST): a Meta assina o corpo com o App Secret do app em
 *     `X-Hub-Signature-256`. Esse segredo é DELA, não nosso, por isso chega em
 *     `credentials.appSecret` e não no parâmetro `secret`.
 */
const GRAPH_VERSION = 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

/** Timeout de rede: o webhook da Meta desiste rápido; não podemos pendurar a fila. */
const FETCH_TIMEOUT_MS = 10_000;

async function graphFetch(url: string, init: RequestInit & { accessToken: string }): Promise<Response> {
  const { accessToken, ...rest } = init;
  return fetch(url, {
    ...rest,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      ...rest.headers,
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

/** Mensagem de erro da Graph API sem vazar token nem corpo da conversa. */
async function graphError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: { message?: string; code?: number } };
    return data.error?.message ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

/**
 * Envelope de webhook da Cloud API. Só o que consumimos é tipado; o resto passa
 * (`passthrough`) porque a Meta acrescenta campos sem aviso e um schema estrito
 * transformaria cada novidade em evento FAILED.
 */
const whatsappPayloadSchema = z
  .object({
    object: z.string().optional(),
    entry: z
      .array(
        z
          .object({
            id: z.string().optional(),
            changes: z
              .array(
                z
                  .object({
                    field: z.string().optional(),
                    value: z
                      .object({
                        metadata: z
                          .object({
                            display_phone_number: z.string().optional(),
                            phone_number_id: z.string().optional(),
                          })
                          .passthrough()
                          .optional(),
                        contacts: z
                          .array(
                            z
                              .object({
                                wa_id: z.string().optional(),
                                profile: z.object({ name: z.string().optional() }).passthrough().optional(),
                              })
                              .passthrough(),
                          )
                          .optional(),
                        messages: z
                          .array(
                            z
                              .object({
                                id: z.string().optional(),
                                from: z.string().optional(),
                                timestamp: z.string().optional(),
                                type: z.string().optional(),
                                text: z.object({ body: z.string() }).passthrough().optional(),
                                button: z.object({ text: z.string().optional() }).passthrough().optional(),
                                interactive: z
                                  .object({
                                    button_reply: z.object({ title: z.string().optional() }).passthrough().optional(),
                                    list_reply: z.object({ title: z.string().optional() }).passthrough().optional(),
                                  })
                                  .passthrough()
                                  .optional(),
                              })
                              .passthrough(),
                          )
                          .optional(),
                        statuses: z.array(z.unknown()).optional(),
                      })
                      .passthrough()
                      .optional(),
                  })
                  .passthrough(),
              )
              .optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

/** Primeiro `changes[].value` que contém mensagem (a Meta pode lotear vários). */
function firstMessageChange(payload: unknown) {
  const parsed = whatsappPayloadSchema.safeParse(payload);
  if (!parsed.success) return null;
  for (const entry of parsed.data.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.value?.messages?.length) return change.value;
    }
  }
  return null;
}

/**
 * Texto legível de uma mensagem. O WhatsApp entrega mídia (áudio, imagem,
 * documento) sem texto - nesses casos registramos um marcador em vez de
 * descartar, senão o atendente veria um ticket com mensagem vazia e não saberia
 * que o cliente mandou um áudio.
 */
const MEDIA_LABEL: Record<string, string> = {
  audio: '[áudio recebido]',
  image: '[imagem recebida]',
  video: '[vídeo recebido]',
  document: '[documento recebido]',
  sticker: '[figurinha recebida]',
  location: '[localização recebida]',
  contacts: '[contato recebido]',
};

function messageText(message: {
  type?: string;
  text?: { body: string };
  button?: { text?: string };
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
}): string {
  const direct =
    message.text?.body ??
    message.button?.text ??
    message.interactive?.button_reply?.title ??
    message.interactive?.list_reply?.title;
  if (direct?.trim()) return direct.trim();
  return MEDIA_LABEL[message.type ?? ''] ?? '[mensagem recebida no WhatsApp]';
}

/**
 * Confirma que as credenciais funcionam consultando o próprio número na Graph
 * API. Chamada real: se o token expirou ou o phoneNumberId é de outra WABA, a
 * Meta rejeita aqui e o lojista descobre na hora de conectar, não quando o
 * primeiro cliente escrever.
 */
async function validateWhatsappCredentials(credentials: PlatformCredentials): Promise<CredentialCheck> {
  const phoneNumberId = (credentials.phoneNumberId ?? '').trim();
  const accessToken = (credentials.accessToken ?? '').trim();
  if (!phoneNumberId || !accessToken) {
    return { ok: false, error: 'Informe o ID do número de telefone e o token de acesso.' };
  }

  try {
    const res = await graphFetch(
      `${GRAPH_BASE}/${encodeURIComponent(phoneNumberId)}?fields=display_phone_number,verified_name`,
      { accessToken, method: 'GET' },
    );
    if (!res.ok) return { ok: false, error: `A Meta rejeitou as credenciais: ${await graphError(res)}` };

    const data = (await res.json()) as { display_phone_number?: string; verified_name?: string };
    const label = [data.verified_name, data.display_phone_number].filter(Boolean).join(' · ');
    return { ok: true, accountLabel: label || 'WhatsApp Business' };
  } catch (err) {
    // Timeout/DNS/rede: não é credencial errada, e dizer que é mandaria o
    // lojista procurar problema no lugar errado.
    logger.warn('whatsapp: falha de rede ao validar credenciais', { err });
    return { ok: false, error: 'Não foi possível falar com a API da Meta agora. Tente novamente.' };
  }
}

/**
 * Números já provisionados na WABA da loja, para cada atendente escolher o seu
 * em "Meus Dados". O CRM não provisiona números - isso é feito no painel da
 * Meta, com verificação de negócio; aqui só listamos o que já existe.
 */
async function listWhatsappSenders(credentials: PlatformCredentials): Promise<ChannelSender[]> {
  const wabaId = (credentials.businessAccountId ?? '').trim();
  const accessToken = (credentials.accessToken ?? '').trim();
  if (!wabaId || !accessToken) return [];

  const res = await graphFetch(
    `${GRAPH_BASE}/${encodeURIComponent(wabaId)}/phone_numbers?fields=id,display_phone_number,verified_name`,
    { accessToken, method: 'GET' },
  );
  if (!res.ok) throw new Error(await graphError(res));

  const data = (await res.json()) as {
    data?: Array<{ id?: string; display_phone_number?: string; verified_name?: string }>;
  };
  return (data.data ?? [])
    .filter((n): n is { id: string; display_phone_number?: string; verified_name?: string } => Boolean(n.id))
    .map((n) => ({
      externalId: n.id,
      displayNumber: n.display_phone_number ?? n.id,
      verifiedName: n.verified_name,
    }));
}

/**
 * Envia a resposta do atendente pela Cloud API.
 *
 * O remetente é o número do atendente (`senderExternalId`) quando ele conectou
 * um; senão cai no número padrão da loja. O destinatário vem do telefone do
 * lead - WhatsApp endereça por número, não pelo id do lead.
 *
 * Nunca loga o corpo da mensagem (PII) - apenas metadados.
 */
async function sendWhatsappReply(input: OutboundReplyInput): Promise<OutboundResult> {
  const accessToken = (input.credentials.accessToken ?? '').trim();
  const phoneNumberId = (input.senderExternalId || input.credentials.phoneNumberId || '').trim();
  const to = normalizePhone(input.recipientPhone);

  if (!accessToken || !phoneNumberId) return { ok: false, error: 'Credenciais do WhatsApp ausentes para envio.' };
  if (!to) return { ok: false, error: 'Lead sem telefone válido para envio no WhatsApp.' };

  try {
    const res = await graphFetch(`${GRAPH_BASE}/${encodeURIComponent(phoneNumberId)}/messages`, {
      accessToken,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { preview_url: false, body: input.body },
      }),
    });

    if (!res.ok) {
      const error = await graphError(res);
      logger.warn('whatsapp: envio rejeitado pela Meta', { phoneNumberId, status: res.status });
      return { ok: false, error };
    }

    const data = (await res.json()) as { messages?: Array<{ id?: string }> };
    const externalRef = data.messages?.[0]?.id;
    logger.info('whatsapp: resposta enviada ao cliente', { phoneNumberId, chars: input.body.length, externalRef });
    return { ok: true, externalRef };
  } catch (err) {
    logger.error('whatsapp: erro de rede no envio', { phoneNumberId, err });
    return { ok: false, error: 'Falha de rede ao enviar pelo WhatsApp.' };
  }
}

export const whatsappAdapter: LeadSourceAdapter = {
  platform: 'whatsapp',
  displayName: 'WhatsApp',
  description:
    'Receba e responda mensagens do WhatsApp Business direto no atendimento. Cada atendente conecta o próprio número.',
  docsUrl: 'https://developers.facebook.com/docs/whatsapp/cloud-api',
  supportsOutbound: true,
  supportsUserChannels: true,
  credentialFields: [
    {
      key: 'businessAccountId',
      label: 'ID da conta WhatsApp Business (WABA)',
      type: 'text',
      placeholder: 'ex.: 102290129340398',
      help: 'Meta Business Suite → Configurações → Contas do WhatsApp.',
      required: true,
    },
    {
      key: 'phoneNumberId',
      label: 'ID do número padrão',
      type: 'text',
      placeholder: 'ex.: 106540352242922',
      help: 'Número usado quando o atendente não tem um próprio conectado no perfil dele.',
      required: true,
    },
    {
      key: 'accessToken',
      label: 'Token de acesso permanente',
      type: 'password',
      placeholder: 'EAAG...',
      help: 'Gerado no app da Meta com a permissão whatsapp_business_messaging. Fica cifrado em repouso.',
      required: true,
    },
    {
      key: 'appSecret',
      label: 'Chave secreta do app',
      type: 'password',
      placeholder: 'ex.: 8a1f...',
      help: 'Meta for Developers → Configurações básicas. Usada para conferir a assinatura dos webhooks.',
      required: true,
    },
  ],

  validateCredentials: validateWhatsappCredentials,
  listSenders: listWhatsappSenders,
  sendReply: sendWhatsappReply,

  /**
   * Handshake de ativação: a Meta chama uma vez com GET e só passa a enviar
   * eventos se receber `hub.challenge` de volta em texto puro.
   */
  verifyChallenge(req: Request, secret: string): string | null {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode !== 'subscribe' || typeof token !== 'string' || typeof challenge !== 'string') return null;
    if (!secret || !safeEqual(token, secret)) return null;
    return challenge;
  },

  verifyRequest(req: Request, _secret: string, credentials?: PlatformCredentials): VerifyResult {
    // A assinatura é feita com o App Secret DA META, não com o segredo que
    // geramos - por isso o `secret` da conta não serve aqui.
    const appSecret = (credentials?.appSecret ?? '').trim();
    if (!appSecret) {
      return { ok: false, configured: false, reason: 'App Secret não configurado para esta conta' };
    }
    const header = req.header('x-hub-signature-256');
    if (!header) return { ok: false, configured: true, reason: 'header x-hub-signature-256 ausente' };
    if (!req.rawBody) return { ok: false, configured: true, reason: 'corpo bruto indisponível para verificação HMAC' };

    const expected = `sha256=${createHmac('sha256', appSecret).update(req.rawBody).digest('hex')}`;
    // Comparação direta em tempo constante: os dois lados têm o mesmo tamanho
    // fixo, então não precisa do hash-then-compare de core/verify.
    const a = Buffer.from(header);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { ok: false, configured: true, reason: 'assinatura X-Hub-Signature-256 inválida' };
    }
    return { ok: true };
  },

  /**
   * Recibos de entrega/leitura e mudanças de configuração chegam no mesmo
   * webhook das mensagens. São eventos válidos que simplesmente não viram
   * ticket - marcar como falha encheria a tela de integrações de erro falso.
   */
  shouldIgnore(payload: unknown): boolean {
    return firstMessageChange(payload) === null;
  },

  normalize(payload: unknown): NormalizedLead {
    const value = firstMessageChange(payload);
    if (!value) throw new AdapterPayloadError('whatsapp', 'payload sem mensagem de cliente');

    const message = value.messages![0];
    const from = normalizePhone(message.from);
    if (!from) throw new AdapterPayloadError('whatsapp', 'mensagem sem telefone de origem');

    // O nome vem do perfil público do WhatsApp; quando o cliente não tem um
    // definido, o número é o melhor rótulo disponível.
    const contact = value.contacts?.find((c) => c.wa_id === message.from) ?? value.contacts?.[0];
    const name = contact?.profile?.name?.trim() || `WhatsApp ${from}`;

    return {
      // Id da mensagem, não do cliente: cada mensagem é única, então a dedup de
      // lead cai no telefone (fallback já previsto na ingestão) e a de ticket na
      // janela de tempo. É o comportamento correto para uma conversa contínua.
      externalLeadId: undefined,
      name,
      phone: from,
      message: messageText(message),
      platformReceivedAt: message.timestamp
        ? new Date(Number(message.timestamp) * 1000).toISOString()
        : undefined,
    };
  },
};
