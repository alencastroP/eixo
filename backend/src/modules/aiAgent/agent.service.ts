/**
 * Orquestrador do Agente de Pré-Venda IA.
 *
 * Ponto de entrada `handleInboundMessage(ticketId)`: chamado pelo worker logo
 * após uma mensagem do lead ser ingerida. Se o bot estiver ativo para aquela
 * conversa, monta o contexto (últimas 10 mensagens), chama a Anthropic Messages
 * API com as ferramentas e conduz o loop de tool-use manualmente — para poder
 * interceptar, executar no CRM e registrar cada ação.
 *
 * Nunca lança para o chamador: qualquer falha é logada e a conversa segue
 * disponível para atendimento humano.
 */
import Anthropic from '@anthropic-ai/sdk';
import { InteractionType, Prisma, TicketStatus } from '@prisma/client';
import { aiEnabled, env } from '../../config/env';
import { logger } from '../../lib/logger';
import { prisma } from '../../lib/prisma';
import type { NormalizedLead } from '../../integrations/core/types';
import { dispatchOutboundReply } from '../../integrations/outbound';
import { buildSystemPrompt } from './prompt';
import { AGENT_TOOLS, executeAgentTool, type AgentToolContext } from './tools';

const toJson = (value: unknown) => value as Prisma.InputJsonValue;

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!aiEnabled()) return null;
  if (!client) client = new Anthropic({ apiKey: env.ai.apiKey });
  return client;
}

const HISTORY_LIMIT = 10;
const FALLBACK_REPLY =
  'Obrigado pela mensagem! Já estou verificando com a equipe e um vendedor vai te dar sequência em instantes. 🙂';

/** Concatena os blocos de texto de uma resposta do modelo. */
function textOf(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

/** Últimas mensagens da conversa mapeadas para o formato da Messages API. */
async function buildHistory(ticketId: string): Promise<Anthropic.MessageParam[]> {
  const rows = await prisma.ticketInteraction.findMany({
    where: {
      ticketId,
      body: { not: null },
      type: { in: [InteractionType.CUSTOMER_MESSAGE, InteractionType.AGENT_REPLY] },
    },
    orderBy: { createdAt: 'desc' },
    take: HISTORY_LIMIT,
    select: { type: true, body: true },
  });

  const messages: Anthropic.MessageParam[] = rows
    .reverse()
    .map((r) => ({
      role: r.type === InteractionType.CUSTOMER_MESSAGE ? ('user' as const) : ('assistant' as const),
      content: r.body ?? '',
    }));

  // a Messages API exige começar por um turno do usuário
  while (messages.length > 0 && messages[0].role !== 'user') messages.shift();
  return messages;
}

/** Registra a resposta da IA como AGENT_REPLY (autor nulo, marcada ai) e replica à plataforma. */
async function postAiReply(
  ticket: { id: string; status: TicketStatus; firstResponseAt: Date | null; platform: string },
  lead: { name: string; externalId: string | null },
  vehicle: NormalizedLead['vehicle'] | undefined,
  body: string,
): Promise<void> {
  let interactionId = '';
  await prisma.$transaction(async (tx) => {
    const created = await tx.ticketInteraction.create({
      data: {
        ticketId: ticket.id,
        type: InteractionType.AGENT_REPLY,
        body,
        metadata: toJson({ ai: true }),
      },
    });
    interactionId = created.id;

    const data: Prisma.TicketUncheckedUpdateInput = {};
    if (!ticket.firstResponseAt) data.firstResponseAt = new Date();
    if (ticket.status === TicketStatus.NEW) data.status = TicketStatus.IN_PROGRESS;
    await tx.ticket.update({ where: { id: ticket.id }, data });
  });

  // comunicação bidirecional: replica a resposta da IA de volta ao canal (OLX etc.)
  await dispatchOutboundReply({
    platform: ticket.platform,
    ticketId: ticket.id,
    interactionId,
    leadName: lead.name,
    externalLeadId: lead.externalId,
    body,
    vehicle,
  });
}

/**
 * Processa uma mensagem recebida do lead com o Agente de IA, se o bot estiver
 * ativo para o ticket. Idempotente por natureza do gatilho (só responde quando a
 * última interação é uma mensagem do cliente).
 */
export async function handleInboundMessage(ticketId: string): Promise<void> {
  const anthropic = getClient();
  if (!anthropic) return;

  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { lead: true },
    });
    if (!ticket || !ticket.botEnabled) return;

    // só responde se a última interação for do cliente (evita responder a si mesmo)
    const last = await prisma.ticketInteraction.findFirst({
      where: { ticketId, body: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { type: true },
    });
    if (last?.type !== InteractionType.CUSTOMER_MESSAGE) return;

    const messages = await buildHistory(ticketId);
    if (messages.length === 0) return;

    const vehicleRef = (ticket.vehicleRefExternal as NormalizedLead['vehicle']) ?? undefined;
    const system = buildSystemPrompt({
      leadName: ticket.lead.name,
      vehicleTitle: (vehicleRef?.title as string | undefined) ?? null,
      vehiclePrice: typeof vehicleRef?.price === 'number' ? vehicleRef.price : null,
      platform: ticket.platform,
    });
    const ctx: AgentToolContext = { ticketId, leadId: ticket.leadId };

    // ── Loop de tool-use manual (interceptável) ──
    let finalText = '';
    let handedOff = false;
    for (let i = 0; i <= env.ai.maxToolIterations; i++) {
      const response = await anthropic.messages.create({
        model: env.ai.model,
        max_tokens: env.ai.maxTokens,
        system,
        tools: AGENT_TOOLS,
        messages,
      });

      const turnText = textOf(response.content);
      if (turnText) finalText = turnText;

      if (response.stop_reason !== 'tool_use') break;

      messages.push({ role: 'assistant', content: response.content });

      const toolUses = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
      );
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        const outcome = await executeAgentTool(tu.name, (tu.input ?? {}) as Record<string, unknown>, ctx);
        if (outcome.handoff) handedOff = true;
        results.push({ type: 'tool_result', tool_use_id: tu.id, content: outcome.content });
      }
      messages.push({ role: 'user', content: results });
      // após o transbordo deixamos o modelo escrever uma última despedida no próximo turno
    }

    const reply = finalText || FALLBACK_REPLY;
    await postAiReply(
      { id: ticket.id, status: ticket.status, firstResponseAt: ticket.firstResponseAt, platform: ticket.platform },
      { name: ticket.lead.name, externalId: ticket.lead.externalId },
      vehicleRef,
      reply,
    );

    logger.info('IA respondeu ao lead', { ticketId, handedOff, turns: messages.length });
  } catch (err) {
    logger.error('IA: falha ao processar mensagem recebida', { ticketId, err });
  }
}
