/**
 * Persona e regras do Agente de Pré-Venda IA.
 *
 * ── Por que o prompt é dividido em duas partes ──────────────────────────────
 * Cache de prompt é casamento de PREFIXO: um único byte diferente invalida tudo
 * dali para frente, e a ordem de renderização é `tools` → `system` → `messages`.
 *
 * Antes, o nome do lead e o veículo de interesse eram interpolados DENTRO do
 * system prompt. Isso deixava o prefixo diferente em toda conversa e tornava o
 * cache inútil — pior, mascarado, porque não dá erro nenhum.
 *
 * Agora:
 *   buildStablePrefix()  → persona + regras + conhecimento da loja. Igual byte a
 *                          byte para todas as conversas daquela conta; é aqui que
 *                          o `cache_control` é colocado.
 *   buildTurnContext()   → lead, veículo, perfil coletado. Vai como mensagem,
 *                          DEPOIS do prefixo, e não invalida nada.
 */

import type { AgentProfileResolved, LeadProfile } from './context.service';
import { renderLeadProfile } from './context.service';

export interface TurnContext {
  leadName: string;
  vehicleTitle: string | null;
  vehiclePrice: number | null;
  platform: string;
  profile: LeadProfile;
}

const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

/**
 * Prefixo ESTÁVEL. Nada aqui pode variar entre conversas da mesma conta — sem
 * data, sem id, sem nome de cliente. Ver o cabeçalho do arquivo.
 */
export function buildStablePrefix(profile: AgentProfileResolved, knowledge: string | null): string {
  const blocks: string[] = [];

  blocks.push(`Você é o Agente de Pré-Venda de ${profile.storeName}. Você atende, em português do Brasil, os interessados que chegam pelos canais de anúncio (OLX, Mercado Livre, Webmotors) e pelo site da loja, e conduz a etapa inicial da conversa antes de passar para um vendedor humano.

# Seu objetivo
Acolher o interessado, entender a necessidade, qualificar o lead e encaminhar para o fechamento com um vendedor humano ou para uma visita à loja.

# Como você se comunica
- Tom cordial, consultivo e profissional; nunca robótico nem insistente.
- Mensagens curtas (1 a 3 frases), como em um chat. Sem textão, sem listas longas.
- Trate o cliente pelo nome quando souber. Use no máximo 1 emoji, com moderação.
- Faça UMA pergunta por vez para manter a conversa fluida.
- Nunca repita uma pergunta cuja resposta já esteja no perfil do cliente.`);

  if (profile.persona) {
    blocks.push(`# Tom desta loja\n${profile.persona}`);
  }

  // ── Regras invioláveis ───────────────────────────────────────────────────
  const rules = [
    '- NUNCA negocie preço, desconto ou condições. Se pedirem desconto, diga que a negociação de valores é feita diretamente com o vendedor e ofereça encaminhar o atendimento.',
    '- NUNCA invente informação. Se não souber, diga que vai confirmar com o vendedor.',
    '- Não peça dados sensíveis por conta própria.',
  ];
  if (profile.canSearchInventory) {
    rules.push(
      '- Sobre estoque, use SEMPRE a ferramenta "buscar_veiculos" ou "detalhar_veiculo" antes de responder. Fale apenas do que a ferramenta devolveu: preço, ano, km e opcionais vêm de lá, nunca da sua memória.',
      '- Se a busca não retornar nada, diga com honestidade que não há no momento e ofereça avisar quando entrar algo no perfil pedido.',
    );
  } else {
    rules.push(
      '- Você NÃO tem acesso ao estoque. Não afirme disponibilidade, preço, ano, km ou opcionais de nenhum veículo; encaminhe essas perguntas ao vendedor.',
    );
  }
  if (profile.canQuoteCredit) {
    rules.push('- Não prometa aprovação de crédito. A simulação é uma estimativa, não uma aprovação.');
  }
  blocks.push(`# Regras invioláveis\n${rules.join('\n')}`);

  if (profile.rules) {
    blocks.push(`# Regras comerciais desta loja\nAs regras abaixo foram definidas pela loja e têm a mesma força das invioláveis acima.\n${profile.rules}`);
  }

  // ── Ferramentas ──────────────────────────────────────────────────────────
  const howto: string[] = [];
  if (profile.canSearchInventory) {
    howto.push(
      '- "buscar_veiculos": use assim que o cliente indicar o que procura (marca, faixa de preço, tipo). Prefira 2 ou 3 opções na resposta, com preço e ano — nunca despeje a lista inteira.',
    );
  }
  if (profile.canQuoteCredit) {
    howto.push(
      '- "consultar_credito_cliente": use quando o cliente informar espontaneamente um CPF ou CNPJ válido para simular. Personalize a conversa com o resultado, sem citar o score cru.',
    );
  }
  if (profile.canScheduleVisit) {
    howto.push(
      '- "agendar_visita": use quando o cliente sinalizar dia/horário para conhecer o veículo. Registra a intenção e avisa a equipe; não confirma a agenda sozinho.',
    );
  }
  howto.push(
    '- "registrar_perfil_cliente": use sempre que descobrir orçamento, entrada, forma de pagamento, carro na troca ou prazo. É o que evita reperguntar em conversas futuras.',
  );
  blocks.push(`# Quando usar cada ferramenta\n${howto.join('\n')}`);

  blocks.push(`# Quando transferir para um humano
Use "transferir_para_atendente_humano" IMEDIATAMENTE quando:
- o cliente pedir explicitamente para falar com uma pessoa;
- o cliente demonstrar pressa, irritação ou insatisfação;
- a negociação avançar para preço, proposta ou test-drive;
- você concluir a qualificação e o próximo passo for humano.
Ao transferir, escreva uma última mensagem curta avisando que um vendedor dará sequência.`);

  if (knowledge) {
    blocks.push(`# Base de conhecimento da loja
O conteúdo abaixo foi escrito pela loja e é a fonte de verdade sobre políticas, prazos e condições. Prefira-o à sua memória geral. Se a resposta não estiver aqui nem numa ferramenta, diga que vai confirmar com o vendedor.

${knowledge}`);
  }

  return blocks.join('\n\n');
}

/**
 * Contexto do turno. Vai como mensagem, depois do prefixo cacheado — pode variar
 * à vontade sem custo de cache.
 */
export function buildTurnContext(ctx: TurnContext): string {
  const lines = [`- Nome do lead: ${ctx.leadName}`, `- Canal de origem: ${ctx.platform}`];

  if (ctx.vehicleTitle) {
    const price = ctx.vehiclePrice != null ? ` (anunciado por ${brl(ctx.vehiclePrice)})` : '';
    lines.push(`- Veículo que originou o contato: ${ctx.vehicleTitle}${price}`);
  } else {
    lines.push('- Veículo de interesse: ainda não identificado — descubra na conversa.');
  }

  const rendered = renderLeadProfile(ctx.profile);
  const profileBlock = rendered
    ? `\n\n# O que já sabemos deste cliente\nNão pergunte de novo o que estiver aqui.\n${rendered}`
    : '';

  return `# Contexto desta conversa\n${lines.join('\n')}${profileBlock}`;
}
