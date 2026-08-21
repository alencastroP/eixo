import { prisma } from '../../lib/prisma';

/**
 * Contexto que molda o agente de uma loja: persona, base de conhecimento e o
 * perfil de compra já coletado do lead.
 *
 * ── Sobre a estratégia de conhecimento (RAG) ────────────────────────────────
 * O corpus de uma revenda - garantia, financiamento, avaliação de usado,
 * horários, formas de pagamento - costuma ter poucos milhares de tokens. Nesse
 * tamanho, INJETAR tudo no prefixo cacheado do prompt bate busca vetorial em
 * todos os critérios que importam: o modelo enxerga o corpus inteiro (não existe
 * "o trecho certo não foi recuperado"), não há chunking para calibrar, não há
 * índice para manter sincronizado e não entra um segundo fornecedor no sistema.
 * Leitura de cache custa ~0,1x a entrada normal, então o custo marginal é baixo.
 *
 * Acima de KNOWLEDGE_INJECT_BUDGET o cálculo inverte: o prefixo fica caro em
 * toda chamada e a maior parte dele é irrelevante para a pergunta da vez. Aí a
 * injeção é trocada por recuperação sob demanda (ferramenta
 * `consultar_conhecimento`, busca textual do Postgres em português).
 *
 * A troca é automática e o agente não sabe qual modo está ativo - é decisão de
 * infraestrutura, não de prompt.
 */

/** Teto de caracteres do bloco de conhecimento injetado (~4 chars/token em PT-BR). */
export const KNOWLEDGE_INJECT_BUDGET = 24_000;

export interface AgentProfileResolved {
  enabled: boolean;
  storeName: string;
  persona: string | null;
  rules: string | null;
  canSearchInventory: boolean;
  canQuoteCredit: boolean;
  canScheduleVisit: boolean;
}

export interface KnowledgeResolved {
  /** Texto pronto para o prefixo, ou null quando o modo é recuperação. */
  injected: string | null;
  /** true => o agente recebe a ferramenta `consultar_conhecimento`. */
  useRetrieval: boolean;
  docCount: number;
}

/**
 * Perfil de compra do lead. Campos livres de propósito: o que qualifica um
 * comprador varia por loja, e engessar em colunas exigiria migration a cada
 * novo dado que a operação descobrir ser útil.
 */
export interface LeadProfile {
  orcamento?: string;
  entrada?: string;
  formaPagamento?: string;
  veiculoNaTroca?: string;
  prazo?: string;
  preferencias?: string;
  observacoes?: string;
}

const DEFAULT_PROFILE: Omit<AgentProfileResolved, 'storeName'> = {
  enabled: true,
  persona: null,
  rules: null,
  canSearchInventory: true,
  canQuoteCredit: true,
  canScheduleVisit: true,
};

/** Persona da loja; conta sem configuração recebe os padrões e o nome da conta. */
export async function resolveAgentProfile(accountId: string): Promise<AgentProfileResolved> {
  const [row, account] = await Promise.all([
    prisma.agentProfile.findUnique({ where: { accountId } }),
    prisma.account.findUnique({ where: { id: accountId }, select: { name: true } }),
  ]);
  const storeName = row?.storeName?.trim() || account?.name || 'a loja';
  if (!row) return { ...DEFAULT_PROFILE, storeName };
  return {
    enabled: row.enabled,
    storeName,
    persona: row.persona?.trim() || null,
    rules: row.rules?.trim() || null,
    canSearchInventory: row.canSearchInventory,
    canQuoteCredit: row.canQuoteCredit,
    canScheduleVisit: row.canScheduleVisit,
  };
}

/**
 * Decide entre injetar o conhecimento no prefixo ou expor a ferramenta de busca.
 * A ordenação é estável (por título) porque o bloco entra no prefixo cacheado:
 * qualquer variação de ordem entre requisições invalidaria o cache silenciosamente.
 */
export async function resolveKnowledge(accountId: string): Promise<KnowledgeResolved> {
  const docs = await prisma.knowledgeDoc.findMany({
    where: { accountId, enabled: true },
    orderBy: { title: 'asc' },
    select: { title: true, content: true },
  });
  if (docs.length === 0) return { injected: null, useRetrieval: false, docCount: 0 };

  const total = docs.reduce((sum, d) => sum + d.title.length + d.content.length, 0);
  if (total > KNOWLEDGE_INJECT_BUDGET) {
    return { injected: null, useRetrieval: true, docCount: docs.length };
  }

  const injected = docs.map((d) => `## ${d.title}\n${d.content.trim()}`).join('\n\n');
  return { injected, useRetrieval: false, docCount: docs.length };
}

/**
 * Converte a pergunta em uma query OR, com stemming do dicionário português.
 *
 * A semântica padrão (`websearch_to_tsquery` sem operador) é E: exige TODOS os
 * termos. Numa base de conhecimento isso derruba a revocação a quase zero,
 * porque cliente e documento usam palavras diferentes para a mesma coisa - o
 * cliente pergunta "posso parcelar" e o documento diz "prazo de até 48 vezes".
 * Nenhum documento contém a frase inteira do cliente.
 *
 * Com OU + ranking, documentos que casam em qualquer termo relevante entram e
 * são ordenados por aderência. O modelo recebe 3 ou 4 e decide o que serve:
 * ele consegue ignorar um documento irrelevante, mas não consegue usar um
 * documento que nunca chegou. Numa base pequena, revocação vale mais que
 * precisão.
 */
function toOrQuery(question: string): string {
  return question
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4) // corta artigos/preposições que virariam ruído
    .slice(0, 12)
    .join(' OR ');
}

/**
 * Busca textual na base de conhecimento (Postgres full-text, dicionário
 * português: aplica stemming e remove stopwords).
 *
 * O filtro por accountId é parâmetro vinculado, nunca interpolado - a base de
 * uma loja nunca aparece na conversa de outra.
 */
export async function searchKnowledge(accountId: string, question: string, limit = 4) {
  const orQuery = toOrQuery(question.trim().slice(0, 300));
  if (!orQuery) return [];
  return prisma.$queryRaw<Array<{ title: string; content: string; rank: number }>>`
    SELECT "title", "content",
           ts_rank(to_tsvector('portuguese', "title" || ' ' || "content"),
                   websearch_to_tsquery('portuguese', ${orQuery})) AS rank
      FROM "knowledge_docs"
     WHERE "accountId" = ${accountId}
       AND "enabled" = true
       AND to_tsvector('portuguese', "title" || ' ' || "content")
           @@ websearch_to_tsquery('portuguese', ${orQuery})
     ORDER BY rank DESC
     LIMIT ${limit}
  `;
}

/** Perfil já coletado do lead, para o agente não repetir perguntas. */
export function readLeadProfile(raw: unknown): LeadProfile {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as LeadProfile;
}

/** Renderiza o perfil como linhas legíveis; vazio quando nada foi coletado. */
export function renderLeadProfile(profile: LeadProfile): string | null {
  const labels: Array<[keyof LeadProfile, string]> = [
    ['orcamento', 'Orçamento'],
    ['entrada', 'Entrada disponível'],
    ['formaPagamento', 'Forma de pagamento'],
    ['veiculoNaTroca', 'Veículo na troca'],
    ['prazo', 'Prazo para decidir'],
    ['preferencias', 'Preferências'],
    ['observacoes', 'Observações'],
  ];
  const lines = labels
    .filter(([k]) => typeof profile[k] === 'string' && profile[k]!.trim())
    .map(([k, label]) => `- ${label}: ${profile[k]!.trim()}`);
  return lines.length > 0 ? lines.join('\n') : null;
}

/** Mescla o que o agente descobriu com o que já existia (sem apagar campo por omissão). */
export async function mergeLeadProfile(leadId: string, patch: LeadProfile): Promise<LeadProfile> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { profile: true } });
  const current = readLeadProfile(lead?.profile);
  const merged: LeadProfile = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (typeof value === 'string' && value.trim()) {
      merged[key as keyof LeadProfile] = value.trim().slice(0, 400);
    }
  }
  await prisma.lead.update({
    where: { id: leadId },
    data: { profile: merged as object },
  });
  return merged;
}
