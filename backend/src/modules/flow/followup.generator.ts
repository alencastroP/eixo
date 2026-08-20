import Anthropic from '@anthropic-ai/sdk';
import { InteractionType } from '@prisma/client';
import { aiEnabled, env } from '../../config/env';
import { logger } from '../../lib/logger';
import { prisma } from '../../lib/prisma';
import { resolveAgentProfile } from '../aiAgent/context.service';
import type { ResolvedPolicy } from './flow.service';

/**
 * Texto do follow-up automático.
 *
 * Dois modos, escolhidos pela loja:
 *  - "template": determinístico e sem custo, mas se denuncia como robô;
 *  - "ai": retoma o assunto real da conversa (o carro específico, a dúvida que
 *    ficou no ar). Custa uma chamada por follow-up.
 *
 * Em ambos o texto é curto e sem pressão. Um follow-up automático que soa
 * ansioso rende bloqueio, não venda.
 */

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!aiEnabled()) return null;
  if (!client) client = new Anthropic({ apiKey: env.ai.apiKey });
  return client;
}

/** Escada de textos fixos, um por tentativa. */
const TEMPLATES = [
  'Oi! Passando para saber se ficou alguma dúvida sobre o que conversamos. Estou por aqui. 🙂',
  'Olá! Se quiser, posso te mostrar outras opções parecidas que temos disponíveis. É só me dizer.',
  'Oi! Vou deixar seu atendimento em pausa por aqui, mas é só me chamar quando quiser retomar — fica tudo salvo.',
];

function templateFor(attempt: number): string {
  return TEMPLATES[Math.min(attempt, TEMPLATES.length - 1)];
}

/** Últimas mensagens, para o modelo retomar o assunto certo. */
async function recentTranscript(ticketId: string, limit = 8): Promise<string> {
  const rows = await prisma.ticketInteraction.findMany({
    where: {
      ticketId,
      body: { not: null },
      type: { in: [InteractionType.CUSTOMER_MESSAGE, InteractionType.AGENT_REPLY] },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { type: true, body: true },
  });
  return rows
    .reverse()
    .map((r) => `${r.type === InteractionType.CUSTOMER_MESSAGE ? 'Cliente' : 'Loja'}: ${r.body}`)
    .join('\n');
}

/**
 * Gera a mensagem. Devolve null se não houver o que enviar — nesse caso o
 * worker não manda nada, em vez de enviar um texto genérico ruim.
 */
export async function generateFollowUp(
  ticketId: string,
  accountId: string,
  policy: ResolvedPolicy,
  attempt: number,
): Promise<string | null> {
  const isLast = attempt >= policy.followUpDelaysMin.length - 1;

  if (policy.followUpMode === 'template') return templateFor(attempt);

  const anthropic = getClient();
  if (!anthropic) return templateFor(attempt); // sem chave, cai no texto fixo

  try {
    const [profile, transcript] = await Promise.all([
      resolveAgentProfile(accountId),
      recentTranscript(ticketId),
    ]);
    if (!transcript.trim()) return templateFor(attempt);

    const response = await anthropic.messages.create({
      model: env.ai.model,
      max_tokens: 200,
      system: `Você escreve a mensagem de retomada de ${profile.storeName} para um cliente que parou de responder.

Regras:
- UMA mensagem curta, no máximo 2 frases, em português do Brasil.
- Retome o assunto CONCRETO da conversa (o veículo, a dúvida que ficou aberta).
- Sem pressão, sem "ainda tem interesse?", sem cobrança. Convide, não cobre.
- Não invente preço, disponibilidade ou condição que não apareça na conversa.
- Não se apresente de novo nem cumprimente como se fosse o primeiro contato.
- No máximo 1 emoji.
${isLast ? '- Esta é a ÚLTIMA tentativa: sinalize que você vai pausar o atendimento e deixe claro que é só chamar para retomar.' : ''}

Responda APENAS com o texto da mensagem, sem aspas e sem comentários.`,
      messages: [
        {
          role: 'user',
          content: `Conversa até aqui:\n\n${transcript}\n\nEscreva a mensagem de retomada.`,
        },
      ],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join(' ')
      .trim();

    // Guarda-corpo: resposta vazia ou absurdamente longa cai no texto fixo.
    if (!text || text.length > 400) return templateFor(attempt);
    return text;
  } catch (err) {
    logger.error('fluxo: falha ao gerar follow-up com IA', { ticketId, err });
    return templateFor(attempt);
  }
}
