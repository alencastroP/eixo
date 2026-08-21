import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/client';
import { storefrontApi } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { PageHeader } from '../components/PageHeader';
import { ExternalIcon } from '../components/icons';
import { HIGHLIGHT_ICON_KEYS } from '../storefront/icons';
import { storefrontUrl } from '../storefront/resolveSlug';
import type { StorefrontConfig } from '../storefront/types';
import type { StorefrontSettings } from '../types';

type Tab = 'identidade' | 'hero' | 'conteudo' | 'contato' | 'secoes' | 'publicacao';

const TABS: { key: Tab; label: string }[] = [
  { key: 'identidade', label: 'Identidade' },
  { key: 'hero', label: 'Destaque inicial' },
  { key: 'conteudo', label: 'Conteúdo' },
  { key: 'contato', label: 'Contato' },
  { key: 'secoes', label: 'Seções' },
  { key: 'publicacao', label: 'Publicação' },
];

const SECTION_LABELS: Record<keyof StorefrontConfig['sections'], string> = {
  featured: 'Destaques da semana',
  inventory: 'Estoque completo',
  highlights: 'Diferenciais da loja',
  financing: 'Simulador de financiamento',
  sell: 'Venda seu veículo',
  about: 'Sobre a loja e localização',
  contact: 'Contato',
};

/** Lê o arquivo escolhido como data URL - mesmo caminho usado nas fotos do estoque. */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem'));
    reader.readAsDataURL(file);
  });
}

export function StorefrontConfigPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const [data, setData] = useState<StorefrontSettings | null>(null);
  const [config, setConfig] = useState<StorefrontConfig | null>(null);
  const [slug, setSlug] = useState('');
  const [tab, setTab] = useState<Tab>('identidade');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const logoInput = useRef<HTMLInputElement>(null);
  const heroInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    storefrontApi
      .get()
      .then((d) => {
        setData(d);
        setConfig(d.config);
        setSlug(d.slug);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Falha ao carregar a vitrine'));
  }, []);

  if (error && !config) return <div className="page-loading">{error}</div>;
  if (!config || !data) return <div className="page-loading">Carregando…</div>;

  /** Atualiza um grupo da configuração (brand, hero, contact…) sem perder o resto. */
  const patch = <K extends keyof StorefrontConfig>(key: K, value: Partial<StorefrontConfig[K]>) => {
    setOk(false);
    setConfig((c) => (c ? { ...c, [key]: { ...(c[key] as object), ...value } } : c));
  };

  const save = async (extra?: { published?: boolean }) => {
    setSaving(true);
    setError(null);
    setOk(false);
    try {
      const saved = await storefrontApi.save({ slug, config, ...extra });
      setData(saved);
      setConfig(saved.config);
      setSlug(saved.slug);
      setOk(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const upload = async (kind: 'logo' | 'hero', file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      const { url } = await storefrontApi.uploadImage(kind, await readAsDataUrl(file));
      if (kind === 'logo') patch('brand', { logoUrl: url });
      else patch('hero', { imageUrl: url });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao enviar a imagem');
    }
  };

  const publicUrl = storefrontUrl(data.slug);

  return (
    <div className="dash settings-page">
      <PageHeader
        back={{ to: '/admin', label: 'Voltar à Administração' }}
        eyebrow="Administração · Vitrine"
        title="Site da loja"
        subtitle="A landing page pública que reflete o seu estoque em tempo real."
        actions={
          <a className="btn btn-ghost" href={`/loja/${data.slug}`} target="_blank" rel="noopener noreferrer">
            <ExternalIcon size={15} />
            Ver vitrine
          </a>
        }
      />

      <div className="tab-nav">
        {TABS.map((t) => (
          <button key={t.key} className={`tab-btn ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="settings-card">

        {tab === 'identidade' && (
          <div className="settings-section">
            <h3>Identidade visual</h3>
            <div className="field-row">
              <label className="field">
                <span>Nome exibido no site</span>
                <input
                  value={config.brand.name}
                  onChange={(e) => patch('brand', { name: e.target.value })}
                  disabled={!isAdmin}
                />
              </label>
              <label className="field">
                <span>Frase curta (abaixo do nome)</span>
                <input
                  value={config.brand.tagline}
                  onChange={(e) => patch('brand', { tagline: e.target.value })}
                  disabled={!isAdmin}
                />
              </label>
            </div>

            <div className="field-row">
              <label className="field">
                <span>Cor principal</span>
                <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <input
                    type="color"
                    value={config.brand.primary}
                    onChange={(e) => patch('brand', { primary: e.target.value })}
                    disabled={!isAdmin}
                    style={{ width: 52, height: 38, padding: 2 }}
                  />
                  <input
                    value={config.brand.primary}
                    onChange={(e) => patch('brand', { primary: e.target.value })}
                    disabled={!isAdmin}
                  />
                </span>
              </label>
              <label className="field">
                <span>Tema</span>
                <select
                  value={config.brand.theme}
                  onChange={(e) => patch('brand', { theme: e.target.value as 'dark' | 'light' })}
                  disabled={!isAdmin}
                >
                  <option value="light">Claro (recomendado)</option>
                  <option value="dark">Escuro</option>
                </select>
              </label>
            </div>

            <div className="field">
              <span>Logo</span>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                {config.brand.logoUrl && (
                  <img
                    src={config.brand.logoUrl}
                    alt="Logo da loja"
                    style={{ height: 48, borderRadius: 8, background: 'var(--surface-2)', padding: 4 }}
                  />
                )}
                <input
                  ref={logoInput}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => void upload('logo', e.target.files?.[0])}
                />
                <button className="btn btn-ghost" onClick={() => logoInput.current?.click()} disabled={!isAdmin}>
                  {config.brand.logoUrl ? 'Trocar logo' : 'Enviar logo'}
                </button>
                {config.brand.logoUrl && (
                  <button className="btn btn-ghost" onClick={() => patch('brand', { logoUrl: null })} disabled={!isAdmin}>
                    Remover
                  </button>
                )}
              </div>
              <p className="muted small">Sem logo, o site usa as iniciais da loja em um selo na cor principal.</p>
            </div>
          </div>
        )}

        {tab === 'hero' && (
          <div className="settings-section">
            <h3>Primeira dobra</h3>
            <label className="field">
              <span>Título</span>
              <input value={config.hero.title} onChange={(e) => patch('hero', { title: e.target.value })} disabled={!isAdmin} />
            </label>
            <label className="field">
              <span>Subtítulo</span>
              <textarea
                rows={2}
                value={config.hero.subtitle}
                onChange={(e) => patch('hero', { subtitle: e.target.value })}
                disabled={!isAdmin}
              />
            </label>
            <div className="field-row">
              <label className="field">
                <span>Botão principal</span>
                <input
                  value={config.hero.ctaPrimary}
                  onChange={(e) => patch('hero', { ctaPrimary: e.target.value })}
                  disabled={!isAdmin}
                />
              </label>
              <label className="field">
                <span>Botão secundário</span>
                <input
                  value={config.hero.ctaSecondary}
                  onChange={(e) => patch('hero', { ctaSecondary: e.target.value })}
                  disabled={!isAdmin}
                />
              </label>
            </div>
            <label className="field">
              <span>Selos (um por linha, até 4)</span>
              <textarea
                rows={4}
                value={config.hero.badges.join('\n')}
                onChange={(e) =>
                  patch('hero', { badges: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 4) })
                }
                disabled={!isAdmin}
              />
            </label>
            <div className="field">
              <span>Imagem de fundo</span>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                {config.hero.imageUrl && (
                  <img
                    src={config.hero.imageUrl}
                    alt="Fundo do destaque"
                    style={{ height: 64, borderRadius: 8, objectFit: 'cover' }}
                  />
                )}
                <input
                  ref={heroInput}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => void upload('hero', e.target.files?.[0])}
                />
                <button className="btn btn-ghost" onClick={() => heroInput.current?.click()} disabled={!isAdmin}>
                  {config.hero.imageUrl ? 'Trocar imagem' : 'Enviar imagem'}
                </button>
                {config.hero.imageUrl && (
                  <button className="btn btn-ghost" onClick={() => patch('hero', { imageUrl: null })} disabled={!isAdmin}>
                    Remover
                  </button>
                )}
              </div>
              <p className="muted small">
                Uma foto ampla do pátio ou de um carro em destaque funciona melhor. Sem imagem, o site usa um fundo
                gerado na cor da loja.
              </p>
            </div>
          </div>
        )}

        {tab === 'conteudo' && (
          <div className="settings-section">
            <h3>Sobre a loja</h3>
            <label className="field">
              <span>Título da seção</span>
              <input value={config.about.title} onChange={(e) => patch('about', { title: e.target.value })} disabled={!isAdmin} />
            </label>
            <label className="field">
              <span>Texto</span>
              <textarea
                rows={6}
                value={config.about.text}
                onChange={(e) => patch('about', { text: e.target.value })}
                disabled={!isAdmin}
              />
            </label>

            <h3 style={{ marginTop: 24 }}>Diferenciais</h3>
            <p className="muted small">Até 6 cartões. Deixe título e texto vazios para remover um.</p>
            {config.highlights.map((item, index) => (
              <div className="field-row" key={index}>
                <label className="field" style={{ maxWidth: 150 }}>
                  <span>Ícone</span>
                  <select
                    value={item.icon}
                    onChange={(e) => {
                      const next = [...config.highlights];
                      next[index] = { ...item, icon: e.target.value };
                      setConfig({ ...config, highlights: next });
                    }}
                    disabled={!isAdmin}
                  >
                    {HIGHLIGHT_ICON_KEYS.map((key) => (
                      <option key={key} value={key}>
                        {key}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Título</span>
                  <input
                    value={item.title}
                    onChange={(e) => {
                      const next = [...config.highlights];
                      next[index] = { ...item, title: e.target.value };
                      setConfig({ ...config, highlights: next });
                    }}
                    disabled={!isAdmin}
                  />
                </label>
                <label className="field" style={{ flex: 2 }}>
                  <span>Texto</span>
                  <input
                    value={item.text}
                    onChange={(e) => {
                      const next = [...config.highlights];
                      next[index] = { ...item, text: e.target.value };
                      setConfig({ ...config, highlights: next });
                    }}
                    disabled={!isAdmin}
                  />
                </label>
              </div>
            ))}
            {isAdmin && config.highlights.length < 6 && (
              <button
                className="btn btn-ghost"
                onClick={() =>
                  setConfig({ ...config, highlights: [...config.highlights, { icon: 'star', title: '', text: '' }] })
                }
              >
                Adicionar diferencial
              </button>
            )}

            <h3 style={{ marginTop: 24 }}>Simulação de financiamento</h3>
            <p className="muted small">
              Usada na parcela estimada dos cards e no simulador da vitrine. É referência comercial - a proposta real
              sai da análise do banco.
            </p>
            <div className="field-row">
              <label className="field">
                <span>Entrada padrão (%)</span>
                <input
                  type="number"
                  min={0}
                  max={90}
                  value={config.financing.downPercent}
                  onChange={(e) => patch('financing', { downPercent: Number(e.target.value) })}
                  disabled={!isAdmin}
                />
              </label>
              <label className="field">
                <span>Prazo padrão (meses)</span>
                <input
                  type="number"
                  min={6}
                  max={72}
                  value={config.financing.months}
                  onChange={(e) => patch('financing', { months: Number(e.target.value) })}
                  disabled={!isAdmin}
                />
              </label>
              <label className="field">
                <span>Taxa de referência (% a.m.)</span>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  max={10}
                  value={config.financing.monthlyRate}
                  onChange={(e) => patch('financing', { monthlyRate: Number(e.target.value) })}
                  disabled={!isAdmin}
                />
              </label>
            </div>

            <h3 style={{ marginTop: 24 }}>Busca no Google</h3>
            <label className="field">
              <span>Título da página</span>
              <input value={config.seo.title} onChange={(e) => patch('seo', { title: e.target.value })} disabled={!isAdmin} />
            </label>
            <label className="field">
              <span>Descrição</span>
              <textarea
                rows={2}
                value={config.seo.description}
                onChange={(e) => patch('seo', { description: e.target.value })}
                disabled={!isAdmin}
              />
            </label>
          </div>
        )}

        {tab === 'contato' && (
          <div className="settings-section">
            <h3>Como o cliente fala com você</h3>
            <div className="field-row">
              <label className="field">
                <span>Telefone exibido</span>
                <input
                  value={config.contact.phone}
                  onChange={(e) => patch('contact', { phone: e.target.value })}
                  placeholder="(84) 98801-3786"
                  disabled={!isAdmin}
                />
              </label>
              <label className="field">
                <span>WhatsApp (só números, com DDI)</span>
                <input
                  value={config.contact.whatsapp}
                  onChange={(e) => patch('contact', { whatsapp: e.target.value.replace(/\D/g, '') })}
                  placeholder="5584988013786"
                  disabled={!isAdmin}
                />
              </label>
            </div>
            <label className="field">
              <span>E-mail</span>
              <input
                type="email"
                value={config.contact.email}
                onChange={(e) => patch('contact', { email: e.target.value })}
                disabled={!isAdmin}
              />
            </label>
            <label className="field">
              <span>Endereço</span>
              <input
                value={config.contact.address}
                onChange={(e) => patch('contact', { address: e.target.value })}
                disabled={!isAdmin}
              />
            </label>
            <div className="field-row">
              <label className="field">
                <span>Cidade</span>
                <input
                  value={config.contact.city}
                  onChange={(e) => patch('contact', { city: e.target.value })}
                  disabled={!isAdmin}
                />
              </label>
              <label className="field">
                <span>UF</span>
                <input
                  value={config.contact.state}
                  maxLength={2}
                  onChange={(e) => patch('contact', { state: e.target.value.toUpperCase() })}
                  disabled={!isAdmin}
                />
              </label>
            </div>
            <label className="field">
              <span>Horário de atendimento</span>
              <input
                value={config.contact.hours}
                onChange={(e) => patch('contact', { hours: e.target.value })}
                disabled={!isAdmin}
              />
            </label>
            <label className="field">
              <span>Link "como chegar" (Google Maps)</span>
              <input
                value={config.contact.mapUrl}
                onChange={(e) => patch('contact', { mapUrl: e.target.value })}
                disabled={!isAdmin}
              />
            </label>
            <div className="field-row">
              <label className="field">
                <span>Instagram (URL)</span>
                <input
                  value={config.contact.instagram}
                  onChange={(e) => patch('contact', { instagram: e.target.value })}
                  disabled={!isAdmin}
                />
              </label>
              <label className="field">
                <span>Facebook (URL)</span>
                <input
                  value={config.contact.facebook}
                  onChange={(e) => patch('contact', { facebook: e.target.value })}
                  disabled={!isAdmin}
                />
              </label>
            </div>
          </div>
        )}

        {tab === 'secoes' && (
          <div className="settings-section">
            <h3>O que aparece no site</h3>
            <div className="field-toggles">
              {(Object.keys(SECTION_LABELS) as (keyof StorefrontConfig['sections'])[]).map((key) => (
                <div key={key} className={`field-toggle ${config.sections[key] ? 'on' : ''}`}>
                  <div className="field-toggle-main">
                    <span className="field-toggle-label">{SECTION_LABELS[key]}</span>
                    <button
                      type="button"
                      className={`switch ${config.sections[key] ? 'on blue' : ''}`}
                      onClick={() => patch('sections', { [key]: !config.sections[key] } as never)}
                      role="switch"
                      aria-checked={config.sections[key]}
                      disabled={!isAdmin}
                    >
                      <span className="switch-knob" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'publicacao' && (
          <div className="settings-section">
            <h3>Endereço e publicação</h3>
            <label className="field">
              <span>Endereço da vitrine</span>
              <input
                value={slug}
                onChange={(e) => {
                  setOk(false);
                  setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'));
                }}
                disabled={!isAdmin}
              />
              <p className="muted small">
                Site publicado em <strong>{publicUrl}</strong>
              </p>
            </label>

            <div className={`field-toggle ${data.published ? 'on' : ''}`} style={{ maxWidth: 460 }}>
              <div className="field-toggle-main">
                <span className="field-toggle-label">
                  {data.published ? 'Vitrine publicada' : 'Vitrine despublicada'}
                </span>
                <button
                  type="button"
                  className={`switch ${data.published ? 'on blue' : ''}`}
                  onClick={() => void save({ published: !data.published })}
                  role="switch"
                  aria-checked={data.published}
                  disabled={!isAdmin || saving}
                >
                  <span className="switch-knob" />
                </button>
              </div>
            </div>
            <p className="muted small">
              Despublicada, a vitrine responde como inexistente para qualquer visitante - o estoque continua intacto no
              CRM. Só veículos com status <strong>Disponível</strong> ou <strong>Reservado</strong> e marcados como
              "exibir na vitrine" aparecem no site.
            </p>
          </div>
        )}

        {error && <div className="alert alert-error">{error}</div>}
        {ok && <div className="alert alert-success">Vitrine atualizada.</div>}

        {isAdmin ? (
          <div className="settings-footer">
            <button className="btn btn-primary" onClick={() => void save()} disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar alterações'}
            </button>
          </div>
        ) : (
          <p className="muted small">Apenas administradores podem editar a vitrine.</p>
        )}
      </div>
    </div>
  );
}
