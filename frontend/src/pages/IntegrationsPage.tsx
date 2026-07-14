import { useEffect, useState } from 'react';
import { integrationsApi } from '../api/endpoints';
import { IntegrationStatusBadge } from '../components/badges';
import { IntegrationModal } from '../components/IntegrationModal';
import { PlatformLogo } from '../components/PlatformLogo';
import { ArrowUpIcon, CheckIcon, PlugIcon } from '../components/icons';
import { PageHeader } from '../components/PageHeader';
import type { Integration, IntegrationDetail } from '../types';

export function IntegrationsPage() {
  const [items, setItems] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Integration | null>(null);

  const load = () => {
    setLoading(true);
    integrationsApi
      .list()
      .then((list) => {
        // OLX em destaque primeiro, depois conectadas, depois o resto
        const order = (i: Integration) =>
          i.platform === 'olx' ? 0 : i.status === 'CONNECTED' ? 1 : i.status === 'AUTH_ERROR' ? 2 : 3;
        setItems([...list].sort((a, b) => order(a) - order(b)));
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Falha ao carregar integrações'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const onChanged = (detail: IntegrationDetail) => {
    setItems((prev) => prev.map((i) => (i.platform === detail.platform ? { ...i, ...detail } : i)));
    setOpen((cur) => (cur && cur.platform === detail.platform ? { ...cur, ...detail } : cur));
  };

  const ctaLabel = (i: Integration) => {
    if (i.status === 'CONNECTED' || i.status === 'DISABLED') return 'Gerenciar';
    if (i.status === 'AUTH_ERROR') return 'Corrigir conexão';
    return 'Conectar Conta';
  };
  const isActive = (i: Integration) => i.status === 'CONNECTED' || i.status === 'DISABLED';

  return (
    <div className="dash integ-page">
      <PageHeader
        icon={<PlugIcon size={19} />}
        eyebrow="Administração"
        title="Integrações"
        subtitle="Conecte plataformas de anúncios para centralizar leads e mensagens no seu atendimento."
      />

      {error && <div className="alert alert-error">{error}</div>}

      <div className="integ-grid">
        {items.map((i) => (
          <div
            key={i.platform}
            className={`integ-card ${isActive(i) ? 'active' : ''} ${i.platform === 'olx' ? 'featured' : ''} ${
              i.status === 'AUTH_ERROR' ? 'error' : ''
            }`}
          >
            {i.platform === 'olx' && <span className="featured-tag">Recomendado</span>}
            <div className="integ-card-top">
              <PlatformLogo platform={i.platform} />
              <IntegrationStatusBadge status={i.status} />
            </div>
            <h3 className="integ-card-title">{i.displayName}</h3>
            <p className="integ-card-desc">{i.description}</p>

            <div className="integ-card-tags">
              <span className="cap-tag">
                <CheckIcon size={12} /> Recepção de leads
              </span>
              {i.supportsOutbound && (
                <span className="cap-tag">
                  <ArrowUpIcon size={12} /> Resposta bidirecional
                </span>
              )}
            </div>

            {i.accountLabel && isActive(i) && (
              <div className="integ-card-account">
                <CheckIcon size={13} /> {i.accountLabel}
              </div>
            )}

            <button
              className={`btn btn-block ${i.status === 'AVAILABLE' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setOpen(i)}
            >
              {ctaLabel(i)}
            </button>
          </div>
        ))}

        {loading && items.length === 0 && (
          <div className="integ-empty">
            <PlugIcon size={26} /> Carregando integrações…
          </div>
        )}
      </div>

      {open && <IntegrationModal integration={open} onClose={() => setOpen(null)} onChanged={onChanged} />}
    </div>
  );
}
