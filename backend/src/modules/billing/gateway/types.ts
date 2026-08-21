/**
 * Contrato do gateway de recorrência - a fronteira entre o produto e quem
 * move dinheiro.
 *
 * Existe por uma razão prática, não por purismo: trocar de gateway (ou rodar
 * dois em paralelo numa migração) não pode significar reescrever o módulo de
 * pagamentos. Tudo que o resto do código conhece é esta interface; o formato
 * do Asaas - nomes de campo, enums em inglês, datas 'YYYY-MM-DD' - morre
 * dentro de asaas.gateway.ts.
 *
 * Convenções que valem para qualquer implementação:
 *  - valores SEMPRE em centavos (int), nunca float de reais;
 *  - datas SEMPRE como Date, nunca string do provedor;
 *  - dado de cartão NUNCA atravessa esta fronteira (ver createSubscription).
 */
import type { BillingCycle, BillingMethod, ChargeStatus } from '@prisma/client';

export interface GatewayCustomerInput {
  /** Referência externa gravada no gateway - é o accountId do tenant. */
  accountRef: string;
  name: string;
  /** CPF ou CNPJ, só dígitos. Obrigatório no Brasil. */
  cpfCnpj: string;
  email: string;
  phone?: string | null;
  postalCode?: string | null;
  addressNumber?: string | null;
}

export interface GatewaySubscriptionInput {
  customerId: string;
  accountRef: string;
  /** Aparece na fatura e no extrato do cliente. */
  description: string;
  amountCents: number;
  cycle: BillingCycle;
  method: BillingMethod;
  /** Primeiro vencimento. No fim do trial, é o dia seguinte ao término. */
  firstDueDate: Date;
}

export interface GatewaySubscription {
  id: string;
  /** Status cru do provedor, guardado só para diagnóstico. */
  rawStatus: string;
  active: boolean;
  nextDueDate: Date | null;
  cycle: BillingCycle;
  method: BillingMethod;
  amountCents: number;
}

/** Uma cobrança emitida pelo gateway, já normalizada. */
export interface GatewayCharge {
  externalId: string;
  externalSubscriptionId: string | null;
  /** accountId do tenant, lido do externalReference gravado na criação. */
  accountRef: string | null;
  status: ChargeStatus;
  method: BillingMethod;
  amountCents: number;
  description: string | null;
  dueDate: Date;
  paidAt: Date | null;
  /** Página de pagamento hospedada - onde o cartão é digitado (fora do nosso escopo PCI). */
  invoiceUrl: string | null;
  bankSlipUrl: string | null;
  receiptUrl: string | null;
  nfseStatus: string | null;
  nfseUrl: string | null;
  /** Só para exibição - o número do cartão nunca chega aqui. */
  cardBrand: string | null;
  cardLast4: string | null;
}

/** QR/copia-e-cola do PIX, buscado sob demanda (tem validade). */
export interface GatewayPix {
  payload: string;
  qrCodeBase64: string | null;
  expiresAt: Date | null;
}

/** Evento de webhook já normalizado. */
export interface GatewayEvent {
  externalId: string;
  type: string;
  charge: GatewayCharge | null;
}

export interface PaymentGateway {
  readonly slug: string;
  /** false quando falta credencial - as rotas de escrita respondem 503. */
  readonly enabled: boolean;

  /** Cria (ou atualiza) o pagador no gateway e devolve o id dele. */
  ensureCustomer(input: GatewayCustomerInput, existingId?: string | null): Promise<string>;

  /**
   * Cria a assinatura recorrente.
   *
   * Deliberadamente NÃO recebe dados de cartão: o cliente digita o cartão na
   * página hospedada do gateway (`GatewayCharge.invoiceUrl`), que tokeniza e
   * passa a renovar sozinho. É o que mantém a operação em SAQ-A - número de
   * cartão não entra nesta API, não trafega no nosso servidor e não existe no
   * nosso banco.
   */
  createSubscription(input: GatewaySubscriptionInput): Promise<GatewaySubscription>;

  /** Troca de plano/ciclo/meio de pagamento sobre a assinatura existente. */
  updateSubscription(
    subscriptionId: string,
    input: Pick<GatewaySubscriptionInput, 'amountCents' | 'cycle' | 'method' | 'description'>,
  ): Promise<GatewaySubscription>;

  cancelSubscription(subscriptionId: string): Promise<void>;

  /** Cobranças de uma assinatura, da mais recente para a mais antiga. */
  listCharges(subscriptionId: string, limit?: number): Promise<GatewayCharge[]>;

  getCharge(chargeId: string): Promise<GatewayCharge | null>;

  getPix(chargeId: string): Promise<GatewayPix | null>;

  /** Traduz o corpo de um webhook. Retorna null se o formato for desconhecido. */
  parseEvent(payload: unknown): GatewayEvent | null;
}
