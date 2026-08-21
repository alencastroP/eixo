import { Link } from 'react-router-dom';
import { BrandLogo } from '../components/BrandMark';
import { LEGAL_DOC_LIST } from './LegalPage';

const WHATSAPP_NUMBER = '5584999033248';

function whatsappLink(message: string) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

const FEATURES = [
  {
    title: 'Atendimento e funil de vendas',
    body: 'Tickets, Kanban e conversas de WhatsApp num só lugar, com um número por atendente.',
  },
  {
    title: 'Estoque de veículos',
    body: 'Cadastro, fotos e ficha de cada carro, prontos para publicar na vitrine.',
  },
  {
    title: 'Vitrine pública',
    body: 'Site de anúncios da sua revenda, gerado automaticamente a partir do estoque.',
  },
  {
    title: 'Crédito e financeiro',
    body: 'Consulta de crédito do lead, fluxo de caixa e módulo fiscal integrados ao funil.',
  },
  {
    title: 'Co-Piloto de IA',
    body: 'Agente que responde leads sozinho, treinado com a base de conhecimento da sua loja.',
  },
  {
    title: 'Relatórios e auditoria',
    body: 'Indicadores de vendas e atendimento, com trilha de auditoria e controle de acesso por perfil.',
  },
];

interface PlanFeature {
  label: string;
  muted?: boolean;
}

interface Plan {
  name: string;
  tagline: string;
  price?: string;
  priceNote?: string;
  wasPrice?: string;
  customPrice?: string;
  customNote?: string;
  badge?: string;
  features: PlanFeature[];
  cta: { label: string; to?: string; whatsapp?: string };
  highlight?: boolean;
}

const PLANS: Plan[] = [
  {
    name: 'Starter',
    tagline: '1 revenda, time pequeno',
    price: 'R$ 197',
    priceNote: '/mês',
    features: [
      { label: 'Até 5 usuários inclusos' },
      { label: 'Até 100 veículos' },
      { label: 'Tickets + Kanban, Estoque' },
      { label: '1 portal de anúncio incluso' },
      { label: 'Sem IA de pré-venda (add-on)', muted: true },
    ],
    cta: { label: 'Falar no WhatsApp', whatsapp: 'Olá! Quero saber mais sobre o plano Starter do Eixo CRM.' },
  },
  {
    name: 'Pro',
    tagline: 'revenda em crescimento',
    price: 'R$ 399',
    priceNote: '/mês',
    wasPrice: 'R$ 299',
    badge: 'RECOMENDADO',
    highlight: true,
    features: [
      { label: 'Até 10 usuários inclusos' },
      { label: 'Até 500 veículos' },
      { label: 'Todos os módulos' },
      { label: '2 portais inclusos' },
      { label: 'IA de pré-venda: 300 tickets/mês inclusos' },
    ],
    cta: { label: 'Testar grátis', to: '/trial' },
  },
  {
    name: 'Business',
    tagline: 'multi-loja',
    price: 'R$ 999',
    priceNote: '/mês',
    wasPrice: 'R$ 799',
    features: [
      { label: 'Até 100 usuários inclusos' },
      { label: 'Até 5.000 veículos' },
      { label: 'Até 3 lojas inclusas' },
      { label: 'Todos os portais' },
      { label: 'IA de pré-venda: 1.500 tickets/mês inclusos' },
      { label: 'Suporte prioritário' },
    ],
    cta: { label: 'Testar grátis', to: '/trial' },
  },
  {
    name: 'Rede',
    tagline: 'grandes redes multi-loja',
    customPrice: 'sob consulta',
    customNote: 'a partir de R$ 2.500/mês',
    features: [
      { label: 'Usuários e lojas ilimitados' },
      { label: 'Cota de IA dimensionada' },
      { label: 'SLA e onboarding dedicados' },
      { label: 'Fatura consolidada por rede' },
    ],
    cta: { label: 'Falar no WhatsApp', whatsapp: 'Olá! Temos uma rede multi-loja e queria falar sobre o plano Rede do Eixo CRM.' },
  },
];

export function LandingPage() {
  return (
    <div className="landing-page">
      <header className="landing-header">
        <a href="#topo" className="landing-brand">
          <BrandLogo tone="onDark" size={26} />
        </a>
        <nav className="landing-nav">
          <a href="#produto">Produto</a>
          <a href="#precos">Preços</a>
          <a href="#contato">Contato</a>
        </nav>
        <div className="landing-header-actions">
          <Link to="/login" className="btn btn-ghost">
            Entrar
          </Link>
          <Link to="/trial" className="btn btn-primary">
            Teste grátis
          </Link>
        </div>
      </header>

      <section className="landing-hero" id="topo">
        <div className="landing-hero-glow" aria-hidden />
        <div className="landing-hero-inner">
          <span className="landing-eyebrow">CRM para revendas de veículos</span>
          <h1>A plataforma dos bons negócios sobre rodas.</h1>
          <p>
            Atendimento, estoque, crédito, financeiro e vitrine pública num só sistema - com um Co-Piloto de IA que
            responde seus leads enquanto você fecha negócio.
          </p>
          <div className="landing-hero-actions">
            <Link to="/trial" className="btn btn-primary btn-lg">
              🚀 Teste grátis de 15 dias
            </Link>
            <a
              href={whatsappLink('Olá! Vim pela página do Eixo CRM e queria saber mais.')}
              target="_blank"
              rel="noreferrer"
              className="btn btn-ghost btn-lg"
            >
              Falar no WhatsApp
            </a>
          </div>
          <p className="landing-hero-hint">Sem cartão de crédito para começar.</p>
        </div>
      </section>

      <section className="landing-section" id="produto">
        <div className="landing-section-head">
          <h2>Tudo que a sua revenda precisa, num só lugar</h2>
          <p>Do primeiro contato com o lead até a venda fechada e o financeiro em dia.</p>
        </div>
        <div className="landing-features-grid">
          {FEATURES.map((f) => (
            <div className="landing-feature-card" key={f.title}>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-section landing-section-muted" id="precos">
        <div className="landing-section-head">
          <h2>Preços</h2>
          <p>Escolha o plano do tamanho da sua operação. Comece grátis, sem compromisso.</p>
        </div>
        <div className="landing-pricing-grid">
          {PLANS.map((plan) => (
            <div className={`landing-price-card${plan.highlight ? ' highlight' : ''}`} key={plan.name}>
              {plan.badge && <span className="landing-price-badge">{plan.badge}</span>}
              <h3>{plan.name}</h3>
              <p className="landing-price-tagline">{plan.tagline}</p>
              {plan.price ? (
                <div className="landing-price-value">
                  <span className="landing-price-amount">{plan.price}</span>
                  <span className="landing-price-note">{plan.priceNote}</span>
                </div>
              ) : (
                <div className="landing-price-value">
                  <span className="landing-price-amount landing-price-amount-sm">{plan.customPrice}</span>
                </div>
              )}
              {plan.wasPrice && (
                <p className="landing-price-was">
                  hoje: <s>{plan.wasPrice}</s>
                </p>
              )}
              {plan.customNote && <p className="landing-price-was">{plan.customNote}</p>}
              {!plan.price && !plan.customNote && <p className="landing-price-was landing-price-was-muted">novo — não existe hoje</p>}
              <ul className="landing-price-features">
                {plan.features.map((f) => (
                  <li key={f.label} className={f.muted ? 'muted' : undefined}>
                    {f.label}
                  </li>
                ))}
              </ul>
              {plan.cta.to ? (
                <Link to={plan.cta.to} className={`btn btn-block ${plan.highlight ? 'btn-primary' : 'btn-ghost'}`}>
                  {plan.cta.label}
                </Link>
              ) : (
                <a
                  href={whatsappLink(plan.cta.whatsapp ?? '')}
                  target="_blank"
                  rel="noreferrer"
                  className={`btn btn-block ${plan.highlight ? 'btn-primary' : 'btn-ghost'}`}
                >
                  {plan.cta.label}
                </a>
              )}
            </div>
          ))}
        </div>
        <p className="landing-pricing-footnote">
          Precisa de mais usuários, veículos, portais ou números de WhatsApp do que o plano inclui? Fale com a gente
          no WhatsApp - a gente ajusta o valor pro tamanho da sua operação.
        </p>
      </section>

      <section className="landing-cta" id="contato">
        <h2>Ficou com alguma dúvida?</h2>
        <p>Fale direto com a gente no WhatsApp - respondemos rápido.</p>
        <a
          href={whatsappLink('Olá! Vim pela página do Eixo CRM e queria saber mais.')}
          target="_blank"
          rel="noreferrer"
          className="btn btn-primary btn-lg"
        >
          Falar no WhatsApp
        </a>
      </section>

      <footer className="landing-footer">
        <div className="landing-footer-brand">
          <BrandLogo tone="onDark" size={22} />
          <p>A plataforma dos bons negócios sobre rodas.</p>
        </div>
        <div className="landing-footer-col">
          <span className="landing-footer-heading">Produto</span>
          <a href="#produto">Funcionalidades</a>
          <a href="#precos">Preços</a>
          <Link to="/trial">Teste grátis</Link>
          <Link to="/login">Entrar</Link>
        </div>
        <div className="landing-footer-col">
          <span className="landing-footer-heading">Documentos legais</span>
          {LEGAL_DOC_LIST.map((doc) => (
            <Link key={doc.slug} to={`/legal/${doc.slug}`}>
              {doc.title}
            </Link>
          ))}
        </div>
        <div className="landing-footer-col">
          <span className="landing-footer-heading">Contato</span>
          <a href={whatsappLink('Olá! Vim pela página do Eixo CRM e queria saber mais.')} target="_blank" rel="noreferrer">
            WhatsApp: (84) 99903-3248
          </a>
        </div>
        <div className="landing-footer-bottom">
          <span>© {new Date().getFullYear()} Eixo</span>
          <span className="landing-footer-note">
            Documentos legais em fase de minuta, pendentes de revisão jurídica.
          </span>
        </div>
      </footer>
    </div>
  );
}
