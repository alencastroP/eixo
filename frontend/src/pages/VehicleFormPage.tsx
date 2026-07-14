import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { vehiclesApi, type VehiclePayload } from '../api/endpoints';
import { ApiError } from '../api/client';
import { PhotoGallery } from '../components/PhotoGallery';
import { SearchDataIcon, SparklesIcon, TrashIcon } from '../components/icons';
import { AiDescriptionModal } from '../components/AiDescriptionModal';
import { PageHeader } from '../components/PageHeader';
import {
  FUEL_OPTIONS,
  OPTIONAL_ITEMS,
  VEHICLE_STATUS_LABELS,
  VEHICLE_STATUS_ORDER,
  VEHICLE_TYPE_LABELS,
  type VehicleDetail,
  type VehicleStatus,
  type VehicleType,
} from '../types';
import { formatBRL } from '../utils/format';

const TYPES: VehicleType[] = ['CAR', 'MOTORCYCLE', 'HEAVY'];

type FormState = {
  type: VehicleType;
  brand: string;
  model: string;
  version: string;
  yearFabrication: string;
  yearModel: string;
  color: string;
  fuel: string;
  km: string;
  plate: string;
  chassi: string;
  renavam: string;
  fipePrice: string;
  costPrice: string;
  salePrice: string;
  status: VehicleStatus;
  optionals: string[];
  notes: string;
  description: string;
};

const EMPTY: FormState = {
  type: 'CAR',
  brand: '',
  model: '',
  version: '',
  yearFabrication: '',
  yearModel: '',
  color: '',
  fuel: '',
  km: '',
  plate: '',
  chassi: '',
  renavam: '',
  fipePrice: '',
  costPrice: '',
  salePrice: '',
  status: 'PREPARING',
  optionals: [],
  notes: '',
  description: '',
};

function fromDetail(v: VehicleDetail): FormState {
  return {
    type: v.type,
    brand: v.brand,
    model: v.model,
    version: v.version ?? '',
    yearFabrication: String(v.yearFabrication),
    yearModel: String(v.yearModel),
    color: v.color ?? '',
    fuel: v.fuel ?? '',
    km: String(v.km),
    plate: v.plate ?? '',
    chassi: v.chassi ?? '',
    renavam: v.renavam ?? '',
    fipePrice: v.fipePrice != null ? String(v.fipePrice) : '',
    costPrice: v.costPrice != null ? String(v.costPrice) : '',
    salePrice: v.salePrice != null ? String(v.salePrice) : '',
    status: v.status,
    optionals: v.optionals,
    notes: v.notes ?? '',
    description: v.description ?? '',
  };
}

const num = (s: string): number | null => {
  const n = Number(s);
  return s.trim() !== '' && Number.isFinite(n) ? n : null;
};

export function VehicleFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [detail, setDetail] = useState<VehicleDetail | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plateLoading, setPlateLoading] = useState(false);
  const [plateMsg, setPlateMsg] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    vehiclesApi
      .get(id)
      .then((v) => {
        setDetail(v);
        setForm(fromDetail(v));
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Falha ao carregar veículo'))
      .finally(() => setLoading(false));
  }, [id]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const toggleOptional = (item: string) =>
    setForm((f) => ({
      ...f,
      optionals: f.optionals.includes(item) ? f.optionals.filter((o) => o !== item) : [...f.optionals, item],
    }));

  // margem estimada em tempo real: venda − custo − gastos acumulados (se editando)
  const margin = useMemo(() => {
    const sale = num(form.salePrice);
    const cost = num(form.costPrice) ?? 0;
    const spent = detail?.totalCosts ?? 0;
    if (sale == null) return null;
    const value = sale - cost - spent;
    const base = sale || 1;
    return { value, pct: (value / base) * 100 };
  }, [form.salePrice, form.costPrice, detail]);

  const lookupPlate = async () => {
    if (!form.plate.trim()) return;
    setPlateLoading(true);
    setPlateMsg(null);
    try {
      const res = await vehiclesApi.plateLookup(form.plate);
      const d = res.data;
      setForm((f) => ({
        ...f,
        brand: d.brand ?? f.brand,
        model: d.model ?? f.model,
        version: d.version ?? f.version,
        yearFabrication: d.yearFabrication ? String(d.yearFabrication) : f.yearFabrication,
        yearModel: d.yearModel ? String(d.yearModel) : f.yearModel,
        color: d.color ?? f.color,
        fuel: d.fuel ?? f.fuel,
        km: d.km ? String(d.km) : f.km,
        fipePrice: d.fipePrice ? String(d.fipePrice) : f.fipePrice,
      }));
      setPlateMsg(res.source === 'mock' ? 'Dados pré-preenchidos (simulação — API de placas será integrada).' : 'Dados encontrados.');
    } catch (err) {
      setPlateMsg(err instanceof ApiError ? err.message : 'Falha na consulta');
    } finally {
      setPlateLoading(false);
    }
  };

  const buildPayload = (): VehiclePayload => ({
    type: form.type,
    brand: form.brand,
    model: form.model,
    version: form.version || null,
    yearFabrication: Number(form.yearFabrication),
    yearModel: Number(form.yearModel),
    color: form.color || null,
    fuel: form.fuel || null,
    km: num(form.km) ?? 0,
    plate: form.plate || null,
    chassi: form.chassi || null,
    renavam: form.renavam || null,
    fipePrice: num(form.fipePrice),
    costPrice: num(form.costPrice),
    salePrice: num(form.salePrice) ?? 0,
    status: form.status,
    optionals: form.optionals,
    notes: form.notes || null,
    description: form.description || null,
  });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = buildPayload();
      if (isEdit && id) {
        setDetail(await vehiclesApi.update(id, payload));
        navigate('/inventory');
      } else {
        const created = await vehiclesApi.create(payload);
        // vai para edição para permitir adicionar fotos ao veículo recém-criado
        navigate(`/inventory/${created.id}/edit`, { replace: true });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!id || !window.confirm('Remover este veículo do estoque? As fotos serão apagadas.')) return;
    try {
      await vehiclesApi.remove(id);
      navigate('/inventory');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao remover');
    }
  };

  if (loading) return <div className="page-loading">Carregando veículo…</div>;

  return (
    <div className="dash veh-form-page">
      <PageHeader
        back={{ to: '/inventory', label: 'Voltar ao estoque' }}
        eyebrow="Estoque"
        title={isEdit ? `${form.brand} ${form.model}` : 'Adicionar Veículo'}
        subtitle={isEdit ? 'Edite os dados, custos e a galeria de fotos.' : 'Cadastre um novo veículo no estoque.'}
        actions={
          isEdit && (
            <button className="btn btn-ghost danger-ghost" onClick={remove}>
              <TrashIcon size={15} /> Remover
            </button>
          )
        }
      />

      {error && <div className="alert alert-error">{error}</div>}

      <form onSubmit={submit} className="veh-form">
        {/* SEÇÃO 1 — Identificação */}
        <section className="form-section">
          <div className="section-head">
            <span className="section-num">1</span>
            <h2>Dados de Identificação</h2>
          </div>

          <div className="plate-row">
            <label className="field plate-field">
              <span>Placa</span>
              <input
                value={form.plate}
                onChange={(e) => set('plate', e.target.value.toUpperCase())}
                placeholder="ABC1D23"
                maxLength={8}
              />
            </label>
            <button type="button" className="btn btn-info" onClick={lookupPlate} disabled={plateLoading || !form.plate.trim()}>
              <SearchDataIcon size={15} /> {plateLoading ? 'Consultando…' : 'Consultar Dados'}
            </button>
          </div>
          {plateMsg && <p className="plate-msg muted small">{plateMsg}</p>}

          <div className="form-grid">
            <label className="field">
              <span>Tipo</span>
              <select value={form.type} onChange={(e) => set('type', e.target.value as VehicleType)}>
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {VEHICLE_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Marca *</span>
              <input value={form.brand} onChange={(e) => set('brand', e.target.value)} required />
            </label>
            <label className="field">
              <span>Modelo *</span>
              <input value={form.model} onChange={(e) => set('model', e.target.value)} required />
            </label>
            <label className="field">
              <span>Versão</span>
              <input value={form.version} onChange={(e) => set('version', e.target.value)} />
            </label>
            <label className="field">
              <span>Ano Fab.</span>
              <input type="number" value={form.yearFabrication} onChange={(e) => set('yearFabrication', e.target.value)} required />
            </label>
            <label className="field">
              <span>Ano Modelo</span>
              <input type="number" value={form.yearModel} onChange={(e) => set('yearModel', e.target.value)} required />
            </label>
            <label className="field">
              <span>Cor</span>
              <input value={form.color} onChange={(e) => set('color', e.target.value)} />
            </label>
            <label className="field">
              <span>Combustível</span>
              <select value={form.fuel} onChange={(e) => set('fuel', e.target.value)}>
                <option value="">—</option>
                {FUEL_OPTIONS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>KM</span>
              <input type="number" value={form.km} onChange={(e) => set('km', e.target.value)} />
            </label>
            <label className="field">
              <span>Chassi</span>
              <input value={form.chassi} onChange={(e) => set('chassi', e.target.value)} />
            </label>
            <label className="field">
              <span>Renavam</span>
              <input value={form.renavam} onChange={(e) => set('renavam', e.target.value)} />
            </label>
            <label className="field">
              <span>Status</span>
              <select value={form.status} onChange={(e) => set('status', e.target.value as VehicleStatus)}>
                {VEHICLE_STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {VEHICLE_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        {/* SEÇÃO 2 — Precificação */}
        <section className="form-section">
          <div className="section-head">
            <span className="section-num">2</span>
            <h2>Precificação e Custos</h2>
          </div>
          <div className="price-layout">
            <div className="price-fields">
              <label className="field">
                <span>Preço FIPE (informativo)</span>
                <input type="number" step="0.01" value={form.fipePrice} onChange={(e) => set('fipePrice', e.target.value)} placeholder="0,00" />
              </label>
              <label className="field">
                <span>Preço de Custo / Compra</span>
                <input type="number" step="0.01" value={form.costPrice} onChange={(e) => set('costPrice', e.target.value)} placeholder="0,00" />
              </label>
              <label className="field">
                <span>Preço de Venda *</span>
                <input type="number" step="0.01" value={form.salePrice} onChange={(e) => set('salePrice', e.target.value)} placeholder="0,00" required />
              </label>
            </div>
            <div className={`margin-card ${margin && margin.value < 0 ? 'negative' : ''}`}>
              <span className="margin-label">Margem estimada</span>
              <span className="margin-value">{margin ? formatBRL(margin.value) : '—'}</span>
              {margin && <span className="margin-pct">{margin.pct.toFixed(1)}% sobre a venda</span>}
              {detail && detail.totalCosts > 0 && (
                <span className="margin-note muted small">Inclui {formatBRL(detail.totalCosts)} em gastos lançados</span>
              )}
            </div>
          </div>
        </section>

        {/* SEÇÃO 3 — Galeria */}
        <section className="form-section">
          <div className="section-head">
            <span className="section-num">3</span>
            <h2>Galeria de Fotos</h2>
          </div>
          {isEdit && detail ? (
            <PhotoGallery vehicleId={detail.id} photos={detail.photos} onChange={setDetail} />
          ) : (
            <div className="gallery-locked muted">
              Salve o veículo para habilitar o upload de fotos.
            </div>
          )}
        </section>

        {/* SEÇÃO 4 — Opcionais */}
        <section className="form-section">
          <div className="section-head">
            <span className="section-num">4</span>
            <h2>Opcionais e Acessórios</h2>
          </div>
          <div className="optionals-grid">
            {OPTIONAL_ITEMS.map((item) => {
              const on = form.optionals.includes(item);
              return (
                <button
                  type="button"
                  key={item}
                  className={`optional-chip ${on ? 'on' : ''}`}
                  onClick={() => toggleOptional(item)}
                >
                  <span className="optional-check">{on ? '✓' : ''}</span>
                  {item}
                </button>
              );
            })}
          </div>
          <label className="field notes-field">
            <span>Observações</span>
            <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={3} placeholder="Detalhes adicionais, laudos, histórico…" />
          </label>
        </section>

        {/* SEÇÃO 5 — Descrição do anúncio (co-piloto de IA) */}
        <section className="form-section">
          <div className="section-head">
            <span className="section-num">5</span>
            <h2>Descrição do Anúncio</h2>
            {isEdit && detail && (
              <button type="button" className="btn btn-ai" onClick={() => setAiOpen(true)}>
                <SparklesIcon size={15} /> Gerar Descrição com IA
              </button>
            )}
          </div>
          {isEdit && detail ? (
            <label className="field">
              <span>Texto para publicação (portais/OLX)</span>
              <textarea
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                rows={8}
                placeholder="Clique em 'Gerar Descrição com IA' ou escreva o texto do anúncio…"
              />
            </label>
          ) : (
            <div className="gallery-locked muted">Salve o veículo para habilitar o co-piloto de descrição.</div>
          )}
        </section>

        <div className="form-footer">
          <Link to="/inventory" className="btn btn-ghost">
            Cancelar
          </Link>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Salvando…' : isEdit ? 'Salvar alterações' : 'Cadastrar veículo'}
          </button>
        </div>
      </form>

      {aiOpen && detail && (
        <AiDescriptionModal
          vehicleId={detail.id}
          collected={[form.brand, form.model, form.version, form.yearModel, `${form.optionals.length} opcionais`]
            .filter(Boolean)
            .join(', ')}
          onClose={() => setAiOpen(false)}
          onGenerated={(description) => set('description', description)}
        />
      )}
    </div>
  );
}
