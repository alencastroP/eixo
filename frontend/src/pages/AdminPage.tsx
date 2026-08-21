import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import { PageHeader } from '../components/PageHeader';
import type { Permission } from '../types';
import {
  BuildingIcon,
  ChevronRightIcon,
  CreditCardIcon,
  GlobeIcon,
  GridIcon,
  HistoryIcon,
  PlugIcon,
  ShieldIcon,
  SparkIcon,
  UsersIcon,
} from '../components/icons';

interface Tile {
  /** Ausente = módulo ainda não construído: o botão aparece, mas não navega. */
  to?: string;
  label: string;
  desc: string;
  icon: ReactNode;
  /** Quem não tem a permissão não vê o botão. */
  permission: Permission;
}

interface Section {
  title: string;
  hint: string;
  tiles: Tile[];
}

/**
 * Tudo que era item solto no rail (vitrine, integrações, auditoria) e no menu
 * do usuário (empresa) passa por aqui. O rail volta a ser só operação diária.
 *
 * Cada botão declara a permissão que o abre: a central mostra a cada pessoa o
 * pedaço da administração que o perfil dela alcança, em vez de ser um bloco
 * único que só o dono da loja enxerga.
 */
const SECTIONS: Section[] = [
  {
    title: 'Empresa',
    hint: 'Identificação e dados de faturamento da loja.',
    tiles: [
      {
        to: '/company',
        label: 'Dados da Empresa',
        desc: 'CNPJ, razão social, endereço e contatos usados em documentos e na vitrine.',
        icon: <BuildingIcon size={20} />,
        permission: 'company.manage',
      },
    ],
  },
  {
    title: 'Canais de venda',
    hint: 'Onde o estoque aparece e por onde os leads entram.',
    tiles: [
      {
        to: '/storefront',
        label: 'Vitrine',
        desc: 'Site público da loja: domínio, identidade visual e veículos publicados.',
        icon: <GlobeIcon size={20} />,
        permission: 'storefront.manage',
      },
      {
        to: '/integrations',
        label: 'Integrações',
        desc: 'Conecte OLX, Webmotors e demais portais para centralizar leads e mensagens.',
        icon: <PlugIcon size={20} />,
        permission: 'integrations.manage',
      },
      {
        to: '/agent',
        label: 'Agente de IA',
        desc: 'Tom de voz, base de conhecimento da loja e o que acontece quando o cliente para de responder.',
        icon: <SparkIcon size={20} />,
        permission: 'agent.manage',
      },
    ],
  },
  {
    title: 'Usuários',
    hint: 'Quem acessa a conta e o que cada um pode fazer.',
    tiles: [
      {
        to: '/users',
        label: 'Gerenciar Usuários',
        desc: 'Crie, edite ou revogue o acesso dos funcionários da loja.',
        icon: <UsersIcon size={20} />,
        permission: 'users.manage',
      },
      {
        to: '/roles',
        label: 'Perfis & Permissões',
        desc: 'Defina o que cada perfil pode ver e fazer em cada módulo do sistema.',
        icon: <ShieldIcon size={20} />,
        permission: 'profiles.manage',
      },
    ],
  },
  {
    title: 'Controle',
    hint: 'Rastreabilidade do que acontece na conta.',
    tiles: [
      {
        to: '/audit',
        label: 'Auditoria',
        desc: 'Trilha completa de ações: quem alterou o quê, quando e de qual origem.',
        icon: <HistoryIcon size={20} />,
        permission: 'audit.view',
      },
    ],
  },
  {
    title: 'Assinatura',
    hint: 'O que a loja contratou do Eixo e como isso é cobrado.',
    tiles: [
      {
        to: '/billing',
        label: 'Plano e pagamentos',
        desc: 'Plano contratado, consumo do mês, faturas e nota fiscal.',
        icon: <CreditCardIcon size={20} />,
        permission: 'billing.view',
      },
    ],
  },
];

/**
 * A própria central e tudo que mora dentro dela - o rail e a barra do celular
 * usam a lista para manter o alvo "Administração" aceso nas telas filhas.
 */
export const ADMIN_ROUTES: string[] = [
  '/admin',
  ...SECTIONS.flatMap((s) => s.tiles.map((t) => t.to).filter((to): to is string => Boolean(to))),
];

/** Ter QUALQUER uma destas já justifica abrir a central. */
export const ADMIN_PERMISSIONS: Permission[] = [
  ...new Set(SECTIONS.flatMap((s) => s.tiles.map((t) => t.permission))),
];

/** Central de administração: um botão por módulo, agrupados por assunto. */
export function AdminPage() {
  const { can } = useAuth();
  const sections = SECTIONS.map((s) => ({ ...s, tiles: s.tiles.filter((t) => can(t.permission)) })).filter(
    (s) => s.tiles.length > 0,
  );

  return (
    <div className="dash admin-page">
      <PageHeader
        icon={<GridIcon size={19} />}
        eyebrow="Administração"
        title="Central de Administração"
        subtitle="Configuração da loja, canais de venda e controle da conta - você vê os módulos que seu perfil de acesso libera."
      />

      {sections.map((section) => (
        <section className="admin-section" key={section.title}>
          <div className="admin-section-head">
            <h2>{section.title}</h2>
            <p>{section.hint}</p>
          </div>

          <div className="admin-grid">
            {section.tiles.map((tile) =>
              tile.to ? (
                <Link key={tile.label} to={tile.to} className="admin-tile">
                  <span className="admin-tile-icon">{tile.icon}</span>
                  <span className="admin-tile-text">
                    <strong>{tile.label}</strong>
                    <span>{tile.desc}</span>
                  </span>
                  <ChevronRightIcon size={16} className="admin-tile-go" />
                </Link>
              ) : (
                <button
                  key={tile.label}
                  type="button"
                  className="admin-tile soon"
                  disabled
                  title="Módulo em construção"
                >
                  <span className="admin-tile-icon">{tile.icon}</span>
                  <span className="admin-tile-text">
                    <strong>{tile.label}</strong>
                    <span>{tile.desc}</span>
                  </span>
                  <span className="admin-tile-soon">Em breve</span>
                </button>
              ),
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
