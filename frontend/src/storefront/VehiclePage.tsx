import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { formatBRL } from '../utils/format';
import { SiteError, siteApi } from './api';
import {
  LeadForm,
  formatKm,
  gearboxOf,
  installmentOf,
  vehicleTitle,
  vehicleWhatsAppMessage,
  whatsappLink,
} from './components';
import { ArrowLeftIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, SparkIcon, WhatsAppIcon } from './icons';
import { useSite } from './StorefrontLayout';
import type { SiteVehicleDetail } from './types';

export function VehiclePage() {
  const { site, slug, openChat } = useSite();
  const { id } = useParams();
  const { brand, contact, financing } = site.store;

  const [vehicle, setVehicle] = useState<SiteVehicleDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [photoIndex, setPhotoIndex] = useState(0);

  useEffect(() => {
    let active = true;
    setVehicle(null);
    setError(null);
    setPhotoIndex(0);
    window.scrollTo({ top: 0 });
    siteApi
      .vehicle(slug, id ?? '')
      .then((data) => active && setVehicle(data))
      .catch((err) =>
        active &&
        setError(
          err instanceof SiteError && err.status === 404
            ? 'Este veículo não está mais disponível.'
            : 'Não foi possível carregar o veículo.',
        ),
      );
    return () => {
      active = false;
    };
  }, [slug, id]);

  if (error) {
    return (
      <div className="sf-state">
        <h1 className="sf-h2">Veículo indisponível</h1>
        <p className="sf-lead">{error}</p>
        <Link className="sf-btn sf-btn-ink" to={`/loja/${slug}#estoque`}>
          Ver estoque
        </Link>
      </div>
    );
  }
  if (!vehicle) {
    return (
      <div className="sf-state">
        <p className="sf-lead">Carregando…</p>
      </div>
    );
  }

  const title = vehicleTitle(vehicle);
  const photos = vehicle.photos;
  const current = photos[photoIndex];
  const step = (delta: number) => setPhotoIndex((i) => (i + delta + photos.length) % photos.length);
  const installment = installmentOf(vehicle.price, financing);

  return (
    <div className="sf-detail">
      <Link className="sf-back" to={`/loja/${slug}#estoque`}>
        <ArrowLeftIcon size={15} />
        Voltar ao estoque
      </Link>

      <div className="sf-detail-grid">
        <div>
          <div className={`sf-gallery ${current ? '' : 'is-empty'}`}>
            {current ? (
              <img src={current.url} alt={title} />
            ) : (
              <span className="sf-card-placeholder">foto em breve — peça pelo WhatsApp</span>
            )}
            {vehicle.reserved && <span className="sf-tag sf-tag-accent">Reservado</span>}
            {photos.length > 1 && (
              <>
                <button className="sf-gallery-nav prev" onClick={() => step(-1)} aria-label="Foto anterior">
                  <ChevronLeftIcon size={18} />
                </button>
                <button className="sf-gallery-nav next" onClick={() => step(1)} aria-label="Próxima foto">
                  <ChevronRightIcon size={18} />
                </button>
              </>
            )}
          </div>

          {photos.length > 1 && (
            <div className="sf-thumbs">
              {photos.map((photo, index) => (
                <button
                  key={photo.id}
                  className={`sf-thumb ${index === photoIndex ? 'is-on' : ''}`}
                  onClick={() => setPhotoIndex(index)}
                  aria-label={`Foto ${index + 1}`}
                >
                  <img src={photo.url} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          )}

          <div style={{ marginTop: 34, display: 'grid', gap: 30 }}>
            <div>
              <span className="sf-eyebrow">Ficha técnica</span>
              <dl className="sf-datasheet" style={{ marginTop: 14 }}>
                <div>
                  <dt>Ano</dt>
                  <dd>
                    {vehicle.yearFabrication}/{vehicle.yearModel}
                  </dd>
                </div>
                <div>
                  <dt>Quilometragem</dt>
                  <dd>{formatKm(vehicle.km)}</dd>
                </div>
                <div>
                  <dt>Câmbio</dt>
                  <dd>{gearboxOf(vehicle.version)}</dd>
                </div>
                {vehicle.fuel && (
                  <div>
                    <dt>Combustível</dt>
                    <dd>{vehicle.fuel}</dd>
                  </div>
                )}
                {vehicle.color && (
                  <div>
                    <dt>Cor</dt>
                    <dd>{vehicle.color}</dd>
                  </div>
                )}
              </dl>
            </div>

            {vehicle.optionals.length > 0 && (
              <div>
                <span className="sf-eyebrow">Itens e opcionais</span>
                <ul className="sf-optionals" style={{ marginTop: 14 }}>
                  {vehicle.optionals.map((item) => (
                    <li key={item}>
                      <CheckIcon size={13} />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {vehicle.description && (
              <div>
                <span className="sf-eyebrow">Sobre este veículo</span>
                <p className="sf-prose" style={{ marginTop: 14 }}>
                  {vehicle.description}
                </p>
              </div>
            )}
          </div>
        </div>

        <aside className="sf-detail-aside">
          <div className="sf-panel" style={{ display: 'grid', gap: 16 }}>
            <div>
              <div className="sf-card-brand">{vehicle.brand}</div>
              <h1 className="sf-h2" style={{ fontSize: 30, margin: '6px 0 8px' }}>
                {vehicle.model}
              </h1>
              <p className="sf-note">{vehicle.version}</p>
            </div>

            <div>
              <span className="sf-eyebrow">Valor</span>
              <div className="sf-detail-price">{formatBRL(vehicle.price) ?? 'Consulte'}</div>
              {installment && (
                <p className="sf-parcela">
                  ou {financing.months}x de {formatBRL(installment)}
                  <br />
                  <span>
                    simulação · entrada {financing.downPercent}% · {financing.monthlyRate.toFixed(2)}% a.m.
                  </span>
                </p>
              )}
            </div>

            {contact.whatsapp && (
              <a
                className="sf-btn sf-btn-accent sf-btn-block"
                href={whatsappLink(contact.whatsapp, vehicleWhatsAppMessage(vehicle, brand.name))}
                target="_blank"
                rel="noopener noreferrer"
              >
                <WhatsAppIcon size={16} />
                Falar sobre este veículo
              </a>
            )}
            <button className="sf-btn sf-btn-ink sf-btn-block" onClick={() => openChat(vehicle.id)}>
              <SparkIcon size={15} />
              Tirar dúvidas agora
            </button>
            {contact.phone && (
              <a className="sf-btn sf-btn-outline sf-btn-block" href={`tel:${contact.phone.replace(/\D/g, '')}`}>
                {contact.phone}
              </a>
            )}
          </div>

          <div className="sf-panel">
            <h3 className="sf-h3" style={{ marginBottom: 6 }}>
              Tenho interesse
            </h3>
            <p className="sf-note" style={{ marginBottom: 16 }}>
              Deixe seu contato que a gente responde com as condições e agenda o test-drive.
            </p>
            <LeadForm
              slug={slug}
              origin="vehicle"
              vehicleId={vehicle.id}
              submitLabel="Quero mais informações"
              defaultMessage={`Tenho interesse no ${title} ${vehicle.yearFabrication}/${vehicle.yearModel}.`}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
