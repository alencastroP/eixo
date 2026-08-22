import { Link } from 'react-router-dom';
import { LeadForm } from './components';
import { ArrowLeftIcon, SparkIcon } from './icons';
import { useSite } from './StorefrontLayout';

/**
 * "Quem somos": página própria da vitrine (não mais uma seção dentro da home),
 * para o texto que a loja escreve sobre si e os dados de localização/contato -
 * o mesmo conteúdo do toggle "Sobre a loja e localização" no CRM.
 */
export function AboutPage() {
  const { site, slug, openChat } = useSite();
  const { about, contact, sections } = site.store;

  if (!sections.about) {
    return (
      <div className="sf-state">
        <h1 className="sf-h2">Página indisponível</h1>
        <p className="sf-lead">Esta loja ainda não habilitou esta página.</p>
        <Link className="sf-btn sf-btn-ink" to={`/loja/${slug}`}>
          Voltar à loja
        </Link>
      </div>
    );
  }

  return (
    <div className="sf-detail">
      <Link className="sf-back" to={`/loja/${slug}`}>
        <ArrowLeftIcon size={15} />
        Voltar
      </Link>

      <div className="sf-split">
        <div>
          <span className="sf-eyebrow">Quem somos</span>
          <h1 className="sf-h2" style={{ margin: '12px 0 18px' }}>
            {about.title}
          </h1>
          {about.text ? (
            <p className="sf-prose" style={{ fontSize: 17 }}>
              {about.text}
            </p>
          ) : (
            <p className="sf-lead">A loja ainda não escreveu esse texto.</p>
          )}

          <dl className="sf-datasheet" style={{ marginTop: 34, maxWidth: 520 }}>
            <div>
              <dt>Onde estamos</dt>
              <dd>{contact.address || '-'}</dd>
            </div>
            {(contact.city || contact.state) && (
              <div>
                <dt>Cidade</dt>
                <dd>{[contact.city, contact.state].filter(Boolean).join(' - ')}</dd>
              </div>
            )}
            <div>
              <dt>Atendimento</dt>
              <dd>{contact.hours || '-'}</dd>
            </div>
            <div>
              <dt>Contato</dt>
              <dd>{contact.phone || contact.email || '-'}</dd>
            </div>
          </dl>
          {contact.mapUrl && (
            <a
              className="sf-info-link"
              href={contact.mapUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ marginTop: 16, display: 'inline-block' }}
            >
              Como chegar →
            </a>
          )}
        </div>

        <div className="sf-panel">
          <h3 className="sf-h3" style={{ marginBottom: 6 }}>
            Fale com a gente
          </h3>
          <p className="sf-note" style={{ marginBottom: 18 }}>
            Respondemos em horário comercial. Prefere agora? Use o atendente virtual.
          </p>
          <LeadForm slug={slug} origin="contact" submitLabel="Enviar mensagem" messagePlaceholder="Como podemos ajudar?" />
          <button className="sf-btn sf-btn-outline sf-btn-block" style={{ marginTop: 12 }} onClick={() => openChat()}>
            <SparkIcon size={15} />
            Atendimento imediato
          </button>
        </div>
      </div>
    </div>
  );
}
