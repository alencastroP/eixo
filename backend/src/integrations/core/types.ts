import type { Request } from 'express';

/**
 * Formato interno único de um lead, independente da plataforma de origem.
 * Todo adapter converte o payload bruto da sua plataforma para este shape —
 * o core (ingestão/tickets) só conhece NormalizedLead.
 */
export interface NormalizedLead {
  /** Id do lead na plataforma de origem — chave preferencial de deduplicação. */
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

export interface OutboundReplyInput {
  credentials: PlatformCredentials;
  externalLeadId?: string | null;
  leadName: string;
  body: string;
  vehicle?: NormalizedLead['vehicle'];
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
 * conexão e o OUTBOUND (sendReply) são opcionais — uma plataforma pode ser
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

  /** Autenticação da requisição (token compartilhado, HMAC etc. — específico da plataforma). */
  verifyRequest(req: Request): VerifyResult;
  /** Converte o payload bruto para o formato interno. Lança AdapterPayloadError se inválido. */
  normalize(payload: unknown): NormalizedLead;

  /** Valida as credenciais informadas na conexão da conta. */
  validateCredentials?(credentials: PlatformCredentials): Promise<CredentialCheck>;
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
