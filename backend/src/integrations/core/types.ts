import type { Request } from 'express';

/**
 * Formato interno único de um lead, independente da plataforma de origem.
 * Todo adapter converte o payload bruto da sua plataforma para este shape -
 * o core (ingestão/tickets) só conhece NormalizedLead.
 */
export interface NormalizedLead {
  /** Id do lead na plataforma de origem - chave preferencial de deduplicação. */
  externalLeadId?: string;
  name: string;
  phone?: string;
  email?: string;
  message: string;
  /** Veículo de interesse (referência externa; o módulo de Estoque ainda não existe). */
  vehicle?: {
    externalId?: string;
    title?: string;
    price?: number;
    url?: string;
    [extra: string]: unknown;
  };
  campaign?: string;
  /** Timestamp informado pela plataforma (ISO), se houver. */
  platformReceivedAt?: string;
}

export type VerifyResult =
  | { ok: true }
  | {
      ok: false;
      /** true = havia segredo configurado e a verificação falhou (rejeitar sempre);
       *  false = segredo não configurado (rejeita em produção, aceita com aviso em dev). */
      configured: boolean;
      reason: string;
    };

/** Campo de credencial que o modal de conexão renderiza dinamicamente. */
export interface CredentialField {
  key: string;
  label: string;
  type: 'text' | 'password';
  placeholder?: string;
  help?: string;
  required?: boolean;
}

export type PlatformCredentials = Record<string, string>;

export interface CredentialCheck {
  ok: boolean;
  /** Rótulo da conta conectada (ex.: nome da loja), exibido no card. */
  accountLabel?: string;
  error?: string;
}

/**
 * Remetente que um atendente pode reivindicar como seu (WhatsApp: um número da
 * WABA da loja). O CRM não cria remetentes - apenas lista o que a plataforma já
 * tem provisionado, para o atendente escolher no perfil dele.
 */
export interface ChannelSender {
  /** Id do remetente na plataforma (Cloud API: phoneNumberId). */
  externalId: string;
  displayNumber: string;
  verifiedName?: string;
}

export interface OutboundReplyInput {
  credentials: PlatformCredentials;
  externalLeadId?: string | null;
  leadName: string;
  body: string;
  vehicle?: NormalizedLead['vehicle'];
  /**
   * Remetente a usar no lugar do padrão da conta, quando o atendente tem um
   * canal próprio conectado (WhatsApp: o phoneNumberId dele). Sem isso, todas
   * as respostas da loja sairiam pelo mesmo número e o cliente perderia a
   * referência de com quem estava falando. Ver UserChannel.
   */
  senderExternalId?: string | null;
  /** Telefone do destinatário (dígitos) - canais de mensageria endereçam por número. */
  recipientPhone?: string | null;
}

export interface OutboundResult {
  ok: boolean;
  error?: string;
  /** Referência retornada pela plataforma no envio (id da mensagem). */
  externalRef?: string;
}

/**
 * Contrato de um adapter de plataforma (padrão adapter/strategy).
 * Para adicionar uma nova plataforma: implementar esta interface em
 * src/integrations/<slug>/ e registrá-la em src/integrations/index.ts.
 * Nenhum outro código precisa mudar.
 *
 * Os campos INBOUND (verifyRequest/normalize) são obrigatórios. Os metadados de
 * conexão e o OUTBOUND (sendReply) são opcionais - uma plataforma pode ser
 * somente-recepção enquanto a comunicação bidirecional não estiver disponível.
 */
export interface LeadSourceAdapter {
  /** Slug usado na rota POST /webhooks/:platform e persistido em leads/tickets. */
  readonly platform: string;
  readonly displayName: string;
  /** Descrição curta exibida no card de integração. */
  readonly description?: string;
  /** URL da documentação oficial (link azul no modal de conexão). */
  readonly docsUrl?: string;
  /** Campos de credencial que o modal de conexão deve solicitar. */
  readonly credentialFields?: CredentialField[];
  /** true = suporta enviar respostas de volta ao cliente (comunicação bidirecional). */
  readonly supportsOutbound?: boolean;
  /**
   * true = cada atendente conecta um remetente próprio no perfil dele
   * (ver UserChannel e `listSenders`). Controla a seção "Canais de atendimento"
   * em Meus Dados.
   */
  readonly supportsUserChannels?: boolean;

  /**
   * Autenticação da requisição (token no header, HMAC do corpo etc.).
   *
   * `secret` é o segredo DAQUELA CONTA, já decifrado pela rota a partir da
   * integração resolvida pela webhookKey da URL. O adapter não lê variável de
   * ambiente: se lesse, o segredo voltaria a ser único para toda a instalação -
   * era exatamente esse o defeito que a separação por conta corrige.
   *
   * `credentials` chega decifrado para as plataformas que assinam o corpo com
   * uma credencial da própria conexão, e não com o segredo que geramos: a Meta
   * assina o webhook do WhatsApp com o App Secret do app. Continua opcional -
   * os adapters que só conferem um token no header ignoram o parâmetro.
   */
  verifyRequest(req: Request, secret: string, credentials?: PlatformCredentials): VerifyResult;

  /**
   * Handshake de ativação do webhook, quando a plataforma exige um GET antes de
   * começar a enviar eventos (Meta: devolve `hub.challenge`). Retorna o corpo
   * que a plataforma espera, ou null se a verificação falhar.
   *
   * Opcional: só a Meta faz isso hoje. Ver GET /webhooks/:platform/:webhookKey.
   */
  verifyChallenge?(req: Request, secret: string): string | null;

  /**
   * true = evento legítimo que NÃO vira ticket. O WhatsApp entrega recibos de
   * "entregue"/"lido" no mesmo webhook das mensagens; sem este filtro cada
   * recibo viraria um evento FAILED na fila, poluindo a saúde da integração
   * com falhas que não são falhas.
   */
  shouldIgnore?(payload: unknown): boolean;

  /** Converte o payload bruto para o formato interno. Lança AdapterPayloadError se inválido. */
  normalize(payload: unknown): NormalizedLead;

  /** Valida as credenciais informadas na conexão da conta. */
  validateCredentials?(credentials: PlatformCredentials): Promise<CredentialCheck>;

  /**
   * Remetentes já provisionados na conta da plataforma, para os atendentes
   * escolherem o seu. Só faz sentido com `supportsUserChannels`.
   */
  listSenders?(credentials: PlatformCredentials): Promise<ChannelSender[]>;

  /** Envia uma resposta do operador de volta ao cliente na plataforma (outbound). */
  sendReply?(input: OutboundReplyInput): Promise<OutboundResult>;
}

export class AdapterPayloadError extends Error {
  constructor(
    public readonly platform: string,
    message: string,
    public readonly issues?: unknown,
  ) {
    super(`[${platform}] ${message}`);
    this.name = 'AdapterPayloadError';
  }
}
