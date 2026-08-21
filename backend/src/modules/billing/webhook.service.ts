/**
 * Máquina de estados do billing - onde o dinheiro vira acesso.
 *
 * Este é o arquivo mais sensível do módulo, e a regra que o organiza é uma só:
 * **o gateway é a fonte da verdade sobre pagamento; o webhook é o único canal
 * por onde essa verdade entra**. Nada aqui confia no cliente, e o fluxo de
 * assinatura (billing.service.ts) nunca marca conta como ativa por conta
 * própria - ele cria o contrato e espera o evento chegar aqui.
 *
 * O caminho inverso (nós perguntando ao gateway) existe em `reconcile.service`
 * como rede de segurança para evento perdido, não como via normal.
 *
 * ── Como um pagamento vira acesso ────────────────────────────────────────────
 *
 *   PAYMENT_CONFIRMED  →  cobrança CONFIRMED  →  assinatura ACTIVE  →  conta ACTIVE
 *   PAYMENT_OVERDUE    →  cobrança OVERDUE    →  assinatura PAST_DUE →  conta ACTIVE (carência)
 *   (carência estourada, via dunning.service)                        →  conta PAST_DUE
 *   PAYMENT_REFUNDED / CHARGEBACK                                    →  conta SUSPENDED
 *
 * Duas decisões que valem explicação:
 *
 *  1. **CONFIRMED já libera** (não esperamos RECEIVED). CONFIRMED é "o cliente
 *     pagou"; RECEIVED é "o dinheiro liquidou na conta". Segurar o lojista
 *     fora do sistema por dois dias úteis esperando a liquidação de um boleto
 *     que ele já pagou é o pior atendimento possível, e o risco de estorno já
 *     está coberto pelo caminho de CHARGEBACK.
 *
 *  2. **OVERDUE não bloqueia na hora.** Cartão expirado é o motivo nº 1 de
 *     churn involuntário em SaaS - gente que queria continuar pagando e foi
 *     cortada. A conta segue ACTIVE durante a carência, com aviso na tela; o
 *     bloqueio é ato do dunning.service, depois do prazo.
 */
import {
  AccountStatus,
  BillingCycle,
  BillingEventStatus,
  ChargeStatus,
  SubscriptionStatus,
  type BillingCharge,
  type Prisma,
  type Subscription,
} from '@prisma/client';
import { resolveAccountEmail, sendEmail } from '../../lib/email';
import {
  billingAccessRestoredEmail,
  billingAccessSuspendedEmail,
  billingGraceStartedEmail,
} from '../../lib/email-templates';
import { logger } from '../../lib/logger';
import { prisma } from '../../lib/prisma';
import { env } from '../../config/env';
import { gateway, type GatewayCharge, type GatewayEvent } from './gateway';
import { upsertCharge } from './billing.service';

/** Status de cobrança que significam "pago" para efeito de liberar acesso. */
const PAID_STATUSES: ChargeStatus[] = [ChargeStatus.CONFIRMED, ChargeStatus.RECEIVED];

/** Status que significam "o dinheiro voltou" - acesso é suspenso. */
const REVERSED_STATUSES: ChargeStatus[] = [ChargeStatus.REFUNDED, ChargeStatus.CHARGEBACK];

export interface WebhookResult {
  /** false = evento já processado antes (reentrega). Nada foi reaplicado. */
  applied: boolean;
  eventId: string;
  type: string;
  accountId: string | null;
}

/**
 * Ponto de entrada da recepção. Persiste o evento BRUTO antes de qualquer
 * interpretação e responde ao gateway o mais rápido possível.
 *
 * A idempotência é do BANCO, não da aplicação: `billing_events.externalId` é
 * único, então uma reentrega (o Asaas reenvia sempre que não recebe 200) bate
 * na constraint e sai por `applied: false`, sem reaplicar nada. Uma checagem
 * em memória perderia essa corrida com duas instâncias no ar.
 */
export async function receiveEvent(rawPayload: unknown): Promise<WebhookResult> {
  const gw = gateway();
  const event = gw.parseEvent(rawPayload);

  if (!event) {
    logger.warn('billing: evento de webhook em formato desconhecido - ignorado');
    return { applied: false, eventId: 'desconhecido', type: 'desconhecido', accountId: null };
  }

  const accountId = await resolveAccount(event);

  try {
    await prisma.billingEvent.create({
      data: {
        gateway: gw.slug,
        externalId: event.externalId,
        type: event.type,
        payload: rawPayload as Prisma.InputJsonValue,
        accountId,
        status: BillingEventStatus.RECEIVED,
      },
    });
  } catch (err) {
    // P2002 = já recebemos este evento. É o caso NORMAL de reentrega, não um erro.
    if ((err as Prisma.PrismaClientKnownRequestError)?.code === 'P2002') {
      logger.info('billing: evento reentregue e já processado - ignorado', {
        externalId: event.externalId,
        type: event.type,
      });
      return { applied: false, eventId: event.externalId, type: event.type, accountId };
    }
    throw err;
  }

  try {
    await applyEvent(event, accountId);
    await prisma.billingEvent.update({
      where: { externalId: event.externalId },
      data: { status: BillingEventStatus.PROCESSED, processedAt: new Date() },
    });
    return { applied: true, eventId: event.externalId, type: event.type, accountId };
  } catch (err) {
    // O evento fica gravado como FAILED com o motivo. Não relançamos: devolver
    // 500 ao gateway faria ele reentregar, e a reentrega bateria na constraint
    // de idempotência sem nunca reprocessar. Quem recupera é a reconciliação.
    logger.error('billing: falha ao aplicar evento', { externalId: event.externalId, type: event.type, err });
    await prisma.billingEvent.update({
      where: { externalId: event.externalId },
      data: {
        status: BillingEventStatus.FAILED,
        error: err instanceof Error ? err.message.slice(0, 500) : 'erro desconhecido',
      },
    });
    return { applied: false, eventId: event.externalId, type: event.type, accountId };
  }
}

/**
 * Descobre de qual conta é o evento.
 *
 * Três caminhos, do mais confiável ao mais frouxo: a referência externa que
 * gravamos na criação, o vínculo da assinatura e o vínculo de uma cobrança que
 * já conhecemos. Falhando os três, o evento é órfão - registrado, nunca
 * aplicado. É o caso de uma cobrança avulsa criada à mão no painel do gateway.
 */
async function resolveAccount(event: GatewayEvent): Promise<string | null> {
  const charge = event.charge;
  if (!charge) return null;

  if (charge.accountRef) {
    const exists = await prisma.account.findUnique({ where: { id: charge.accountRef }, select: { id: true } });
    if (exists) return exists.id;
  }

  if (charge.externalSubscriptionId) {
    const subscription = await prisma.subscription.findFirst({
      where: { externalSubscriptionId: charge.externalSubscriptionId },
      select: { accountId: true },
    });
    if (subscription) return subscription.accountId;
  }

  const known = await prisma.billingCharge.findUnique({
    where: { externalId: charge.externalId },
    select: { accountId: true },
  });
  return known?.accountId ?? null;
}

/** Aplica o efeito do evento. Chamado uma única vez por evento (ver idempotência). */
async function applyEvent(event: GatewayEvent, accountId: string | null): Promise<void> {
  if (!event.charge || !accountId) {
    logger.info('billing: evento sem cobrança ou sem conta resolvida - apenas registrado', {
      type: event.type,
      externalId: event.externalId,
    });
    return;
  }

  const subscription = await prisma.subscription.findUnique({
    where: { accountId },
    include: { plan: true },
  });

  const charge = await upsertCharge(accountId, event.charge, subscription?.id ?? null);

  if (PAID_STATUSES.includes(charge.status)) {
    await applyPaid(accountId, charge, subscription, event.charge);
    return;
  }
  if (charge.status === ChargeStatus.OVERDUE) {
    await applyOverdue(accountId, charge);
    return;
  }
  if (REVERSED_STATUSES.includes(charge.status)) {
    await applyReversed(accountId, charge);
    return;
  }

  logger.info('billing: evento registrado sem mudança de acesso', {
    accountId,
    type: event.type,
    status: charge.status,
  });
}

/**
 * Fim do período pago a partir de uma cobrança confirmada.
 *
 * Preferimos o `nextDueDate` que o próprio gateway calcula - ele já considera
 * as regras de recorrência dele. O cálculo local é fallback para quando o
 * evento não traz essa informação.
 */
function periodEndFrom(charge: BillingCharge, cycle: BillingCycle, gatewayNextDue: Date | null): Date {
  if (gatewayNextDue) return gatewayNextDue;
  const base = charge.paidAt ?? charge.dueDate;
  const end = new Date(base);
  end.setMonth(end.getMonth() + (cycle === BillingCycle.YEARLY ? 12 : 1));
  return end;
}

/**
 * Pagamento confirmado: libera o acesso e estende o período.
 *
 * Reativa conta EXPIRED/PAST_DUE/SUSPENDED - é exatamente o caso do lojista
 * que deixou o trial vencer, voltou depois e assinou. Bloqueio por falta de
 * pagamento tem que ser desfeito pelo pagamento, sem passar pelo suporte.
 *
 * A única exceção é CANCELED: reativar uma conta que o cliente encerrou
 * exigiria uma decisão que não é nossa. Fica o registro e o suporte conduz.
 */
async function applyPaid(
  accountId: string,
  charge: BillingCharge,
  subscription: (Subscription & { plan: { id: string } }) | null,
  remote: GatewayCharge,
): Promise<void> {
  const account = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
  const cycle = subscription?.cycle ?? BillingCycle.MONTHLY;
  const periodEnd = periodEndFrom(charge, cycle, subscription?.nextDueDate ?? null);

  await prisma.$transaction(async (tx) => {
    if (subscription) {
      await tx.subscription.update({
        where: { accountId },
        data: {
          status: SubscriptionStatus.ACTIVE,
          currentPeriodEnd: periodEnd,
          // Cartão só é conhecido depois de uma cobrança paga - é o gateway
          // que devolve bandeira e 4 últimos dígitos, para exibição.
          ...(remote.cardBrand ? { cardBrand: remote.cardBrand } : {}),
          ...(remote.cardLast4 ? { cardLast4: remote.cardLast4 } : {}),
        },
      });
    }

    if (account.status !== AccountStatus.CANCELED) {
      await tx.account.update({
        where: { id: accountId },
        data: {
          status: AccountStatus.ACTIVE,
          // O plano contratado passa a valer de fato agora que foi pago.
          ...(subscription ? { planId: subscription.plan.id } : {}),
        },
      });
    }
  });

  logger.info('billing: pagamento confirmado - acesso liberado', {
    accountId,
    chargeId: charge.id,
    amountCents: charge.amountCents,
    statusAnterior: account.status,
    periodEnd,
  });

  // Só avisa "acesso liberado" quando a conta ESTAVA bloqueada. Numa renovação
  // mensal normal (conta já ACTIVE) o cliente não precisa de e-mail dizendo que
  // continua podendo usar o que já estava usando - isso é ruído, não aviso.
  const wasBlocked = account.status === AccountStatus.PAST_DUE || account.status === AccountStatus.EXPIRED;
  if (wasBlocked) {
    const to = await resolveAccountEmail(accountId);
    if (to) await sendEmail(to, billingAccessRestoredEmail({ accountName: account.name }));
  }
}

/**
 * Cobrança vencida: marca a assinatura, NÃO bloqueia a conta.
 *
 * O bloqueio é responsabilidade do dunning.service, depois da carência - ver
 * a nota no topo do arquivo sobre churn involuntário.
 */
async function applyOverdue(accountId: string, charge: BillingCharge): Promise<void> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: { subscription: { select: { status: true } } },
  });
  // Já estava em carência: outra cobrança da mesma assinatura venceu depois,
  // mas o aviso "não conseguimos confirmar seu pagamento" já foi mandado. Não
  // reenvia a cada cobrança nova - o cliente já sabe.
  const alreadyInGrace = account?.subscription?.status === SubscriptionStatus.PAST_DUE;

  await prisma.subscription.updateMany({
    where: { accountId },
    data: { status: SubscriptionStatus.PAST_DUE },
  });

  logger.warn('billing: cobrança vencida - conta em carência', {
    accountId,
    chargeId: charge.id,
    dueDate: charge.dueDate,
  });

  if (!alreadyInGrace && account) {
    const to = await resolveAccountEmail(accountId);
    if (to) await sendEmail(to, billingGraceStartedEmail({ accountName: account.name, graceDays: env.billing.graceDays }));
  }
}

/**
 * Estorno ou chargeback: suspende na hora.
 *
 * Aqui não há carência. Diferente do vencimento - onde o cliente provavelmente
 * quer continuar e só falhou a cobrança -, um estorno é a retirada ativa do
 * dinheiro, e manter o serviço aberto significa prestá-lo de graça enquanto se
 * discute a disputa.
 */
async function applyReversed(accountId: string, charge: BillingCharge): Promise<void> {
  const account = await prisma.account.findUnique({ where: { id: accountId }, select: { name: true } });

  await prisma.$transaction([
    prisma.account.update({ where: { id: accountId }, data: { status: AccountStatus.SUSPENDED } }),
    prisma.subscription.updateMany({ where: { accountId }, data: { status: SubscriptionStatus.PAST_DUE } }),
  ]);

  logger.error('billing: estorno/chargeback - conta suspensa', {
    accountId,
    chargeId: charge.id,
    status: charge.status,
    amountCents: charge.amountCents,
  });

  if (account) {
    const to = await resolveAccountEmail(accountId);
    if (to) await sendEmail(to, billingAccessSuspendedEmail({ accountName: account.name }));
  }
}
