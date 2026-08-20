import { InteractionType, TicketStatus } from '@prisma/client';
import { logger } from '../../lib/logger';
import { prisma } from '../../lib/prisma';
import { dispatchOutboundReply } from '../../integrations/outbound';
import { generateFollowUp } from './followup.generator';
import { computeNextAction, getPolicy, type ResolvedPolicy } from './flow.service';

/**
 * Executor do motor de fluxo. Roda junto do worker de leads (mesmo processo,
 * mesma cadência) e cuida do lado "tempo" do atendimento.
 *
 * ── Por que não há tabela de jobs ───────────────────────────────────────────
 * O vencimento vive no próprio ticket (`nextActionAt`), com índice. Isso dá três
 * coisas de graça: mudar a política vale na hora para todos os tickets sem
 * reescrever linhas agendadas; não há job órfão para limpar; e cancelar é
 * recalcular um campo, não caçar e apagar registros.
 *
 * ── Idempotência ────────────────────────────────────────────────────────────
 * O claim é o mesmo padrão da fila de webhooks: um UPDATE condicional que só
 * vence se `nextActionAt` ainda for o valor observado. Duas instâncias do worker
 * disputando o mesmo ticket resultam em uma vencedora e uma que segue adiante —
 * nunca duas mensagens para o mesmo cliente.
 */

const BATCH = 20;

/** Interações que contam como "a loja falou" para efeito de SLA. */
const REPLY_TYPES = [InteractionType.AGENT_REPLY];

async function claim(ticketId: string, observed: Date): Promise<boolean> {
  const claimed = await prisma.ticket.updateMany({
    where: { id: ticketId, nextActionAt: observed },
    data: { nextActionAt: null },
  });
  return claimed.count > 0;
}

/** Envia o follow-up e reprograma o próximo degrau da escada. */
async function runFollowUp(
  ticket: { id: string; accountId: string; leadId: string; platform: string; followUpCount: number },
  policy: ResolvedPolicy,
): Promise<void> {
  const lead = await prisma.lead.findUnique({
    where: { id: ticket.leadId },
    select: { name: true, externalId: true, anonymizedAt: true },
  });
  // Titular que exerceu o direito ao esquecimento não recebe mensagem nossa.
  if (!lead || lead.anonymizedAt) return;

  const body = await generateFollowUp(ticket.id, ticket.accountId, policy, ticket.followUpCount);
  if (!body) return;

  const interaction = await prisma.$transaction(async (tx) => {
    const created = await tx.ticketInteraction.create({
      data: {
        ticketId: ticket.id,
        type: InteractionType.AGENT_REPLY,
        // authorId nulo + metadata marcam a origem: o atendente precisa saber
        // que o sistema falou em nome dele.
        body,
        metadata: {
          kind: 'flow',
          event: 'followup',
          attempt: ticket.followUpCount + 1,
          automated: true,
          at: new Date().toISOString(),
        },
      },
    });

    await tx.ticket.update({
      where: { id: ticket.id },
      data: {
        followUpCount: { increment: 1 },
        lastFollowUpAt: new Date(),
        // Follow-up enviado significa que a bola está com o cliente.
        status: TicketStatus.WAITING_CUSTOMER,
      },
    });
    return created;
  });

  // Replica na plataforma de origem (OLX etc.), quando houver integração ativa.
  await dispatchOutboundReply({
    accountId: ticket.accountId,
    platform: ticket.platform,
    ticketId: ticket.id,
    interactionId: interaction.id,
    leadName: lead.name,
    externalLeadId: lead.externalId,
    body,
  });

  logger.info('fluxo: follow-up enviado', {
    ticketId: ticket.id,
    accountId: ticket.accountId,
    tentativa: ticket.followUpCount + 1,
  });
}

/** Encerra por falta de resposta, preservando o histórico e o motivo. */
async function runClose(ticket: { id: string; accountId: string }): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.ticket.update({
      where: { id: ticket.id },
      data: {
        status: TicketStatus.LOST,
        closedAt: new Date(),
        closeReason: 'sem_resposta',
        botEnabled: false,
        nextActionAt: null,
      },
    });
    await tx.ticketInteraction.create({
      data: {
        ticketId: ticket.id,
        type: InteractionType.STATUS_CHANGE,
        body: 'Encerrado automaticamente por falta de resposta.',
        metadata: {
          kind: 'flow', event: 'autoclose', automated: true,
          to: TicketStatus.LOST, reason: 'sem_resposta', at: new Date().toISOString(),
        },
      },
    });
  });
  logger.info('fluxo: ticket encerrado por inatividade', { ticketId: ticket.id, accountId: ticket.accountId });
}

/**
 * Alerta de SLA: o CLIENTE está esperando a LOJA. Aqui não se manda nada ao
 * cliente — sobe a prioridade e registra o alerta para a equipe.
 */
async function runSlaAlerts(now: Date): Promise<number> {
  const policies = await prisma.flowPolicy.findMany({ where: { enabled: true } });
  let alerted = 0;

  for (const policy of policies) {
    const cutoff = new Date(now.getTime() - policy.slaFirstResponseMin * 60_000);
    const breached = await prisma.ticket.findMany({
      where: {
        accountId: policy.accountId,
        status: { in: [TicketStatus.NEW, TicketStatus.IN_PROGRESS] },
        firstResponseAt: null,
        createdAt: { lt: cutoff },
        priority: { not: 'URGENT' }, // já escalado antes; não repete
      },
      select: { id: true },
      take: BATCH,
    });

    for (const t of breached) {
      await prisma.$transaction(async (tx) => {
        await tx.ticket.update({ where: { id: t.id }, data: { priority: 'URGENT' } });
        await tx.ticketInteraction.create({
          data: {
            ticketId: t.id,
            type: InteractionType.SYSTEM,
            body: `SLA de primeira resposta estourado (${policy.slaFirstResponseMin} min).`,
            metadata: {
              kind: 'flow', event: 'sla_breach', alert: true,
              limitMinutes: policy.slaFirstResponseMin, at: new Date().toISOString(),
            },
          },
        });
      });
      alerted += 1;
    }
  }
  return alerted;
}

/** Um ciclo do motor. Devolve quantas ações executou. */
export async function processDueTickets(now = new Date()): Promise<number> {
  const due = await prisma.ticket.findMany({
    where: { nextActionAt: { lte: now } },
    orderBy: { nextActionAt: 'asc' },
    take: BATCH,
    select: {
      id: true, accountId: true, leadId: true, platform: true, status: true,
      followUpCount: true, botEnabled: true, nextActionAt: true,
      lastCustomerMessageAt: true, firstResponseAt: true, createdAt: true,
    },
  });

  let done = 0;
  for (const ticket of due) {
    if (!ticket.nextActionAt) continue;
    if (!(await claim(ticket.id, ticket.nextActionAt))) continue; // outra instância pegou

    try {
      const policy = await getPolicy(ticket.accountId);
      const decision = computeNextAction(ticket, policy, now);

      // A política pode ter mudado entre o agendamento e agora — reavalia.
      if (!decision) continue;
      if (decision.at > now) {
        await prisma.ticket.update({ where: { id: ticket.id }, data: { nextActionAt: decision.at } });
        continue;
      }

      if (decision.kind === 'followup') {
        await runFollowUp(ticket, policy);
      } else {
        await runClose(ticket);
      }
      done += 1;

      // Reprograma a partir do novo estado (a menos que tenha fechado).
      const after = await prisma.ticket.findUnique({
        where: { id: ticket.id },
        select: {
          status: true, followUpCount: true, botEnabled: true,
          lastCustomerMessageAt: true, firstResponseAt: true, createdAt: true,
        },
      });
      if (after) {
        const next = computeNextAction(after, policy, now);
        await prisma.ticket.update({
          where: { id: ticket.id },
          data: { nextActionAt: next?.at ?? null },
        });
      }
    } catch (err) {
      logger.error('fluxo: falha ao executar ação', { ticketId: ticket.id, err });
      // Sem reprogramar: um erro não deve virar laço de reenvio ao cliente.
    }
  }

  done += await runSlaAlerts(now);
  return done;
}

void REPLY_TYPES;
