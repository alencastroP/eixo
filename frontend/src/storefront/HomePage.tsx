import { useEffect, useState, type FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { formatBRL } from '../utils/format';
import { BrandLogo, hasBrandMark } from './brandLogos';
import { LeadForm, SectionHead, VehicleCard, installmentOf, whatsappLink } from './components';
import { EMPTY_FILTERS, Inventory, type InventoryFilters } from './Inventory';
import { CarIcon, HighlightIcon, WhatsAppIcon } from './icons';
import { useSite } from './StorefrontLayout';

const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

export function HomePage() {
  const { site, slug } = useSite();
  const { brand, hero, highlights, contact, financing, sections } = site.store;
  const { facets, featured } = site;
  const location = useLocation();

  const [filters, setFilters] = useState<InventoryFilters>(EMPTY_FILTERS);
  const [search, setSearch] = useState('');

  // âncoras do menu (inclusive vindas de outra página: /loja/x#estoque)
  useEffect(() => {
    if (!location.hash) return;
    const timer = setTimeout(() => scrollTo(location.hash.slice(1)), 60);
    return () => clearTimeout(timer);
  }, [location]);

  const apply = (next: Partial<InventoryFilters>) => {
    setFilters({ ...EMPTY_FILTERS, ...next });
    setTimeout(() => scrollTo('estoque'), 40);
  };

  const submitSearch = (e: FormEvent) => {
    e.preventDefault();
    apply({ search });
  };

  return (
    <>
      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="sf-hero">
        <div className="sf-wrap">
          <div className="sf-hero-grid">
            <div className="sf-hero-copy">
              <span className="sf-eyebrow sf-eyebrow-accent">
                {hero.badges.length > 0 ? hero.badges.join(' · ') : 'Compra · Venda · Troca · Financiamento'}
              </span>
              <h1 className="sf-display">{hero.title}</h1>
              <p>{hero.subtitle}</p>
              <div className="sf-hero-actions">
                <button className="sf-btn sf-btn-accent" onClick={() => scrollTo('estoque')}>
                  {hero.ctaPrimary || 'Ver todo o estoque'}
                </button>
                {hero.ctaSecondary && (
                  <button className="sf-btn sf-btn-ghost-ink" onClick={() => scrollTo('vender')}>
                    {hero.ctaSecondary}
                  </button>
                )}
              </div>
            </div>

            <div
              className={`sf-hero-media ${hero.imageUrl ? '' : 'is-empty'}`}
              style={hero.imageUrl ? { backgroundImage: `url(${hero.imageUrl})` } : undefined}
            >
              {!hero.imageUrl && <span className="sf-placeholder">foto - vitrine da loja</span>}
            </div>
          </div>
        </div>

        <div className="sf-searchbar">
          <form className="sf-wrap" onSubmit={submitSearch}>
            <span className="sf-searchbar-label">Buscar</span>
            <div className="sf-searchbar-field">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Digite a marca ou modelo desejado"
                aria-label="Buscar veículo"
              />
              <span className="sf-searchbar-count">
                {facets.total} {facets.total === 1 ? 'veículo' : 'veículos'}
              </span>
            </div>
            <button className="sf-btn sf-btn-accent" type="submit">
              Buscar
            </button>
          </form>
        </div>
      </section>

      {/* ── Marcas ──────────────────────────────────────────────────────── */}
      {facets.brands.length > 0 && (
        <section className="sf-brands">
          <div className="sf-wrap">
            <div className="sf-brands-head">
              <div className="sf-eyebrow">Escolha a marca</div>
              <div className="sf-selected">
                {filters.brand ? `${filters.brand} selecionada` : 'Todas as marcas'}
              </div>
            </div>
            <div className="sf-brands-grid">
              <BrandCard
                label="Todas"
                count={facets.total}
                active={filters.brand === ''}
                onClick={() => apply({})}
              />
              {facets.brands.map((b) => (
                <BrandCard
                  key={b.name}
                  label={b.name}
                  count={b.count}
                  active={filters.brand === b.name}
                  onClick={() => apply({ brand: b.name })}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Estoque ─────────────────────────────────────────────────────── */}
      {sections.inventory && (
        <section className="sf-stock sf-section" id="estoque">
          <SectionHead eyebrow="Últimas novidades" title="Estoque disponível" />
          <Inventory
            slug={slug}
            facets={facets}
            whatsapp={contact.whatsapp}
            storeName={brand.name}
            financing={financing}
            filters={filters}
            onChange={setFilters}
          />
          <div className="sf-stock-more">
            <button className="sf-btn sf-btn-outline" onClick={() => apply({})}>
              Ver todo o nosso estoque
            </button>
          </div>
        </section>
      )}

      {/* ── Destaques ───────────────────────────────────────────────────── */}
      {sections.featured && featured.length > 0 && (
        <section className="sf-stock sf-section">
          <SectionHead eyebrow="Selecionados" title="Destaques da semana" />
          <div className="sf-grid" style={{ marginTop: 34 }}>
            {featured.map((v) => (
              <VehicleCard
                key={v.id}
                vehicle={v}
                slug={slug}
                whatsapp={contact.whatsapp}
                storeName={brand.name}
                financing={financing}
                showInstallment={false}
                favorite={false}
                onToggleFavorite={() => undefined}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Diferenciais ────────────────────────────────────────────────── */}
      {sections.highlights && highlights.length > 0 && (
        <div className="sf-highlights">
          {highlights.map((item) => (
            <article key={item.title} className="sf-highlight">
              <span className="sf-highlight-icon">
                <HighlightIcon name={item.icon} size={24} />
              </span>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      )}

      {/* ── Venda seu veículo + financiamento ───────────────────────────── */}
      {(sections.sell || sections.financing) && (
        <section className="sf-inkblock sf-section" id="vender">
          <div className="sf-inkblock-inner">
            <div className="sf-inkblock-copy">
              <span className="sf-eyebrow sf-eyebrow-accent">Venda seu veículo</span>
              <h2 className="sf-h2">Vender, ou usar seu carro como entrada.</h2>
              <p>
                Mande os dados do veículo pelo WhatsApp ou pelo formulário. A avaliação é feita na loja
                {contact.address ? `, na ${contact.address}` : ''}, e você recebe a proposta com o valor da troca.
              </p>
              {contact.whatsapp && (
                <a
                  className="sf-btn sf-btn-accent"
                  href={whatsappLink(contact.whatsapp, `Olá, ${brand.name}! Quero avaliar meu veículo.`)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <WhatsAppIcon size={16} />
                  Enviar meu veículo
                </a>
              )}
              <div style={{ marginTop: 28 }}>
                <LeadForm
                  slug={slug}
                  origin="sell"
                  submitLabel="Quero uma avaliação"
                  messageLabel="Sobre o seu veículo"
                  messagePlaceholder="Marca, modelo, ano, km e estado geral"
                />
              </div>
            </div>

            <div className="sf-steps" id="financiamento">
              <div className="sf-step">
                <span className="sf-step-num">01</span>
                <div>
                  <h3 className="sf-h3">Você manda os dados</h3>
                  <p>Modelo, ano, quilometragem e fotos.</p>
                </div>
              </div>
              <div className="sf-step">
                <span className="sf-step-num">02</span>
                <div>
                  <h3 className="sf-h3">Avaliação na loja</h3>
                  <p>Vistoria do veículo e conferência da documentação.</p>
                </div>
              </div>
              <div className="sf-step">
                <span className="sf-step-num">03</span>
                <div>
                  <h3 className="sf-h3">Proposta e financiamento</h3>
                  <p>Compra direta ou troca com o saldo financiado.</p>
                </div>
              </div>
              {sections.financing && <Simulator />}
            </div>
          </div>
        </section>
      )}

    </>
  );
}

/** Cartão de marca com emblema desenhado (ou monograma, quando não houver). */
function BrandCard({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`sf-brand-card ${active ? 'is-active' : ''} ${count === 0 ? 'is-empty' : ''}`}
      onClick={onClick}
      disabled={count === 0}
    >
      <span className="sf-brand-emblem">
        {label === 'Todas' ? (
          <CarIcon size={28} />
        ) : hasBrandMark(label) ? (
          <BrandLogo brand={label} size={30} />
        ) : (
          <span className="sf-brand-emblem-text">{label.slice(0, 6).toUpperCase()}</span>
        )}
      </span>
      <span className="sf-brand-foot">
        <span className="sf-brand-name">{label}</span>
        <span className="sf-brand-count">{String(count).padStart(2, '0')}</span>
      </span>
      <span className="sf-brand-bar" />
    </button>
  );
}

/** Simulação de parcela com os parâmetros que a loja configurou no CRM. */
function Simulator() {
  const { site, slug } = useSite();
  const { financing, brand } = site.store;
  const { facets } = site;

  const [price, setPrice] = useState(Math.round((facets.priceMin ?? 60000) / 1000) * 1000);
  const [downPercent, setDownPercent] = useState(financing.downPercent);
  const [months, setMonths] = useState(financing.months);

  const down = Math.round((price * downPercent) / 100);
  const installment = installmentOf(price, { ...financing, downPercent, months });

  return (
    <div className="sf-sim">
      <span className="sf-eyebrow sf-eyebrow-accent">Simule sua parcela</span>
      <label>
        <span className="sf-sim-label">Valor do veículo: {formatBRL(price)}</span>
        <input
          className="sf-range"
          type="range"
          min={20000}
          max={Math.max(60000, Math.round(facets.priceMax ?? 200000))}
          step={1000}
          value={price}
          onChange={(e) => setPrice(Number(e.target.value))}
        />
      </label>
      <div className="sf-sim-row">
        <label>
          <span className="sf-sim-label">
            Entrada: {formatBRL(down)} ({downPercent}%)
          </span>
          <input
            className="sf-range"
            type="range"
            min={0}
            max={80}
            step={5}
            value={downPercent}
            onChange={(e) => setDownPercent(Number(e.target.value))}
          />
        </label>
        <label>
          <span className="sf-sim-label">Parcelas</span>
          <select value={months} onChange={(e) => setMonths(Number(e.target.value))}>
            {[12, 24, 36, 48, 60].map((m) => (
              <option key={m} value={m}>
                {m}x
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="sf-sim-out">
        <span>Parcela estimada</span>
        <strong>{formatBRL(installment ?? 0)}</strong>
        <span>
          {months}x · financiando {formatBRL(price - down)} · {financing.monthlyRate.toFixed(2)}% a.m.
        </span>
      </div>

      <div className="sf-sim-cta">
        <p className="sf-note">
          Simulação aproximada. O valor final depende da análise de crédito e das condições do banco.
        </p>
        <LeadForm
          slug={slug}
          origin="financing"
          submitLabel="Quero uma proposta real"
          messageLabel="Observações"
          defaultMessage={`Quero financiar cerca de ${formatBRL(price - down)} em ${months}x. (${brand.name})`}
        />
      </div>
    </div>
  );
}
