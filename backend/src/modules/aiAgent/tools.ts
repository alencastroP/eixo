import type Anthropic from '@anthropic-ai/sdk';
import { InteractionType, Prisma, TicketPriority, UsageMetric } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { maskDocument, validateDocument } from '../../lib/document';
import { CREDIT_CONSENT_VERSION } from '../../lib/legal-versions';
import { hasQuota, recordUsage } from '../billing/usage.service';
import { bureau } from '../credit/bureau';
import { getInventoryDetail, searchInventory } from './inventory.tool';
import { mergeLeadProfile, searchKnowledge, type AgentProfileResolved, type LeadProfile } from './context.service';

const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
const toJson = (value: unknown) => value as Prisma.InputJsonValue;

// ─────────────────────────────────────────────────────────────────────────────
// Definições expostas ao Claude (Function Calling / Tool Use)
//
// O conjunto é montado por conta (ver buildAgentTools). Desligar uma capacidade
// no perfil da loja REMOVE a ferramenta, em vez de só pedir no prompt para não
// usá-la: o modelo não pode chamar o que não recebeu.
//
// Atenção ao cache de prompt: `tools` renderiza na posição 0, antes do system.
// Mudar o conjunto invalida o cache inteiro - por isso ele é derivado apenas do
// perfil da loja (estável), nunca do turno ou do cliente.
// ─────────────────────────────────────────────────────────────────────────────

const SEARCH_TOOL: Anthropic.Tool = {
  name: 'buscar_veiculos',
  description:
    'Busca veículos disponíveis no estoque desta loja. Use sempre que o cliente indicar o que procura (marca, modelo, faixa de preço, ano, quilometragem). Os filtros numéricos são exatos: precoMax nunca devolve nada acima do valor pedido. Responda ao cliente apenas com o que esta ferramenta retornar.',
  input_schema: {
    type: 'object',
    properties: {
      marca: { type: 'string', description: 'Marca do veículo, ex.: Honda, Toyota.' },
      modelo: { type: 'string', description: 'Modelo, ex.: Civic, Corolla.' },
      precoMax: { type: 'number', description: 'Preço máximo em reais (apenas o número).' },
      precoMin: { type: 'number', description: 'Preço mínimo em reais.' },
      anoMin: { type: 'number', description: 'Ano/modelo mínimo aceito.' },
      kmMax: { type: 'number', description: 'Quilometragem máxima.' },
      combustivel: { type: 'string', description: 'Flex, Gasolina, Diesel, Híbrido, Elétrico.' },
      tipo: { type: 'string', enum: ['carro', 'moto', 'pesado'], description: 'Categoria do veículo.' },
    },
    required: [],
  },
};

const DETAIL_TOOL: Anthropic.Tool = {
  name: 'detalhar_veiculo',
  description:
    'Ficha completa de um veículo do estoque, a partir do id devolvido por buscar_veiculos. Use quando o cliente demonstrar interesse em uma das opções apresentadas.',
  input_schema: {
    type: 'object',
    properties: { veiculoId: { type: 'string', description: 'Id do veículo, vindo de buscar_veiculos.' } },
    required: ['veiculoId'],
  },
};

const SCHEDULE_TOOL: Anthropic.Tool = {
  name: 'agendar_visita',
  description:
    'Registra a intenção do cliente de visitar a loja ou fazer test-drive e avisa a equipe. NÃO confirma a agenda - quem confirma é um vendedor. Use quando o cliente indicar dia ou período.',
  input_schema: {
    type: 'object',
    properties: {
      preferencia: { type: 'string', description: 'Dia e horário como o cliente falou, ex.: "sábado de manhã".' },
      veiculoId: { type: 'string', description: 'Id do veículo de interesse, se houver.' },
    },
    required: ['preferencia'],
  },
};

const PROFILE_TOOL: Anthropic.Tool = {
  name: 'registrar_perfil_cliente',
  description:
    'Guarda o que você descobriu sobre o cliente (orçamento, entrada, forma de pagamento, carro na troca, prazo, preferências). Chame assim que a informação aparecer na conversa - é o que evita reperguntar depois. Envie apenas os campos que descobriu.',
  input_schema: {
    type: 'object',
    properties: {
      orcamento: { type: 'string', description: 'Faixa de valor que o cliente pretende gastar.' },
      entrada: { type: 'string', description: 'Valor de entrada disponível.' },
      formaPagamento: { type: 'string', description: 'À vista, financiado, consórcio, troca.' },
      veiculoNaTroca: { type: 'string', description: 'Veículo que o cliente daria na troca.' },
      prazo: { type: 'string', description: 'Urgência ou prazo para decidir.' },
      preferencias: { type: 'string', description: 'Cor, câmbio, opcionais, uso pretendido.' },
      observacoes: { type: 'string', description: 'Qualquer outro dado útil ao vendedor.' },
    },
    required: [],
  },
};

const KNOWLEDGE_TOOL: Anthropic.Tool = {
  name: 'consultar_conhecimento',
  description:
    'Consulta as políticas e informações escritas pela loja (garantia, financiamento, troca, documentação, horários). Use antes de responder qualquer pergunta sobre condições e regras da loja.',
  input_schema: {
    type: 'object',
    properties: { pergunta: { type: 'string', description: 'A dúvida do cliente, em linguagem natural.' } },
    required: ['pergunta'],
  },
};

const CREDIT_TOOL: Anthropic.Tool = {
  name: 'consultar_credito_cliente',
  description:
    'Use quando o cliente fornecer voluntariamente um CPF ou CNPJ válido para simulação de crédito. Retorna score, faixa de risco, limite estimado e entrada sugerida. É uma estimativa - nunca uma aprovação.',
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
};

const HANDOFF_TOOL: Anthropic.Tool = {
  name: 'transferir_para_atendente_humano',
  description:
    'Use imediatamente se o cliente pedir para falar com um humano, demonstrar pressa/irritação, se a conversa avançar para preço/proposta, ou se você concluir a qualificação. Desliga o atendimento automático e alerta a equipe de vendas.',
  input_schema: {
    type: 'object',
    properties: {
      motivo_transferencia: {
        type: 'string',
        description: 'Motivo curto do transbordo (ex.: "cliente quer negociar preço").',
      },
    },
    required: [],
  },
};

/**
 * Conjunto de ferramentas desta loja. A ordem é fixa e determinística - o cache
 * de prompt casa por bytes, então reordenar aqui custaria o prefixo inteiro.
 */
export function buildAgentTools(profile: AgentProfileResolved, useKnowledgeRetrieval: boolean): Anthropic.Tool[] {
  const tools: Anthropic.Tool[] = [];
  if (profile.canSearchInventory) tools.push(SEARCH_TOOL, DETAIL_TOOL);
  if (useKnowledgeRetrieval) tools.push(KNOWLEDGE_TOOL);
  if (profile.canQuoteCredit) tools.push(CREDIT_TOOL);
  if (profile.canScheduleVisit) tools.push(SCHEDULE_TOOL);
  tools.push(PROFILE_TOOL, HANDOFF_TOOL);
  return tools;
}

export interface AgentToolContext {
  ticketId: string;
  leadId: string;
  /** Conta dona do atendimento. Nunca vem do modelo - sempre do ticket. */
  accountId: string;
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
  event: 'reply' | 'credit' | 'handoff' | 'inventory' | 'schedule' | 'profile' | 'followup',
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

// ─── Executores ──────────────────────────────────────────────────────────────

async function runSearchTool(input: Record<string, unknown>, ctx: AgentToolContext): Promise<ToolOutcome> {
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

  const result = await searchInventory(ctx.accountId, {
    marca: str(input.marca),
    modelo: str(input.modelo),
    precoMax: num(input.precoMax),
    precoMin: num(input.precoMin),
    anoMin: num(input.anoMin),
    kmMax: num(input.kmMax),
    combustivel: str(input.combustivel),
    tipo: str(input.tipo),
  });

  await logAiAction(ctx.ticketId, 'inventory', `Busca no estoque · ${result.encontrados} resultado(s)`, {
    filtros: input,
    encontrados: result.encontrados,
  });

  if (result.encontrados === 0) {
    return {
      content:
        'Nenhum veículo no estoque atende a esses critérios. Diga isso ao cliente com honestidade, ofereça avisá-lo quando entrar algo no perfil e pergunte se ele flexibilizaria algum ponto (faixa de preço, ano ou modelo).',
    };
  }

  return {
    content: [
      `${result.encontrados} veículo(s) encontrado(s); os ${result.mostrando} mais relevantes:`,
      JSON.stringify(result.veiculos, null, 2),
      'Apresente no máximo 2 ou 3 opções, em texto corrido e curto, com preço e ano. Não cole este JSON na conversa.',
    ].join('\n'),
  };
}

async function runDetailTool(input: Record<string, unknown>, ctx: AgentToolContext): Promise<ToolOutcome> {
  const id = typeof input.veiculoId === 'string' ? input.veiculoId : '';
  if (!id) return { content: 'Informe o veiculoId devolvido por buscar_veiculos.' };

  const vehicle = await getInventoryDetail(ctx.accountId, id);
  if (!vehicle) {
    return {
      content:
        'Este veículo não está mais disponível. Não o ofereça ao cliente; use buscar_veiculos para apresentar alternativas.',
    };
  }
  await logAiAction(ctx.ticketId, 'inventory', `Detalhe consultado · ${vehicle.titulo}`, { veiculoId: id });
  return { content: `Ficha do veículo:\n${JSON.stringify(vehicle, null, 2)}` };
}

async function runKnowledgeTool(input: Record<string, unknown>, ctx: AgentToolContext): Promise<ToolOutcome> {
  const pergunta = typeof input.pergunta === 'string' ? input.pergunta : '';
  const docs = await searchKnowledge(ctx.accountId, pergunta);
  if (docs.length === 0) {
    return {
      content:
        'Nada encontrado na base da loja sobre isso. Não improvise a resposta: diga que vai confirmar com o vendedor.',
    };
  }
  return {
    content: docs.map((d) => `## ${d.title}\n${d.content}`).join('\n\n'),
  };
}

async function runProfileTool(input: Record<string, unknown>, ctx: AgentToolContext): Promise<ToolOutcome> {
  const allowed: Array<keyof LeadProfile> = [
    'orcamento', 'entrada', 'formaPagamento', 'veiculoNaTroca', 'prazo', 'preferencias', 'observacoes',
  ];
  const patch: LeadProfile = {};
  for (const key of allowed) {
    const value = input[key];
    if (typeof value === 'string' && value.trim()) patch[key] = value.trim();
  }
  if (Object.keys(patch).length === 0) {
    return { content: 'Nenhum campo informado - nada foi salvo.' };
  }

  await mergeLeadProfile(ctx.leadId, patch);
  // Não loga os VALORES: são preferências comerciais do titular (PII).
  await logAiAction(ctx.ticketId, 'profile', `Perfil do cliente atualizado (${Object.keys(patch).join(', ')})`, {
    campos: Object.keys(patch),
  });
  return { content: 'Perfil atualizado. Não repita ao cliente o que acabou de registrar; siga a conversa.' };
}

async function runScheduleTool(input: Record<string, unknown>, ctx: AgentToolContext): Promise<ToolOutcome> {
  const preferencia = typeof input.preferencia === 'string' ? input.preferencia.trim() : '';
  if (!preferencia) return { content: 'Pergunte ao cliente qual dia e horário seriam melhores.' };

  const veiculoId = typeof input.veiculoId === 'string' ? input.veiculoId : undefined;
  const vehicle = veiculoId ? await getInventoryDetail(ctx.accountId, veiculoId) : null;

  await prisma.$transaction(async (tx) => {
    await tx.ticket.update({
      where: { id: ctx.ticketId },
      data: { priority: TicketPriority.HIGH },
    });
    await tx.ticketInteraction.create({
      data: {
        ticketId: ctx.ticketId,
        type: InteractionType.SYSTEM,
        body: `Visita solicitada: ${preferencia}${vehicle ? ` · ${vehicle.titulo}` : ''}`,
        metadata: toJson({
          kind: 'ai', event: 'schedule', alert: true, preferencia,
          veiculoId: veiculoId ?? null, at: new Date().toISOString(),
        }),
      },
    });
  });

  logger.info('IA: visita solicitada', { ticketId: ctx.ticketId });
  return {
    content:
      'Interesse de visita registrado e equipe avisada. Confirme ao cliente que um vendedor vai retornar para fechar o horário - não confirme a agenda como se já estivesse marcada.',
  };
}

async function runCreditTool(documentoRaw: unknown, ctx: AgentToolContext): Promise<ToolOutcome> {
  const raw = typeof documentoRaw === 'string' ? documentoRaw : '';
  const valid = validateDocument(raw);
  if (!valid) {
    return { content: 'Documento inválido: os dígitos verificadores não conferem. Peça ao cliente para reenviar o CPF/CNPJ.' };
  }

  // Mesma franquia da consulta feita por gente - o custo no bureau é o mesmo,
  // e sem esta checagem o agente seria o caminho aberto para furar a cota.
  if (!(await hasQuota(ctx.accountId, UsageMetric.CREDIT_QUERY))) {
    return {
      content:
        'A franquia de consultas de crédito da loja acabou neste mês. Não faça a simulação; diga ao cliente que um consultor vai verificar as condições de financiamento e transfira para um atendente humano.',
    };
  }

  // O bureau real é rede: pode dar timeout, 429 ou instabilidade do fornecedor.
  // O despachante de ferramentas (executeAgentTool) não tem try/catch, então uma
  // exceção aqui derrubaria o turno inteiro e o cliente ficaria sem resposta no
  // meio da conversa. A falha vira instrução para o modelo transbordar.
  let report;
  try {
    report = await bureau().query({ digits: valid.digits, docType: valid.docType });
  } catch (err) {
    logger.warn('IA: consulta de crédito falhou no bureau', {
      ticketId: ctx.ticketId,
      document: maskDocument(valid.digits),
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      content:
        'A consulta ao bureau de crédito falhou agora (indisponibilidade do fornecedor). Não invente números nem prometa aprovação; diga ao cliente que a análise será feita por um consultor e transfira para um atendente humano.',
    };
  }

  // Consentimento: o próprio titular está fornecendo o documento voluntariamente
  // nesta mensagem, para esta simulação - é um ato específico e contemporâneo
  // do titular (a forma mais forte de consentimento possível aqui), não uma
  // suposição do sistema. Registrado como tal, com o canal 'chat_ia', para que
  // a consulta tenha o mesmo lastro de autorização exigido do fluxo humano
  // (legal/09-CONSENTIMENTO-CONSULTA-DE-CREDITO.md).
  await prisma.lead.update({
    where: { id: ctx.leadId },
    data: { creditConsentAt: new Date(), creditConsentSource: 'chat_ia', creditConsentVersion: CREDIT_CONSENT_VERSION },
  });

  // persiste no histórico do módulo de crédito, já vinculado ao lead e à conta (sem actor humano)
  await prisma.creditQuery.create({
    data: {
      document: valid.digits,
      docType: valid.docType,
      name: report.name,
      score: report.score,
      report: report as unknown as Prisma.InputJsonValue,
      leadId: ctx.leadId,
      accountId: ctx.accountId,
    },
  });

  await recordUsage(ctx.accountId, UsageMetric.CREDIT_QUERY);

  logger.info('IA: consulta de crédito', {
    ticketId: ctx.ticketId,
    docType: valid.docType,
    document: maskDocument(valid.digits),
    score: report.score,
    consentSource: 'chat_ia',
  });

  await logAiAction(ctx.ticketId, 'credit', `Consulta de crédito · score ${report.score} (${report.bandLabel})`, {
    score: report.score,
    band: report.band,
    limit: report.credit.limit,
  });

  const limitTxt = report.credit.limit > 0 ? brl(report.credit.limit) : 'não liberado neste momento';
  const summaryForClaude = [
    report.source === 'mock'
      ? `Resultado de SIMULAÇÃO INTERNA (sem consulta a bureau de crédito real) - estimativa, não é aprovação:`
      : `Resultado da consulta (estimativa, não é aprovação):`,
    `- Score: ${report.score}/1000 (${report.bandLabel})`,
    `- Limite de financiamento estimado: ${limitTxt}`,
    report.credit.limit > 0
      ? `- Entrada sugerida: ${report.credit.downPaymentLabel}`
      : `- Recomende avaliar entrada maior ou um veículo de menor valor.`,
    report.restrictions.hasRestrictions
      ? `- Observação: constam restrições no CPF/CNPJ; conduza com cautela e sem prometer aprovação.`
      : `- Sem restrições encontradas.`,
    report.source === 'mock'
      ? `Nunca diga ao cliente que isto veio de um bureau de crédito real - é uma simulação. Personalize a mensagem de forma consultiva, sem citar o score cru nem prometer aprovação.`
      : `Personalize a mensagem ao cliente de forma consultiva, sem citar o score cru nem prometer aprovação.`,
  ].join('\n');

  return { content: summaryForClaude };
}

async function runHandoffTool(motivoRaw: unknown, ctx: AgentToolContext): Promise<ToolOutcome> {
  const motivo = typeof motivoRaw === 'string' && motivoRaw.trim() ? motivoRaw.trim() : 'Coleta inicial concluída';

  await prisma.$transaction(async (tx) => {
    // desliga o bot desta conversa e prioriza para a equipe humana notar.
    // nextActionAt = null tira o ticket do motor de fluxo: quem manda mensagem
    // a partir daqui é gente, não o sistema.
    await tx.ticket.update({
      where: { id: ctx.ticketId },
      data: {
        botEnabled: false,
        priority: TicketPriority.HIGH,
        status: 'IN_PROGRESS',
        nextActionAt: null,
      },
    });

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
    case 'buscar_veiculos':
      return runSearchTool(input, ctx);
    case 'detalhar_veiculo':
      return runDetailTool(input, ctx);
    case 'consultar_conhecimento':
      return runKnowledgeTool(input, ctx);
    case 'registrar_perfil_cliente':
      return runProfileTool(input, ctx);
    case 'agendar_visita':
      return runScheduleTool(input, ctx);
    case 'consultar_credito_cliente':
      return runCreditTool(input.documento, ctx);
    case 'transferir_para_atendente_humano':
      return runHandoffTool(input.motivo_transferencia, ctx);
    default:
      return { content: `Ferramenta desconhecida: ${name}` };
  }
}
