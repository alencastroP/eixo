/**
 * Implementação do contrato PaymentGateway sobre o Asaas.
 *
 * Este é o único arquivo do projeto que conhece o formato do Asaas. Toda a
 * tradução mora aqui: enums em inglês, valores em reais, datas 'YYYY-MM-DD' e
 * o objeto `payment` viram os tipos normalizados de gateway/types.ts.
 *
 * Por que Asaas e não um adquirente puro: o que o produto precisa não é
 * "aceitar cartão", é motor de assinatura - recorrência, retentativa
 * automática, régua de inadimplência e NFS-e municipal emitida junto da
 * cobrança. Escrever dunning à mão é meses de trabalho no tipo de código onde
 * bug custa cliente e dinheiro real.
 */
import { BillingCycle, BillingMethod, ChargeStatus } from '@prisma/client';
import { env } from '../../../config/env';
import { logger } from '../../../lib/logger';
import { asaas, fromAsaasDate, toAsaasDate, toCents, toReais } from './asaas.client';
import type {
  GatewayCharge,
  GatewayCustomerInput,
  GatewayEvent,
  GatewayPix,
  GatewaySubscription,
  GatewaySubscriptionInput,
  PaymentGateway,
} from './types';

// ─── Formato cru do Asaas (só o que consumimos) ──────────────────────────────

interface AsaasCustomer {
  id: string;
}

interface AsaasSubscription {
  id: string;
  status: string;
  value: number;
  cycle: string;
  billingType: string;
  nextDueDate: string | null;
  deleted?: boolean;
}

interface AsaasPayment {
  id: string;
  subscription?: string | null;
  externalReference?: string | null;
  status: string;
  billingType: string;
  value: number;
  description?: string | null;
  dueDate: string;
  paymentDate?: string | null;
  clientPaymentDate?: string | null;
  confirmedDate?: string | null;
  invoiceUrl?: string | null;
  bankSlipUrl?: string | null;
  transactionReceiptUrl?: string | null;
  creditCard?: { creditCardBrand?: string | null; creditCardNumber?: string | null } | null;
}

interface AsaasPixQrCode {
  encodedImage?: string | null;
  payload: string;
  expirationDate?: string | null;
}

interface AsaasWebhookBody {
  id?: string;
  event?: string;
  dateCreated?: string;
  payment?: AsaasPayment;
}

// ─── Tradução de enums ───────────────────────────────────────────────────────

const BILLING_TYPE: Record<BillingMethod, string> = {
  [BillingMethod.CREDIT_CARD]: 'CREDIT_CARD',
  [BillingMethod.PIX]: 'PIX',
  [BillingMethod.BOLETO]: 'BOLETO',
};

const CYCLE: Record<BillingCycle, string> = {
  [BillingCycle.MONTHLY]: 'MONTHLY',
  [BillingCycle.YEARLY]: 'YEARLY',
};

function methodFrom(billingType: string): BillingMethod {
  switch (billingType) {
    case 'PIX':
      return BillingMethod.PIX;
    // 'UNDEFINED' é o modo em que o Asaas deixa o cliente escolher na fatura;
    // o documento gerado é o boleto (com PIX embutido).
    case 'BOLETO':
    case 'UNDEFINED':
      return BillingMethod.BOLETO;
    default:
      return BillingMethod.CREDIT_CARD;
  }
}

function cycleFrom(cycle: string): BillingCycle {
  return cycle === 'YEARLY' ? BillingCycle.YEARLY : BillingCycle.MONTHLY;
}

/**
 * Status da cobrança.
 *
 * A distinção que importa: CONFIRMED é "o cliente pagou" e RECEIVED é "o
 * dinheiro caiu na conta". Para LIBERAR ACESSO vale o primeiro - segurar o
 * lojista fora do sistema por até dois dias úteis esperando a liquidação de um
 * boleto que ele já pagou é o pior atendimento possível.
 */
function statusFrom(status: string): ChargeStatus {
  switch (status) {
    case 'CONFIRMED':
      return ChargeStatus.CONFIRMED;
    case 'RECEIVED':
    case 'RECEIVED_IN_CASH':
      return ChargeStatus.RECEIVED;
    case 'OVERDUE':
      return ChargeStatus.OVERDUE;
    case 'REFUNDED':
    case 'REFUND_REQUESTED':
    case 'REFUND_IN_PROGRESS':
      return ChargeStatus.REFUNDED;
    case 'CHARGEBACK_REQUESTED':
    case 'CHARGEBACK_DISPUTE':
    case 'AWAITING_CHARGEBACK_REVERSAL':
      return ChargeStatus.CHARGEBACK;
    case 'DELETED':
    case 'CANCELED':
      return ChargeStatus.CANCELED;
    case 'AWAITING_RISK_ANALYSIS':
    case 'PENDING':
      return ChargeStatus.PENDING;
    default:
      return ChargeStatus.PENDING;
  }
}

/** Cobranças pagas em CONFIRMED/RECEIVED carregam a data efetiva do pagamento. */
function paidAtFrom(payment: AsaasPayment): Date | null {
  return (
    fromAsaasDate(payment.paymentDate) ??
    fromAsaasDate(payment.confirmedDate) ??
    fromAsaasDate(payment.clientPaymentDate)
  );
}

function toCharge(payment: AsaasPayment): GatewayCharge {
  return {
    externalId: payment.id,
    externalSubscriptionId: payment.subscription ?? null,
    accountRef: payment.externalReference ?? null,
    status: statusFrom(payment.status),
    method: methodFrom(payment.billingType),
    amountCents: toCents(payment.value),
    description: payment.description ?? null,
    dueDate: fromAsaasDate(payment.dueDate) ?? new Date(),
    paidAt: paidAtFrom(payment),
    invoiceUrl: payment.invoiceUrl ?? null,
    bankSlipUrl: payment.bankSlipUrl ?? null,
    receiptUrl: payment.transactionReceiptUrl ?? null,
    // NFS-e é emitida pelo Asaas em fluxo próprio; o webhook de nota preenche
    // estes campos quando a emissão automática estiver ligada na conta.
    nfseStatus: null,
    nfseUrl: null,
    cardBrand: payment.creditCard?.creditCardBrand ?? null,
    // O Asaas devolve apenas os 4 últimos dígitos neste campo.
    cardLast4: payment.creditCard?.creditCardNumber ?? null,
  };
}

// ─── Gateway ─────────────────────────────────────────────────────────────────

export const asaasGateway: PaymentGateway = {
  slug: 'asaas',

  get enabled() {
    return Boolean(env.billing.asaas.apiKey);
  },

  async ensureCustomer(input: GatewayCustomerInput, existingId?: string | null): Promise<string> {
    const body = {
      name: input.name,
      cpfCnpj: input.cpfCnpj,
      email: input.email,
      mobilePhone: input.phone ?? undefined,
      postalCode: input.postalCode ?? undefined,
      addressNumber: input.addressNumber ?? undefined,
      // Amarra o pagador ao tenant: é por aqui que um evento órfão volta a
      // encontrar a conta dona dele.
      externalReference: input.accountRef,
      notificationDisabled: false,
    };

    if (existingId) {
      // Atualiza o cadastro existente. Se ele tiver sido removido no painel do
      // gateway, recria em vez de estourar - o lojista não tem como saber que
      // alguém apagou o cliente lá dentro.
      try {
        const updated = await asaas.post<AsaasCustomer>(`/customers/${existingId}`, body);
        return updated.id;
      } catch (err) {
        logger.warn('asaas: cliente existente não pôde ser atualizado, recriando', {
          customerId: existingId,
          err,
        });
      }
    }

    const created = await asaas.post<AsaasCustomer>('/customers', body);
    return created.id;
  },

  async createSubscription(input: GatewaySubscriptionInput): Promise<GatewaySubscription> {
    const created = await asaas.post<AsaasSubscription>('/subscriptions', {
      customer: input.customerId,
      billingType: BILLING_TYPE[input.method],
      value: toReais(input.amountCents),
      cycle: CYCLE[input.cycle],
      nextDueDate: toAsaasDate(input.firstDueDate),
      description: input.description,
      externalReference: input.accountRef,
      ...(env.billing.asaas.walletId ? { walletId: env.billing.asaas.walletId } : {}),
    });

    await configureNfse(created.id);
    return toSubscription(created);
  },

  async updateSubscription(subscriptionId, input): Promise<GatewaySubscription> {
    const updated = await asaas.post<AsaasSubscription>(`/subscriptions/${subscriptionId}`, {
      billingType: BILLING_TYPE[input.method],
      value: toReais(input.amountCents),
      cycle: CYCLE[input.cycle],
      description: input.description,
      // Aplica o novo valor da próxima cobrança em diante; as já emitidas
      // ficam como estão - refazer cobrança paga é pedir estorno indevido.
      updatePendingPayments: true,
    });
    return toSubscription(updated);
  },

  async cancelSubscription(subscriptionId: string): Promise<void> {
    await asaas.delete(`/subscriptions/${subscriptionId}`);
  },

  async listCharges(subscriptionId: string, limit = 24): Promise<GatewayCharge[]> {
    const page = await asaas.get<{ data: AsaasPayment[] }>(`/subscriptions/${subscriptionId}/payments`, {
      limit,
      offset: 0,
    });
    return (page.data ?? []).map(toCharge);
  },

  async getCharge(chargeId: string): Promise<GatewayCharge | null> {
    const payment = await asaas.get<AsaasPayment>(`/payments/${chargeId}`);
    return payment ? toCharge(payment) : null;
  },

  async getPix(chargeId: string): Promise<GatewayPix | null> {
    const qr = await asaas.get<AsaasPixQrCode>(`/payments/${chargeId}/pixQrCode`);
    if (!qr?.payload) return null;
    return {
      payload: qr.payload,
      qrCodeBase64: qr.encodedImage ?? null,
      expiresAt: fromAsaasDate(qr.expirationDate),
    };
  },

  parseEvent(payload: unknown): GatewayEvent | null {
    const body = payload as AsaasWebhookBody;
    if (!body?.event) return null;
    return {
      // Reentregas do Asaas repetem o `id` do evento - é o que torna o
      // processamento idempotente do lado de cá.
      externalId: body.id ?? `${body.event}:${body.payment?.id ?? 'sem-cobranca'}`,
      type: body.event,
      charge: body.payment ? toCharge(body.payment) : null,
    };
  },
};

/**
 * Liga a emissão automática de NFS-e municipal para a assinatura.
 *
 * É o item da lista fiscal que o gateway resolve sozinho: a cada cobrança paga
 * ele emite a nota de serviço no padrão da prefeitura, sem código nosso e sem
 * um segundo fornecedor. Depende de a conta do Asaas já ter certificado e
 * dados fiscais configurados no painel - por isso a chamada é BEST-EFFORT:
 * falhar aqui não pode derrubar uma assinatura que já foi criada e vai cobrar.
 * O lojista assina normalmente e a nota é regularizada depois.
 */
async function configureNfse(subscriptionId: string): Promise<void> {
  const { issueNfse, nfseServiceName, nfseObservations, nfseDaysBeforeDueDate } = env.billing.asaas;
  if (!issueNfse) return;

  try {
    await asaas.post(`/subscriptions/${subscriptionId}/invoiceSettings`, {
      municipalServiceName: nfseServiceName,
      // Emite só quando a cobrança é efetivamente paga - nota de fatura não
      // paga vira imposto recolhido sobre receita que não entrou.
      receivedOnly: true,
      daysBeforeDueDate: nfseDaysBeforeDueDate,
      effectiveDatePeriod: 'ON_PAYMENT_CONFIRMATION',
      observations: nfseObservations || undefined,
      deductions: 0,
    });
    logger.info('asaas: NFS-e automática configurada para a assinatura', { subscriptionId });
  } catch (err) {
    logger.error('asaas: não foi possível configurar a NFS-e automática', { subscriptionId, err });
  }
}

function toSubscription(raw: AsaasSubscription): GatewaySubscription {
  return {
    id: raw.id,
    rawStatus: raw.status,
    active: raw.status === 'ACTIVE' && !raw.deleted,
    nextDueDate: fromAsaasDate(raw.nextDueDate),
    cycle: cycleFrom(raw.cycle),
    method: methodFrom(raw.billingType),
    amountCents: toCents(raw.value),
  };
}
