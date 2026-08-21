import { useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { formatBRL } from '../utils/format';
import { SiteError, siteApi } from './api';
import { CameraIcon, CheckIcon, HeartIcon, WhatsAppIcon } from './icons';
import type { SiteVehicle, StorefrontFinancing } from './types';

export const formatKm = (km: number) => `${new Intl.NumberFormat('pt-BR').format(km)} km`;

export const vehicleTitle = (v: { brand: string; model: string }) => `${v.brand} ${v.model}`;

/** Câmbio não é campo do estoque - vem do texto da versão, como o lojista cadastra. */
export const gearboxOf = (version: string | null) => (/autom/i.test(version ?? '') ? 'Automático' : 'Manual');

/** Selo do card: tração, ano recente ou preço de entrada - nessa ordem. */
export function vehicleTag(v: SiteVehicle): { label: string; accent: boolean } | null {
  if (/4x4/i.test(v.version ?? '')) return { label: '4x4', accent: false };
  if (v.featured) return { label: 'Destaque', accent: true };
  if (v.yearModel >= new Date().getFullYear() - 2) return { label: 'Semi-novo', accent: false };
  return null;
}

/** Parcela estimada pelo sistema Price, com os parâmetros configurados pela loja. */
export function installmentOf(price: number | null, financing: StorefrontFinancing): number | null {
  if (!price) return null;
  const financed = price * (1 - financing.downPercent / 100);
  const rate = financing.monthlyRate / 100;
  if (financed <= 0 || rate <= 0) return null;
  return (financed * rate) / (1 - (1 + rate) ** -financing.months);
}

/** Link de conversa já com a mensagem pronta - o visitante só aperta enviar. */
export function whatsappLink(whatsapp: string, message: string): string {
  return `https://wa.me/${whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
}

export function vehicleWhatsAppMessage(v: SiteVehicle, storeName: string): string {
  const price = formatBRL(v.price);
  return (
    `Olá, ${storeName}! Tenho interesse no ${vehicleTitle(v)} ${v.yearFabrication}/${v.yearModel}` +
    `${price ? ` (${price})` : ''} que vi no site.`
  );
}

export function SectionHead({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <div className="sf-stock-head">
      <div>
        <span className="sf-eyebrow">{eyebrow}</span>
        <h2 className="sf-h2">{title}</h2>
      </div>
      {children && <div className="sf-stock-tools">{children}</div>}
    </div>
  );
}

export function VehicleCard({
  vehicle,
  slug,
  whatsapp,
  storeName,
  financing,
  showInstallment,
  favorite,
  onToggleFavorite,
}: {
  vehicle: SiteVehicle;
  slug: string;
  whatsapp: string;
  storeName: string;
  financing: StorefrontFinancing;
  showInstallment: boolean;
  favorite: boolean;
  onToggleFavorite: () => void;
}) {
  const to = `/loja/${slug}/veiculo/${vehicle.id}`;
  const tag = vehicleTag(vehicle);
  const installment = installmentOf(vehicle.price, financing);

  return (
    <article className="sf-card">
      <Link to={to} className={`sf-card-media ${vehicle.coverUrl ? '' : 'is-empty'}`} aria-label={vehicleTitle(vehicle)}>
        {vehicle.coverUrl ? (
          <img src={vehicle.coverUrl} alt={vehicleTitle(vehicle)} loading="lazy" />
        ) : (
          <span className="sf-card-placeholder">foto em breve</span>
        )}
        {tag && <span className={`sf-tag ${tag.accent ? 'sf-tag-accent' : ''}`}>{tag.label}</span>}
        {vehicle.reserved && <span className="sf-tag sf-tag-accent" style={{ left: 'auto', right: 52 }}>Reservado</span>}
        {vehicle.photoCount > 1 && (
          <span className="sf-photo-count">
            <CameraIcon size={12} />
            {vehicle.photoCount}
          </span>
        )}
      </Link>

      <button
        className={`sf-fav ${favorite ? 'is-on' : ''}`}
        onClick={onToggleFavorite}
        title={favorite ? 'Remover dos salvos' : 'Salvar veículo'}
        aria-pressed={favorite}
      >
        <HeartIcon size={16} filled={favorite} />
      </button>

      <div className="sf-card-body">
        <div className="sf-card-brand">{vehicle.brand}</div>
        <h3 className="sf-card-title">
          <Link to={to}>{vehicle.model}</Link>
        </h3>
        <p className="sf-card-version">{vehicle.version ?? '-'}</p>

        <dl className="sf-specs">
          <div className="sf-spec">
            <dt>Ano</dt>
            <dd>
              {vehicle.yearFabrication}/{vehicle.yearModel}
            </dd>
          </div>
          <div className="sf-spec">
            <dt>KM</dt>
            <dd>{new Intl.NumberFormat('pt-BR').format(vehicle.km)}</dd>
          </div>
          <div className="sf-spec">
            <dt>Câmbio</dt>
            <dd>{gearboxOf(vehicle.version)}</dd>
          </div>
        </dl>
      </div>

      <div className="sf-card-foot">
        <div className="sf-price">
          <small>R$</small>
          <strong>{formatBRL(vehicle.price)?.replace('R$', '').trim() ?? 'Consulte'}</strong>
        </div>
        {showInstallment && installment && (
          <div className="sf-parcela">
            {financing.months}x de {formatBRL(installment)}
            <br />
            <span>
              simulação · entrada {financing.downPercent}% · {financing.monthlyRate.toFixed(2)}% a.m.
            </span>
          </div>
        )}
        <div className="sf-card-actions">
          <Link className="sf-btn sf-btn-ink sf-btn-sm" to={to}>
            Ver ficha
          </Link>
          {whatsapp && (
            <a
              className="sf-btn sf-btn-outline sf-btn-sm"
              href={whatsappLink(whatsapp, vehicleWhatsAppMessage(vehicle, storeName))}
              target="_blank"
              rel="noopener noreferrer"
            >
              <WhatsAppIcon size={14} />
              WhatsApp
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

/**
 * Formulário de contato do site. Todo envio vira lead → ticket no CRM, com a
 * origem registrada na mensagem. O campo `website` é o honeypot: fica fora da
 * tela e só um robô o preenche.
 */
export function LeadForm({
  slug,
  origin,
  vehicleId,
  submitLabel = 'Enviar',
  messageLabel = 'Mensagem',
  messagePlaceholder,
  defaultMessage = '',
  note,
}: {
  slug: string;
  origin: 'vehicle' | 'financing' | 'sell' | 'contact';
  vehicleId?: string;
  submitLabel?: string;
  messageLabel?: string;
  messagePlaceholder?: string;
  defaultMessage?: string;
  note?: string;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState(defaultMessage);
  const [website, setWebsite] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      await siteApi.lead(slug, { name, phone, email: email || undefined, message, vehicleId, origin, website });
      setSent(true);
      setName('');
      setPhone('');
      setEmail('');
      setMessage(defaultMessage);
    } catch (err) {
      setError(err instanceof SiteError ? err.message : 'Não foi possível enviar. Tente pelo WhatsApp.');
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <div className="sf-alert sf-alert-ok" role="status">
        Recebemos seu contato! Nossa equipe responde em instantes.
      </div>
    );
  }

  return (
    <form className="sf-form" onSubmit={submit}>
      <div className="sf-form-row">
        <label>
          <span>Seu nome *</span>
          <input className="sf-field" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
        </label>
        <label>
          <span>WhatsApp *</span>
          <input
            className="sf-field"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            inputMode="tel"
            placeholder="(00) 00000-0000"
          />
        </label>
      </div>
      <label>
        <span>E-mail</span>
        <input className="sf-field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label>
        <span>{messageLabel}</span>
        <textarea
          className="sf-field"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={messagePlaceholder}
          maxLength={1000}
        />
      </label>

      <div className="sf-hp" aria-hidden="true">
        <label>
          Não preencha este campo
          <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </label>
      </div>

      {error && <div className="sf-alert sf-alert-error">{error}</div>}

      <button className="sf-btn sf-btn-ink sf-btn-block" type="submit" disabled={sending}>
        {sending ? 'Enviando…' : submitLabel}
        {!sending && <CheckIcon size={15} />}
      </button>
      {note && <p className="sf-note">{note}</p>}
    </form>
  );
}
