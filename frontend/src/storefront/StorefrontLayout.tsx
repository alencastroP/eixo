import { useEffect, useState } from 'react';
import { Link, Outlet, useOutletContext, useParams } from 'react-router-dom';
import { SiteError, siteApi } from './api';
import { AiChatWidget } from './AiChatWidget';
import { CloseIcon, FacebookIcon, InstagramIcon, MenuIcon } from './icons';
import { slugFromHostname } from './resolveSlug';
import type { SitePayload } from './types';
import './storefront.css';

/**
 * Casca da vitrine: resolve a loja, aplica a identidade visual e desenha barra
 * superior, cabeçalho e rodapé. As páginas (home e detalhe do veículo) entram
 * pelo <Outlet> e recebem os dados já carregados via contexto — uma requisição
 * só, mesmo navegando entre elas.
 */

export interface SiteContext {
  site: SitePayload;
  slug: string;
  openChat: (vehicleId?: string) => void;
}

export const useSite = () => useOutletContext<SiteContext>();

const NAV = [
  { hash: 'estoque', label: 'Estoque' },
  { hash: 'vender', label: 'Venda seu veículo' },
  { hash: 'financiamento', label: 'Financiamento' },
  { hash: 'quem-somos', label: 'Quem somos' },
  { hash: 'contato', label: 'Contato' },
];

/** Archivo + JetBrains Mono só quando a vitrine está na tela (o CRM não usa). */
function useStorefrontFonts() {
  useEffect(() => {
    const links = [
      Object.assign(document.createElement('link'), { rel: 'preconnect', href: 'https://fonts.googleapis.com' }),
      Object.assign(document.createElement('link'), {
        rel: 'preconnect',
        href: 'https://fonts.gstatic.com',
        crossOrigin: 'anonymous',
      }),
      Object.assign(document.createElement('link'), {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap',
      }),
    ];
    links.forEach((l) => document.head.appendChild(l));
    return () => links.forEach((l) => l.remove());
  }, []);
}

export function StorefrontLayout() {
  const params = useParams();
  const slug = params.slug ?? slugFromHostname() ?? '';

  const [site, setSite] = useState<SitePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [chat, setChat] = useState<{ open: boolean; vehicleId?: string }>({ open: false });

  useStorefrontFonts();

  useEffect(() => {
    let active = true;
    setSite(null);
    setError(null);
    siteApi
      .site(slug)
      .then((data) => active && setSite(data))
      .catch((err) =>
        active &&
        setError(
          err instanceof SiteError && err.status === 404
            ? 'Esta loja ainda não publicou sua vitrine.'
            : 'Não foi possível carregar a loja. Tente novamente em instantes.',
        ),
      );
    return () => {
      active = false;
    };
  }, [slug]);

  const theme = site?.store.brand.theme ?? 'light';
  useEffect(() => {
    if (!site) return;
    const { seo, brand } = site.store;
    const previousTitle = document.title;
    document.title = seo.title || `${brand.name} — Seminovos`;

    const meta = document.querySelector<HTMLMetaElement>('meta[name="description"]') ?? document.createElement('meta');
    meta.name = 'description';
    if (seo.description) {
      meta.content = seo.description;
      if (!meta.parentNode) document.head.appendChild(meta);
    }

    document.body.dataset.sfActive = theme;
    return () => {
      document.title = previousTitle;
      delete document.body.dataset.sfActive;
    };
  }, [site, theme]);

  if (error) {
    return (
      <div className="sf">
        <div className="sf-state">
          <h1 className="sf-h2">Vitrine indisponível</h1>
          <p className="sf-lead">{error}</p>
        </div>
      </div>
    );
  }
  if (!site) {
    return (
      <div className="sf">
        <div className="sf-state">
          <p className="sf-lead">Carregando…</p>
        </div>
      </div>
    );
  }

  const { brand, contact } = site.store;
  const home = `/loja/${slug}`;
  const phoneDigits = contact.phone.replace(/\D/g, '');
  const cityLine = [contact.city, contact.state].filter(Boolean).join(' — ');

  const Logo = () => (
    <>
      {brand.logoUrl ? (
        <img src={brand.logoUrl} alt={brand.name} />
      ) : (
        <span className="sf-logo-mark">{monogram(brand.name)}</span>
      )}
      <span className="sf-logo-text">
        <span className="sf-logo-name">{firstWord(brand.name)}</span>
        <span className="sf-logo-sub">{restWords(brand.name) || brand.tagline}</span>
      </span>
    </>
  );

  return (
    <div
      className="sf"
      data-sf-theme={theme}
      style={{ '--sf-accent': brand.primary, '--sf-on-accent': onAccent(brand.primary) } as React.CSSProperties}
    >
      {(contact.hours || cityLine) && (
        <div className="sf-topbar">
          <div className="sf-wrap">
            <span>{contact.hours}</span>
            {cityLine && <strong>{cityLine}</strong>}
          </div>
        </div>
      )}

      <header className="sf-header">
        <div className="sf-wrap">
          <Link to={home} className="sf-logo">
            <Logo />
          </Link>

          <nav className="sf-nav">
            {NAV.map((item) => (
              <Link key={item.hash} to={`${home}#${item.hash}`}>
                {item.label}
              </Link>
            ))}
            {contact.phone && (
              <a className="sf-phone" href={`tel:${phoneDigits}`}>
                <span className="sf-phone-dot" />
                {contact.phone}
              </a>
            )}
          </nav>

          <button
            className="sf-burger"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <CloseIcon size={18} /> : <MenuIcon size={18} />}
          </button>
        </div>
      </header>

      <div className={`sf-mobile-nav ${menuOpen ? 'is-open' : ''}`}>
        {NAV.map((item) => (
          <Link key={item.hash} to={`${home}#${item.hash}`} onClick={() => setMenuOpen(false)}>
            {item.label}
          </Link>
        ))}
        {contact.phone && <a href={`tel:${phoneDigits}`}>{contact.phone}</a>}
      </div>

      <main>
        <Outlet
          context={
            { site, slug, openChat: (vehicleId?: string) => setChat({ open: true, vehicleId }) } satisfies SiteContext
          }
        />
      </main>

      <footer className="sf-footer" id="contato">
        <div className="sf-wrap sf-footer-grid">
          <div>
            <div className="sf-logo" style={{ marginBottom: 20 }}>
              <Logo />
            </div>
            <p className="sf-footer-about">
              {site.store.about.text
                ? `${site.store.about.text.slice(0, 150)}${site.store.about.text.length > 150 ? '…' : ''}`
                : `Compra, venda, troca e financiamento de veículos${cityLine ? ` em ${cityLine}` : ''}.`}
            </p>
            {(contact.instagram || contact.facebook) && (
              <div className="sf-social">
                {contact.instagram && (
                  <a href={contact.instagram} target="_blank" rel="noopener noreferrer" aria-label="Instagram">
                    <InstagramIcon />
                  </a>
                )}
                {contact.facebook && (
                  <a href={contact.facebook} target="_blank" rel="noopener noreferrer" aria-label="Facebook">
                    <FacebookIcon />
                  </a>
                )}
              </div>
            )}
          </div>

          <div>
            <h4>Mapa do site</h4>
            <div className="sf-footer-links">
              {NAV.map((item) => (
                <Link key={item.hash} to={`${home}#${item.hash}`}>
                  {item.label}
                </Link>
              ))}
            </div>
          </div>

          <div>
            <h4>Contato</h4>
            <div className="sf-footer-links">
              {contact.phone && <a href={`tel:${phoneDigits}`}>{contact.phone}</a>}
              {contact.email && <a href={`mailto:${contact.email}`}>{contact.email}</a>}
              {contact.address && <span>{contact.address}</span>}
              {cityLine && <span>{cityLine}</span>}
            </div>
          </div>
        </div>

        <div className="sf-footer-bottom">
          <div className="sf-wrap">
            <span>
              © {new Date().getFullYear()} {brand.name}
            </span>
            <span>Valores e parcelas sujeitos a alteração sem aviso prévio.</span>
          </div>
        </div>
      </footer>

      <AiChatWidget
        slug={slug}
        storeName={brand.name}
        whatsapp={contact.whatsapp}
        logoUrl={brand.logoUrl}
        vehicleId={chat.vehicleId}
        open={chat.open}
        onOpenChange={(next) => setChat((c) => ({ open: next, vehicleId: next ? c.vehicleId : undefined }))}
      />
    </div>
  );
}

const firstWord = (name: string) => name.trim().split(/\s+/)[0] ?? name;
const restWords = (name: string) => name.trim().split(/\s+/).slice(1).join(' ');

function monogram(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return ((parts[0][0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : '')).toUpperCase();
}

/**
 * Preto ou branco sobre a cor da loja, pela luminância relativa (WCAG) —
 * garante contraste legível em botões independentemente da cor escolhida.
 */
function onAccent(hex: string): string {
  const value = hex.replace('#', '');
  if (value.length !== 6) return '#101013';
  const channel = (start: number) => {
    const c = parseInt(value.slice(start, start + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
  return luminance > 0.45 ? '#101013' : '#ffffff';
}
