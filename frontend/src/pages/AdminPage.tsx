import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { PageHeader } from '../components/PageHeader';
import {
  BotIcon,
  BuildingIcon,
  ChevronRightIcon,
  CreditCardIcon,
  GlobeIcon,
  GridIcon,
  HistoryIcon,
  PlugIcon,
  SparkIcon,
} from '../components/icons';

interface Tile {
  /** Ausente = módulo ainda não construído: o botão aparece, mas não navega. */
  to?: string;
  label: string;
  desc: string;
  icon: ReactNode;
}

interface Section {
  title: string;
  hint: string;
  tiles: Tile[];
}

/**
 * Tudo que era item solto no rail (vitrine, integrações, auditoria) e no menu
 * do usuário (empresa) passa por aqui. O rail volta a ser só operação diária.
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
      },
      {
        to: '/integrations',
        label: 'Integrações',
        desc: 'Conecte OLX, Webmotors e demais portais para centralizar leads e mensagens.',
        icon: <PlugIcon size={20} />,
      },
      {
        to: '/agent',
        label: 'Agente de IA',
        desc: 'Tom de voz, base de conhecimento da loja e o que acontece quando o cliente para de responder.',
        icon: <SparkIcon size={20} />,
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
      },
    ],
  },
  {
    title: 'Plataforma',
    hint: 'Em construção — os módulos abaixo abrem em breve.',
    tiles: [
      {
        label: 'Agente de IA',
        desc: 'Comportamento, tom de voz e limites do agente que atende seus clientes.',
        icon: <BotIcon size={20} />,
      },
      {
        label: 'Pagamentos',
        desc: 'Plano, forma de pagamento, faturas e acompanhamento do consumo da conta.',
        icon: <CreditCardIcon size={20} />,
      },
    ],
  },
];

/**
 * A própria central e tudo que mora dentro dela — o rail e a barra do celular
 * usam a lista para manter o alvo "Administração" aceso nas telas filhas.
 */
export const ADMIN_ROUTES: string[] = [
  '/admin',
  ...SECTIONS.flatMap((s) => s.tiles.map((t) => t.to).filter((to): to is string => Boolean(to))),
];

/** Central de administração: um botão por módulo, agrupados por assunto. */
export function AdminPage() {
  return (
    <div className="dash admin-page">
      <PageHeader
        icon={<GridIcon size={19} />}
        eyebrow="Administração"
        title="Central de Administração"
        subtitle="Configuração da loja, canais de venda e controle da conta — disponível apenas para administradores."
      />

      {SECTIONS.map((section) => (
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
