/**
 * Catálogo de permissões do CRM - a fonte da verdade de "o que dá para fazer
 * aqui dentro".
 *
 * Cada permissão é um slug estável (`modulo.acao`) guardado em
 * `access_profiles.permissions`. O front NÃO tem uma cópia desta lista: ele lê
 * o catálogo por `GET /api/roles/catalog` para desenhar a tela de perfis, e
 * recebe em `/auth/me` a lista já expandida do usuário para acender ou apagar
 * menus. Duas cópias divergiriam no primeiro módulo novo.
 *
 * REGRA: o slug entra na lista quando existe rota (ou dado) que o respeite.
 * Permissão que não barra nada é pior que permissão nenhuma - promete um
 * controle que o sistema não cumpre.
 */
import { UserRole } from '@prisma/client';

/** Acesso total. Guardado no perfil de administrador em vez da lista completa:
 *  assim um módulo novo já nasce liberado para ele, sem migration de dados. */
export const WILDCARD = '*';

export interface PermissionDef {
  key: string;
  label: string;
  /** O que o usuário passa a ver/fazer - texto exibido na tela de perfis. */
  description: string;
  /** Permissões que esta arrasta junto (marcar "editar" implica "ver"). */
  implies?: string[];
}

export interface PermissionGroup {
  key: string;
  label: string;
  hint: string;
  permissions: PermissionDef[];
}

export const PERMISSION_CATALOG: PermissionGroup[] = [
  {
    key: 'atendimento',
    label: 'Atendimento',
    hint: 'Caixa de entrada, conversas com o cliente e funil de vendas.',
    permissions: [
      {
        key: 'tickets.view',
        label: 'Ver a caixa de entrada',
        description: 'Enxerga os atendimentos atribuídos a ele e os que estão livres.',
      },
      {
        key: 'tickets.view.all',
        label: 'Ver os atendimentos de toda a loja',
        description: 'Enxerga também o que está com os outros atendentes - visão de supervisão.',
        implies: ['tickets.view'],
      },
      {
        key: 'tickets.create',
        label: 'Registrar atendimento manual',
        description: 'Abre atendimento para quem chegou pelo balcão ou pelo telefone.',
        implies: ['tickets.view'],
      },
      {
        key: 'tickets.reply',
        label: 'Responder e anotar',
        description: 'Envia mensagem ao cliente e registra notas internas na conversa.',
        implies: ['tickets.view'],
      },
      {
        key: 'tickets.assign',
        label: 'Atribuir a outras pessoas',
        description: 'Passa atendimentos para qualquer atendente. Sem isso, só assume os livres.',
        implies: ['tickets.view'],
      },
      {
        key: 'tickets.bot',
        label: 'Ligar e desligar a IA na conversa',
        description: 'Decide quando o agente de pré-venda assume ou devolve o cliente.',
        implies: ['tickets.view'],
      },
    ],
  },
  {
    key: 'estoque',
    label: 'Estoque',
    hint: 'Veículos, fotos e os números de custo de cada um.',
    permissions: [
      {
        key: 'vehicles.view',
        label: 'Ver o estoque',
        description: 'Consulta a lista e a ficha dos veículos, com preço de venda.',
      },
      {
        key: 'vehicles.manage',
        label: 'Cadastrar, editar e excluir',
        description: 'Mexe na ficha, nas fotos e na publicação do veículo na vitrine.',
        implies: ['vehicles.view'],
      },
      {
        key: 'vehicles.costs',
        label: 'Ver custo e margem',
        description: 'Libera preço de compra, gastos de preparação e o lucro previsto.',
        implies: ['vehicles.view'],
      },
    ],
  },
  {
    key: 'credito',
    label: 'Análise de crédito',
    hint: 'Consulta de CPF/CNPJ e o histórico de análises da loja.',
    permissions: [
      {
        key: 'credit.view',
        label: 'Ver as consultas',
        description: 'Abre o histórico de análises e os laudos já emitidos.',
      },
      {
        key: 'credit.query',
        label: 'Consultar CPF/CNPJ',
        description: 'Dispara novas consultas ao bureau - cada uma é registrada na auditoria.',
        implies: ['credit.view'],
      },
    ],
  },
  {
    key: 'financeiro',
    label: 'Financeiro e fiscal',
    hint: 'Contas a pagar e receber, notas fiscais.',
    permissions: [
      {
        key: 'finance.view',
        label: 'Ver o financeiro',
        description: 'Consulta contas a pagar, a receber e o resumo do caixa.',
      },
      {
        key: 'finance.manage',
        label: 'Lançar e dar baixa',
        description: 'Cria lançamentos, marca como pago e exclui contas.',
        implies: ['finance.view'],
      },
      {
        key: 'fiscal.view',
        label: 'Ver notas fiscais',
        description: 'Consulta as notas emitidas e o status de cada uma.',
      },
      {
        key: 'fiscal.emit',
        label: 'Emitir e cancelar notas',
        description: 'Emite a nota da venda e faz o cancelamento quando necessário.',
        implies: ['fiscal.view'],
      },
    ],
  },
  {
    key: 'relatorios',
    label: 'Relatórios',
    hint: 'Números consolidados da loja.',
    permissions: [
      {
        key: 'reports.view',
        label: 'Ver relatórios e BI',
        description: 'Acessa os painéis de desempenho de vendas, estoque e atendimento.',
      },
    ],
  },
  {
    key: 'canais',
    label: 'Canais de venda',
    hint: 'Por onde o estoque aparece e os leads entram.',
    permissions: [
      {
        key: 'storefront.manage',
        label: 'Configurar a vitrine',
        description: 'Domínio, identidade visual e o que fica publicado no site da loja.',
      },
      {
        key: 'integrations.manage',
        label: 'Conectar portais',
        description: 'Credenciais de OLX, Webmotors, WhatsApp e a fila de webhooks recebidos.',
      },
      {
        key: 'agent.manage',
        label: 'Configurar o agente de IA',
        description: 'Tom de voz, base de conhecimento e as regras de follow-up automático.',
      },
    ],
  },
  {
    key: 'loja',
    label: 'Dados da loja',
    hint: 'Cadastro da empresa e formulários do sistema.',
    permissions: [
      {
        key: 'company.manage',
        label: 'Editar dados da empresa',
        description: 'CNPJ, endereço e contatos usados em documentos, além do formulário de leads.',
      },
    ],
  },
  {
    key: 'assinatura',
    label: 'Assinatura e pagamentos',
    hint: 'O plano contratado, as faturas e os dados de cobrança da loja.',
    permissions: [
      {
        key: 'billing.view',
        label: 'Ver plano e faturas',
        description: 'Consulta o plano vigente, o consumo do mês e o histórico de faturas.',
      },
      {
        key: 'billing.manage',
        label: 'Contratar e trocar de plano',
        description: 'Assina, muda de plano, troca o meio de pagamento e cancela a assinatura.',
        implies: ['billing.view'],
      },
    ],
  },
  {
    key: 'seguranca',
    label: 'Usuários e segurança',
    hint: 'Quem entra, o que cada um pode e o rastro do que foi feito.',
    permissions: [
      {
        key: 'users.manage',
        label: 'Gerenciar usuários',
        description: 'Cria, edita e revoga o acesso dos funcionários da loja.',
      },
      {
        key: 'profiles.manage',
        label: 'Gerenciar perfis de acesso',
        description: 'Cria perfis e define as permissões de cada um - inclusive este.',
      },
      {
        key: 'audit.view',
        label: 'Ver a auditoria',
        description: 'Trilha de quem alterou o quê, quando e de qual origem.',
      },
      {
        key: 'leads.privacy',
        label: 'Exportar e anonimizar titulares',
        description: 'Atende os pedidos de acesso e de esquecimento previstos na LGPD.',
      },
    ],
  },
  {
    key: 'plataforma',
    label: 'Plataforma',
    hint: 'Gestão de todas as contas do Eixo. Só existe na conta operadora - em qualquer outra loja, estas permissões não abrem nada (ver PLATFORM_ACCOUNT_ID).',
    permissions: [
      {
        key: 'platform.accounts.view',
        label: 'Ver contas, faturas e limites',
        description: 'Enxerga todas as contas cadastradas: plano, cobrança, usuários ativos e consumo dos limites.',
      },
      {
        key: 'platform.support.access',
        label: 'Acessar conta de cliente como suporte',
        description: 'Abre uma sessão temporária de administrador dentro da conta de um cliente.',
        implies: ['platform.accounts.view'],
      },
    ],
  },
];

const DEFS = new Map<string, PermissionDef>();
for (const group of PERMISSION_CATALOG) {
  for (const def of group.permissions) DEFS.set(def.key, def);
}

/** Todos os slugs válidos, na ordem em que a tela os apresenta. */
export const ALL_PERMISSIONS: string[] = [...DEFS.keys()];

export function isKnownPermission(key: string): boolean {
  return key === WILDCARD || DEFS.has(key);
}

/**
 * Resolve a lista guardada no perfil na lista efetiva: troca o coringa pelo
 * catálogo inteiro e agrega as implicações (quem edita, vê).
 *
 * Roda no servidor a cada resolução de sessão - por isso é barata e sem I/O.
 */
export function expandPermissions(stored: readonly string[]): string[] {
  if (stored.includes(WILDCARD)) return [...ALL_PERMISSIONS];

  const out = new Set<string>();
  const push = (key: string) => {
    if (out.has(key)) return;
    const def = DEFS.get(key);
    if (!def) return; // slug removido do catálogo: ignorado, nunca herdado
    out.add(key);
    def.implies?.forEach(push);
  };
  stored.forEach(push);
  // preserva a ordem do catálogo para a lista chegar estável no front
  return ALL_PERMISSIONS.filter((key) => out.has(key));
}

/** Verdadeiro se a lista efetiva cobre QUALQUER uma das permissões pedidas. */
export function hasPermission(effective: readonly string[], ...required: string[]): boolean {
  return required.some((key) => effective.includes(key));
}

/**
 * Nível base derivado do perfil, gravado em `users.role`.
 *
 * O enum não decide mais acesso; ele responde "quem administra esta loja?"
 * para quem não pergunta por permissão (o aviso de expiração do trial, por
 * exemplo). Deriva de `users.manage` porque é essa a permissão de quem toca a
 * conta - quem pode dar e tirar acesso dos outros.
 */
export function roleFromPermissions(effective: readonly string[]): UserRole {
  return hasPermission(effective, 'users.manage') ? UserRole.ADMIN : UserRole.AGENT;
}

// ─── Perfis padrão ───────────────────────────────────────────────────────────

export interface ProfileSeed {
  systemKey: string;
  name: string;
  description: string;
  permissions: string[];
}

/**
 * Os dois perfis que nascem com toda conta - o que o sistema já fazia com o
 * enum ADMIN/AGENT.
 *
 * Uma diferença deliberada em relação ao comportamento anterior: o "Atendente"
 * NÃO recebe 'vehicles.costs'. Antes não havia como separar "ver o estoque" de
 * "ver quanto o carro custou", e o vendedor via a margem. O padrão agora é o
 * menor privilégio; quem quiser o de antes marca a permissão na tela de perfis.
 *
 * Ficam em duas linhas de verdade: aqui (para contas novas) e no backfill da
 * migration (para as que já existiam).
 */
export const DEFAULT_PROFILES: ProfileSeed[] = [
  {
    systemKey: 'admin',
    name: 'Administrador',
    description: 'Acesso total à loja, inclusive usuários, financeiro e configurações.',
    permissions: [WILDCARD],
  },
  {
    systemKey: 'agent',
    name: 'Atendente',
    description: 'Atende os próprios leads, consulta o estoque e roda análise de crédito.',
    permissions: [
      'tickets.view',
      'tickets.create',
      'tickets.reply',
      'tickets.bot',
      'vehicles.view',
      'credit.view',
      'credit.query',
    ],
  },
];

export const ADMIN_PROFILE_KEY = 'admin';
export const AGENT_PROFILE_KEY = 'agent';

/**
 * Pontos de partida oferecidos no "Novo perfil". Não viram linha no banco:
 * o lojista escolhe um, a tela marca as permissões e ele ajusta antes de
 * salvar. É a diferença entre entregar cargos prontos que ninguém pediu e
 * poupar o trabalho de marcar vinte caixas do zero.
 */
export interface ProfileTemplate {
  key: string;
  name: string;
  description: string;
  permissions: string[];
}

export const PROFILE_TEMPLATES: ProfileTemplate[] = [
  {
    key: 'blank',
    name: 'Em branco',
    description: 'Começa sem nenhuma permissão marcada.',
    permissions: [],
  },
  {
    key: 'agent',
    name: 'Atendente',
    description: 'Cuida dos próprios leads e consulta estoque e crédito.',
    permissions: [...(DEFAULT_PROFILES[1].permissions as string[])],
  },
  {
    key: 'sales-manager',
    name: 'Gerente de vendas',
    description: 'Supervisiona o funil inteiro, distribui leads e cuida do estoque.',
    permissions: [
      'tickets.view',
      'tickets.view.all',
      'tickets.create',
      'tickets.reply',
      'tickets.assign',
      'tickets.bot',
      'vehicles.view',
      'vehicles.manage',
      'vehicles.costs',
      'credit.view',
      'credit.query',
      'reports.view',
    ],
  },
  {
    key: 'finance',
    name: 'Financeiro',
    description: 'Contas, notas fiscais e os números do estoque - sem acesso ao funil.',
    permissions: [
      'vehicles.view',
      'vehicles.costs',
      'finance.view',
      'finance.manage',
      'fiscal.view',
      'fiscal.emit',
      'reports.view',
    ],
  },
];
