import type Anthropic from '@anthropic-ai/sdk';
import { InteractionType, Prisma, TicketPriority } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { maskDocument, validateDocument } from '../../lib/document';
import { generateReport } from '../credit/bureau.mock';

const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
const toJson = (value: unknown) => value as Prisma.InputJsonValue;

/** Definições expostas ao Claude (Function Calling / Tool Use). */
export const AGENT_TOOLS: Anthropic.Tool[] = [
  {
    name: 'consultar_credito_cliente',
    description:
      'Use esta ferramenta quando o cliente fornecer voluntariamente um CPF ou CNPJ válido para realizar a simulação de crédito. Retorna o score, a faixa de risco, o limite de financiamento estimado e a entrada sugerida. É uma estimativa — nunca uma aprovação.',
    input_schema: {
      type: 'object',
      properties: {
        documento: {
          type: 'string',
          description: 'CPF (11 dígitos) ou CNPJ (14 dígitos) informado pelo cliente. Pode conter pontuação.',
        },
      },
      required: ['documento'],
    },
  },
  {
    name: 'transferir_para_atendente_humano',
    description:
      'Use esta ferramenta imediatamente se o cliente pedir explicitamente para falar com um humano, se demonstrar pressa/irritação, se a conversa avançar para preço/proposta/visita, ou se você concluir a coleta de dados com sucesso. Desliga o atendimento automático e alerta a equipe de vendas.',
    input_schema: {
      type: 'object',
      properties: {
        motivo_transferencia: {
          type: 'string',
          description: 'Motivo curto do transbordo (ex.: "cliente quer negociar preço", "pediu para falar com vendedor").',
        },
      },
      required: [],
    },
  },
];

export interface AgentToolContext {
  ticketId: string;
  leadId: string;
}

export interface ToolOutcome {
  /** Texto devolvido ao Claude como tool_result. */
  content: string;
  /** true => o bot foi desligado; o orquestrador encerra após este turno. */
  handoff?: boolean;
}

/** Registra uma ação da IA na linha do tempo (alimenta o "Log de Ações" do painel). */
export async function logAiAction(
  ticketId: string,
  event: 'reply' | 'credit' | 'handoff',
  summary: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  await prisma.ticketInteraction.create({
    data: {
      ticketId,
      type: InteractionType.SYSTEM,
      body: summary,
      metadata: toJson({ kind: 'ai', event, summary, at: new Date().toISOString(), ...extra }),
    },
  });
}

async function runCreditTool(documentoRaw: unknown, ctx: AgentToolContext): Promise<ToolOutcome> {
  const raw = typeof documentoRaw === 'string' ? documentoRaw : '';
  const valid = validateDocument(raw);
  if (!valid) {
    return { content: 'Documento inválido: os dígitos verificadores não conferem. Peça ao cliente para reenviar o CPF/CNPJ.' };
  }

  const report = generateReport(valid.digits, valid.docType);

  // persiste no histórico do módulo de crédito, já vinculado ao lead (sem actor humano)
  await prisma.creditQuery.create({
    data: {
      document: valid.digits,
      docType: valid.docType,
      name: report.name,
      score: report.score,
      report: report as unknown as Prisma.InputJsonValue,
      leadId: ctx.leadId,
    },
  });

  logger.info('IA: consulta de crédito', {
    ticketId: ctx.ticketId,
    docType: valid.docType,
    document: maskDocument(valid.digits),
    score: report.score,
  });

  await logAiAction(ctx.ticketId, 'credit', `Consulta de crédito · score ${report.score} (${report.bandLabel})`, {
    score: report.score,
    band: report.band,
    limit: report.credit.limit,
  });

  const limitTxt = report.credit.limit > 0 ? brl(report.credit.limit) : 'não liberado neste momento';
  const summaryForClaude = [
    `Resultado da simulação (estimativa, não é aprovação):`,
    `- Score: ${report.score}/1000 (${report.bandLabel})`,
    `- Limite de financiamento estimado: ${limitTxt}`,
    report.credit.limit > 0
      ? `- Entrada sugerida: ${report.credit.downPaymentLabel}`
      : `- Recomende avaliar entrada maior ou um veículo de menor valor.`,
    report.restrictions.hasRestrictions
      ? `- Observação: constam restrições no CPF/CNPJ; conduza com cautela e sem prometer aprovação.`
      : `- Sem restrições encontradas.`,
    `Personalize a mensagem ao cliente de forma consultiva, sem citar o score cru nem prometer aprovação.`,
  ].join('\n');

  return { content: summaryForClaude };
}

async function runHandoffTool(motivoRaw: unknown, ctx: AgentToolContext): Promise<ToolOutcome> {
  const motivo = typeof motivoRaw === 'string' && motivoRaw.trim() ? motivoRaw.trim() : 'Coleta inicial concluída';

  await prisma.$transaction(async (tx) => {
    // desliga o bot desta conversa e prioriza para a equipe humana notar
    const ticket = await tx.ticket.update({
      where: { id: ctx.ticketId },
      data: {
        botEnabled: false,
        priority: TicketPriority.HIGH,
        status: 'IN_PROGRESS',
      },
      select: { priority: true },
    });
    void ticket;

    // alerta de transbordo na linha do tempo (o front destaca/dispara notificação)
    await tx.ticketInteraction.create({
      data: {
        ticketId: ctx.ticketId,
        type: InteractionType.SYSTEM,
        body: `Atendimento transferido para um humano: ${motivo}`,
        metadata: toJson({ kind: 'ai', event: 'handoff', summary: motivo, alert: true, at: new Date().toISOString() }),
      },
    });
  });

  logger.info('IA: transbordo para humano', { ticketId: ctx.ticketId, motivo });

  return {
    content:
      'Atendimento transferido para a equipe humana e o modo automático foi desligado. Escreva uma última mensagem curta ao cliente avisando que um vendedor dará sequência.',
    handoff: true,
  };
}

/** Despacha a execução de uma ferramenta chamada pelo Claude. */
export async function executeAgentTool(
  name: string,
  input: Record<string, unknown>,
  ctx: AgentToolContext,
): Promise<ToolOutcome> {
  switch (name) {
    case 'consultar_credito_cliente':
      return runCreditTool(input.documento, ctx);
    case 'transferir_para_atendente_humano':
      return runHandoffTool(input.motivo_transferencia, ctx);
    default:
      return { content: `Ferramenta desconhecida: ${name}` };
  }
}
