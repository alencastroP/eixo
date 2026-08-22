import { useEffect } from 'react';
import type { MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { BrandLogo } from '../components/BrandMark';
import { LEGAL_DOC_LIST } from './LegalPage';

const WHATSAPP_NUMBER = '5584999033248';

function whatsappLink(message: string) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

function scrollToId(e: MouseEvent<HTMLAnchorElement>, id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  e.preventDefault();
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

const TRUST_PILLS = ['Sem fidelidade', 'Sem carência', 'Cancele quando quiser', 'Sem cartão pra começar'];

const FEATURES = [
  {
    icon: '🎯',
    title: 'Gerenciamento de leads',
    body: 'Funil visual em Kanban, arraste e solte entre etapas - sua equipe entende em cinco minutos, sem treinamento.',
  },
  {
    icon: '💬',
    title: 'Plataforma de atendimento',
    body: 'Tickets e WhatsApp num só painel, com um número por atendente e histórico completo da conversa.',
  },
  {
    icon: '📢',
    title: 'Integrador de anúncios',
    body: 'OLX, Webmotors e Mercado Livre conectados: os leads caem direto no funil, sem copiar e colar nada.',
  },
  {
    icon: '🚗',
    title: 'Estoque de veículos',
    body: 'Cadastro, fotos e ficha de cada carro em poucos cliques, prontos para publicar na vitrine.',
  },
  {
    icon: '🛒',
    title: 'Site da loja com pré-venda',
    body: 'Vitrine pública com o estoque sempre atualizado e um chat de pré-venda que tira dúvida na hora.',
  },
  {
    icon: '🤖',
    title: 'Co-Piloto de IA',
    body: 'Responde leads sozinho, 24 horas por dia, treinado com a base de conhecimento da sua loja.',
  },
  {
    icon: '💳',
    title: 'Crédito e financeiro',
    body: 'Consulta de crédito do lead, fluxo de caixa e módulo fiscal integrados ao mesmo painel.',
  },
  {
    icon: '📊',
    title: 'Relatórios e auditoria',
    body: 'Indicadores de vendas e atendimento em tempo real, com trilha de auditoria por perfil de acesso.',
  },
];

const HERO_KANBAN: { title: string; count: number; cards: { name: string; car: string; source: string; state?: 'active' | 'done' }[] }[] = [
  {
    title: 'Novo lead',
    count: 6,
    cards: [
      { name: 'Marcos Duarte', car: 'Corolla XEi 2022', source: 'OLX' },
      { name: 'Renata Alves', car: 'HB20 2021', source: 'WhatsApp' },
    ],
  },
  {
    title: 'Em negociação',
    count: 3,
    cards: [
      { name: 'João Pedro', car: 'Onix 2023', source: 'Site', state: 'active' },
      { name: 'Camila Reis', car: 'Compass 2020', source: 'Mercado Livre' },
    ],
  },
  {
    title: 'Fechado',
    count: 2,
    cards: [{ name: 'Diego Nunes', car: 'Civic 2019', source: 'Webmotors', state: 'done' }],
  },
];

const INBOX_THREADS = [
  { name: 'Marcos Duarte', preview: 'Esse Corolla ainda tá disponível?', time: '09:41', unread: true },
  { name: 'Renata Alves', preview: 'Consigo financiar em 48x?', time: '09:22' },
  { name: 'João Pedro', preview: 'Obrigado, vou pensar!', time: 'ontem' },
];

const INBOX_MESSAGES: { from: 'lead' | 'ai'; text: string }[] = [
  { from: 'lead', text: 'Oi! Esse Corolla XEi 2022 ainda está disponível?' },
  { from: 'ai', text: 'Sim, tá disponível! 32 mil km, revisado. Quer uma simulação de financiamento? 🙂' },
  { from: 'lead', text: 'Quero sim, pode mandar!' },
];

const STORE_VEHICLES = [
  { name: 'Corolla XEi 2022', price: 'R$ 129.900', km: '32.000 km', badge: 'Destaque' },
  { name: 'HB20 Vision 2021', price: 'R$ 74.900', km: '41.500 km' },
  { name: 'Compass Longitude 2020', price: 'R$ 118.500', km: '58.200 km' },
  { name: 'Civic Touring 2019', price: 'R$ 109.900', km: '62.000 km' },
];

const REPORT_BARS = [42, 64, 50, 80, 58, 96, 72];
const REPORT_KPIS = [
  { label: 'Leads no mês', value: '482' },
  { label: 'Resposta da IA', value: '96%' },
  { label: 'Ticket médio', value: 'R$ 92k' },
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
  oldPrice?: string;
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
    price: 'R$ 299',
    priceNote: '/mês',
    oldPrice: 'R$ 399',
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
    price: 'R$ 799',
    priceNote: '/mês',
    oldPrice: 'R$ 999',
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
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('.landing-reveal'));
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion || !('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('is-visible'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -10% 0px' },
    );
    els.forEach((el) => io.observe(el));
    // Safety net: never leave content permanently invisible if the observer misbehaves.
    const fallback = window.setTimeout(() => els.forEach((el) => el.classList.add('is-visible')), 4000);
    return () => {
      io.disconnect();
      window.clearTimeout(fallback);
    };
  }, []);

  return (
    <div className="landing-page">
      <header className="landing-header">
        <a href="#topo" className="landing-brand" onClick={(e) => scrollToId(e, 'topo')}>
          <BrandLogo tone="onDark" size={26} />
        </a>
        <nav className="landing-nav">
          <a href="#produto" onClick={(e) => scrollToId(e, 'produto')}>
            Produto
          </a>
          <a href="#vitrine" onClick={(e) => scrollToId(e, 'vitrine')}>
            Vitrine
          </a>
          <a href="#precos" onClick={(e) => scrollToId(e, 'precos')}>
            Preços
          </a>
          <a href="#contato" onClick={(e) => scrollToId(e, 'contato')}>
            Contato
          </a>
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
        <div className="landing-hero-grid">
          <div className="landing-hero-inner">
            <span className="landing-eyebrow">CRM completo para revendas de veículos</span>
            <h1>
              Sua revenda rodando <span className="landing-text-accent">num só sistema</span>, sem complicação.
            </h1>
            <p>
              Leads, atendimento, estoque, vitrine e financeiro num painel só - simples de usar desde o primeiro
              dia, com um Co-Piloto de IA que responde seus clientes por você.
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
            <ul className="landing-trust-list">
              {TRUST_PILLS.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>

          <div className="landing-hero-visual landing-reveal">
            <div className="landing-mock">
              <div className="landing-mock-bar">
                <span className="landing-mock-dot" />
                <span className="landing-mock-dot" />
                <span className="landing-mock-dot" />
                <span className="landing-mock-url">app.eixocrm.com/kanban</span>
              </div>
              <div className="landing-mock-body landing-mock-kanban">
                {HERO_KANBAN.map((col) => (
                  <div className="landing-mock-col" key={col.title}>
                    <div className="landing-mock-col-head">
                      <span>{col.title}</span>
                      <span className="landing-mock-count">{col.count}</span>
                    </div>
                    {col.cards.map((c) => (
                      <div className={`landing-mock-card${c.state ? ` ${c.state}` : ''}`} key={c.name}>
                        <span className="landing-mock-avatar">{c.name.charAt(0)}</span>
                        <div className="landing-mock-card-info">
                          <strong>{c.name}</strong>
                          <span>{c.car}</span>
                        </div>
                        <span className="landing-mock-tag">{c.source}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <span className="landing-float landing-float-1">🤖 IA respondeu 12 leads hoje</span>
            <span className="landing-float landing-float-2">📈 +38% conversão</span>
          </div>
        </div>
      </section>

      <section className="landing-section" id="produto">
        <div className="landing-section-head landing-reveal">
          <h2>Tudo que a sua revenda precisa, num só lugar</h2>
          <p>Sem curva de aprendizado: sua equipe começa a usar no primeiro dia, do lead ao pós-venda.</p>
        </div>
        <div className="landing-features-grid">
          {FEATURES.map((f, i) => (
            <div
              className="landing-feature-card landing-reveal"
              key={f.title}
              style={{ transitionDelay: `${(i % 4) * 70}ms` }}
            >
              <span className="landing-feature-icon" aria-hidden>
                {f.icon}
              </span>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-section landing-section-muted" id="vitrine">
        <div className="landing-section-head landing-reveal">
          <h2>Atendimento e vitrine, lado a lado</h2>
          <p>O mesmo estoque que alimenta seu funil vira site de vendas - com a IA cuidando do pré-venda.</p>
        </div>
        <div className="landing-showcase-grid">
          <div className="landing-mock landing-reveal">
            <div className="landing-mock-bar">
              <span className="landing-mock-dot" />
              <span className="landing-mock-dot" />
              <span className="landing-mock-dot" />
              <span className="landing-mock-url">app.eixocrm.com/inbox</span>
            </div>
            <div className="landing-mock-body landing-mock-inbox">
              <div className="landing-mock-inbox-list">
                {INBOX_THREADS.map((t) => (
                  <div className={`landing-mock-thread${t.unread ? ' unread' : ''}`} key={t.name}>
                    <span className="landing-mock-avatar">{t.name.charAt(0)}</span>
                    <div className="landing-mock-thread-info">
                      <strong>{t.name}</strong>
                      <span>{t.preview}</span>
                    </div>
                    <span className="landing-mock-thread-time">{t.time}</span>
                  </div>
                ))}
              </div>
              <div className="landing-mock-chat">
                {INBOX_MESSAGES.map((m, i) => (
                  <span className={`landing-mock-bubble ${m.from}`} key={i}>
                    {m.text}
                  </span>
                ))}
              </div>
            </div>
            <span className="landing-mock-caption">Plataforma de atendimento omnichannel</span>
          </div>

          <div className="landing-mock landing-reveal">
            <div className="landing-mock-bar">
              <span className="landing-mock-dot" />
              <span className="landing-mock-dot" />
              <span className="landing-mock-dot" />
              <span className="landing-mock-url">minhaloja.eixocrm.com</span>
            </div>
            <div className="landing-mock-body landing-mock-store">
              {STORE_VEHICLES.map((v) => (
                <div className="landing-mock-store-card" key={v.name}>
                  {v.badge && <span className="landing-mock-store-badge">{v.badge}</span>}
                  <div className="landing-mock-store-photo" aria-hidden />
                  <strong>{v.name}</strong>
                  <span className="landing-mock-store-price">{v.price}</span>
                  <span className="landing-mock-store-km">{v.km}</span>
                </div>
              ))}
              <div className="landing-mock-store-chat">
                <span className="landing-mock-bubble lead">Esse Corolla ainda tá disponível?</span>
                <span className="landing-mock-bubble ai">Tá sim! Posso te mandar mais fotos 📸</span>
              </div>
            </div>
            <span className="landing-mock-caption">Site da loja com estoque e pré-venda por IA</span>
          </div>

          <div className="landing-mock landing-reveal">
            <div className="landing-mock-bar">
              <span className="landing-mock-dot" />
              <span className="landing-mock-dot" />
              <span className="landing-mock-dot" />
              <span className="landing-mock-url">app.eixocrm.com/relatorios</span>
            </div>
            <div className="landing-mock-body landing-mock-report">
              <div className="landing-mock-report-kpis">
                {REPORT_KPIS.map((k) => (
                  <div className="landing-mock-kpi" key={k.label}>
                    <strong>{k.value}</strong>
                    <span>{k.label}</span>
                  </div>
                ))}
              </div>
              <div className="landing-mock-report-chart">
                {REPORT_BARS.map((h, i) => (
                  <span key={i} style={{ height: `${h}%` }} />
                ))}
              </div>
            </div>
            <span className="landing-mock-caption">Relatórios com dados que fazem sentido pro seu negócio</span>
          </div>
        </div>
      </section>

      <section className="landing-section landing-section-muted" id="precos">
        <div className="landing-section-head landing-reveal">
          <h2>Preços</h2>
          <p>Escolha o plano do tamanho da sua operação. Comece grátis, sem compromisso.</p>
        </div>
        <ul className="landing-trust-list landing-trust-list-center landing-reveal">
          {TRUST_PILLS.slice(0, 3).map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <div className="landing-pricing-grid">
          {PLANS.map((plan, i) => (
            <div
              className={`landing-price-card landing-reveal${plan.highlight ? ' highlight' : ''}`}
              key={plan.name}
              style={{ transitionDelay: `${i * 70}ms` }}
            >
              {plan.badge && <span className="landing-price-badge">{plan.badge}</span>}
              <h3>{plan.name}</h3>
              <p className="landing-price-tagline">{plan.tagline}</p>
              {plan.oldPrice && (
                <p className="landing-price-was-old">
                  de <s>{plan.oldPrice}</s>
                </p>
              )}
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
          <a href="#vitrine">Vitrine e atendimento</a>
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
