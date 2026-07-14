import { InteractionType, Prisma, TicketStatus, type Lead } from '@prisma/client';
import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';
import type { NormalizedLead } from '../../integrations/core/types';
import { writeAudit } from '../audit/audit.service';
import { CLOSED_STATUSES } from './tickets.service';

const toJson = (value: unknown) => value as Prisma.InputJsonValue;

export interface IngestResult {
  ticketId: string;
  leadId: string;
  /** false = deduplicado (mensagem anexada a ticket aberto existente). */
  created: boolean;
}

/**
 * Núcleo da ingestão: recebe um lead já normalizado (qualquer plataforma) e o
 * transforma em ticket — criando um novo ou anexando a mensagem a um ticket
 * aberto recente do mesmo lead na mesma plataforma (deduplicação).
 *
 * Usado pelo worker de webhooks e pelo seed; não conhece payloads de plataforma.
 */
export async function ingestNormalizedLead(platform: string, n: NormalizedLead): Promise<IngestResult> {
  return prisma.$transaction(async (tx) => {
    // 1) localizar ou criar o lead (dedup por externalId; fallback telefone/e-mail)
    let lead: Lead | null = null;

    if (n.externalLeadId) {
      lead = await tx.lead.findUnique({
        where: { platform_externalId: { platform, externalId: n.externalLeadId } },
      });
    }
    if (!lead && (n.phone || n.email)) {
      const or: Prisma.LeadWhereInput[] = [];
      if (n.phone) or.push({ phone: n.phone });
      if (n.email) or.push({ email: n.email });
      lead = await tx.lead.findFirst({
        where: { platform, anonymizedAt: null, OR: or },
        orderBy: { createdAt: 'desc' },
      });
    }

    if (lead) {
      lead = await tx.lead.update({
        where: { id: lead.id },
        data: {
          name: n.name || lead.name,
          phone: n.phone ?? lead.phone,
          email: n.email ?? lead.email,
          externalId: lead.externalId ?? n.externalLeadId ?? null,
        },
      });
    } else {
      lead = await tx.lead.create({
        data: {
          name: n.name,
          phone: n.phone,
          email: n.email,
          platform,
          externalId: n.externalLeadId,
        },
      });
    }

    const messageMetadata = toJson({
      ...(n.vehicle ? { vehicle: n.vehicle } : {}),
      ...(n.campaign ? { campaign: n.campaign } : {}),
      ...(n.platformReceivedAt ? { platformReceivedAt: n.platformReceivedAt } : {}),
    });

    // 2) deduplicação de ticket: mesmo lead + mesma plataforma + ticket aberto
    //    com atividade dentro da janela → anexa em vez de criar
    const windowStart = new Date(Date.now() - env.rules.dedupWindowHours * 3_600_000);
    const existing = await tx.ticket.findFirst({
      where: {
        leadId: lead.id,
        platform,
        status: { notIn: CLOSED_STATUSES },
        updatedAt: { gte: windowStart },
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (existing) {
      await tx.ticketInteraction.create({
        data: {
          ticketId: existing.id,
          type: InteractionType.CUSTOMER_MESSAGE,
          body: n.message,
          metadata: messageMetadata,
        },
      });

      const data: Prisma.TicketUncheckedUpdateInput = { lastCustomerMessageAt: new Date() };
      if (!existing.vehicleRefExternal && n.vehicle) data.vehicleRefExternal = toJson(n.vehicle);

      // o cliente respondeu — ticket volta para atendimento
      if (existing.status === TicketStatus.WAITING_CUSTOMER) {
        data.status = TicketStatus.IN_PROGRESS;
        await tx.ticketInteraction.create({
          data: {
            ticketId: existing.id,
            type: InteractionType.STATUS_CHANGE,
            metadata: toJson({
              kind: 'status',
              from: TicketStatus.WAITING_CUSTOMER,
              to: TicketStatus.IN_PROGRESS,
              auto: true,
            }),
          },
        });
        await writeAudit(tx, {
          entityType: 'TICKET',
          entityId: existing.id,
          action: 'STATUS_CHANGED',
          data: { from: TicketStatus.WAITING_CUSTOMER, to: TicketStatus.IN_PROGRESS, via: 'webhook' },
        });
      }

      await tx.ticket.update({ where: { id: existing.id }, data });
      return { ticketId: existing.id, leadId: lead.id, created: false };
    }

    // 3) novo ticket
    const ticket = await tx.ticket.create({
      data: {
        leadId: lead.id,
        platform,
        campaign: n.campaign,
        vehicleRefExternal: n.vehicle ? toJson(n.vehicle) : undefined,
        lastCustomerMessageAt: new Date(),
      },
    });
    await tx.ticketInteraction.create({
      data: {
        ticketId: ticket.id,
        type: InteractionType.CUSTOMER_MESSAGE,
        body: n.message,
        metadata: messageMetadata,
      },
    });
    await writeAudit(tx, {
      entityType: 'TICKET',
      entityId: ticket.id,
      action: 'CREATED',
      data: { via: 'webhook', platform },
    });

    return { ticketId: ticket.id, leadId: lead.id, created: true };
  });
}
