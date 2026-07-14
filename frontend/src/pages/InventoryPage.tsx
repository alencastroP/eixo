import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { vehiclesApi, type VehicleListParams } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { VehicleStatusBadge } from '../components/badges';
import { CameraIcon, CarIcon, PlusIcon, SearchIcon, XIcon } from '../components/icons';
import { PageHeader } from '../components/PageHeader';
import { VehicleCostsModal } from '../components/VehicleCostsModal';
import {
  VEHICLE_STATUS_LABELS,
  VEHICLE_STATUS_ORDER,
  VEHICLE_TYPE_LABELS,
  type VehicleCard,
  type VehicleFacets,
  type VehicleStatus,
  type VehicleType,
} from '../types';
import { formatBRL } from '../utils/format';

const TYPES: VehicleType[] = ['CAR', 'MOTORCYCLE', 'HEAVY'];

export function InventoryPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'ADMIN';

  const [filters, setFilters] = useState({ brand: '', model: '', year: '', status: '', type: '' });
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<VehicleCard[]>([]);
  const [total, setTotal] = useState(0);
  const [facets, setFacets] = useState<VehicleFacets | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [costsFor, setCostsFor] = useState<VehicleCard | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const loadFacets = () =>
    vehiclesApi
      .facets()
      .then(setFacets)
      .catch(() => setFacets(null));

  useEffect(() => {
    loadFacets();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params: VehicleListParams = {
      brand: filters.brand || undefined,
      model: filters.model || undefined,
      year: filters.year ? Number(filters.year) : undefined,
      status: (filters.status || undefined) as VehicleStatus | undefined,
      type: (filters.type || undefined) as VehicleType | undefined,
      search: search || undefined,
      page: 1,
      pageSize: 48,
    };
    vehiclesApi
      .list(params)
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
        setTotal(res.total);
        setError(null);
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : 'Falha ao carregar estoque'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [filters, search]);

  const setFilter = (k: keyof typeof filters, v: string) => setFilters((f) => ({ ...f, [k]: v }));
  const clearFilters = () => {
    setFilters({ brand: '', model: '', year: '', status: '', type: '' });
    setSearchInput('');
  };
  const hasFilters =
    Object.values(filters).some(Boolean) || search.length > 0;

  return (
    <div className="dash inv-page">
      <PageHeader
        icon={<CarIcon size={19} />}
        eyebrow="Estoque"
        title="Garagem Digital"
        subtitle={facets ? `${facets.total} veículos no inventário` : 'Carregando inventário…'}
        actions={
          isAdmin && (
            <button className="btn btn-primary" onClick={() => navigate('/inventory/new')}>
              <PlusIcon size={17} /> Adicionar Veículo
            </button>
          )
        }
      />

      {/* status chips com contagem */}
      {facets && (
        <div className="stats-row">
          {VEHICLE_STATUS_ORDER.map((s) => (
            <button
              key={s}
              className={`stat-chip ${filters.status === s ? 'active' : ''}`}
              onClick={() => setFilter('status', filters.status === s ? '' : s)}
            >
              <span className={`dot veh-dot-${s}`} />
              {VEHICLE_STATUS_LABELS[s]}
              <strong>{facets.byStatus[s] ?? 0}</strong>
            </button>
          ))}
        </div>
      )}

      {/* busca e filtros rápidos */}
      <div className="inv-toolbar">
        <div className="inv-search">
          <SearchIcon size={15} />
          <input
            placeholder="Buscar por marca, modelo, versão ou placa…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>

        <div className="inv-toolbar-divider" />

        <div className="inv-toolbar-filters">
          <select
            className="inv-filter-select"
            value={filters.brand}
            onChange={(e) => setFilter('brand', e.target.value)}
          >
            <option value="">Marca</option>
            {facets?.brands.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
          <input
            className="inv-filter-model"
            placeholder="Modelo"
            value={filters.model}
            onChange={(e) => setFilter('model', e.target.value)}
          />
          <select
            className="inv-filter-select narrow"
            value={filters.year}
            onChange={(e) => setFilter('year', e.target.value)}
          >
            <option value="">Ano</option>
            {facets?.years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <select
            className="inv-filter-select narrow"
            value={filters.type}
            onChange={(e) => setFilter('type', e.target.value)}
          >
            <option value="">Tipo</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {VEHICLE_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>

        {hasFilters && (
          <button className="btn btn-ghost btn-sm inv-clear-btn" onClick={clearFilters}>
            <XIcon size={13} /> Limpar
          </button>
        )}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="veh-grid">
        {items.map((v) => (
          <div key={v.id} className="veh-card">
            <div className="veh-cover" onClick={() => isAdmin && navigate(`/inventory/${v.id}/edit`)}>
              {v.coverUrl ? (
                <img src={v.coverUrl} alt={`${v.brand} ${v.model}`} loading="lazy" />
              ) : (
                <div className="veh-cover-empty">
                  <CarIcon size={34} />
                  <span>Sem foto</span>
                </div>
              )}
              <VehicleStatusBadge status={v.status} />
              {v.photoCount > 0 && (
                <span className="veh-photo-count">
                  <CameraIcon size={12} /> {v.photoCount}
                </span>
              )}
            </div>

            <div className="veh-body">
              <div className="veh-title-row">
                <h3 className="veh-title">
                  {v.brand} {v.model}
                </h3>
                <span className="veh-price">{formatBRL(v.salePrice) ?? '—'}</span>
              </div>
              <div className="veh-version">{v.version ?? VEHICLE_TYPE_LABELS[v.type]}</div>
              <div className="veh-specs">
                <span>
                  {v.yearFabrication}/{v.yearModel}
                </span>
                <span className="veh-dot-sep" />
                <span>{v.km.toLocaleString('pt-BR')} km</span>
                {v.fuel && (
                  <>
                    <span className="veh-dot-sep" />
                    <span>{v.fuel}</span>
                  </>
                )}
              </div>

              <div className="veh-actions">
                <button className="link-btn" onClick={() => navigate(`/inventory/${v.id}/edit`)}>
                  {isAdmin ? 'Ver / Editar' : 'Ver detalhes'}
                </button>
                <button className="link-btn subtle" onClick={() => setCostsFor(v)}>
                  Histórico de Gastos
                </button>
              </div>
            </div>
          </div>
        ))}

        {!loading && items.length === 0 && (
          <div className="veh-empty">
            <CarIcon size={30} />
            <p>{hasFilters ? 'Nenhum veículo com esses filtros.' : 'Estoque vazio.'}</p>
            {isAdmin && !hasFilters && (
              <button className="btn btn-primary btn-sm" onClick={() => navigate('/inventory/new')}>
                <PlusIcon size={15} /> Adicionar o primeiro
              </button>
            )}
          </div>
        )}
        {loading && items.length === 0 && <div className="veh-empty">Carregando estoque…</div>}
      </div>

      {total > items.length && <p className="muted small">Exibindo {items.length} de {total} veículos.</p>}

      {costsFor && (
        <VehicleCostsModal
          vehicleId={costsFor.id}
          title={`${costsFor.brand} ${costsFor.model}`}
          canEdit={isAdmin}
          onClose={() => setCostsFor(null)}
          onChanged={() => loadFacets()}
        />
      )}
    </div>
  );
}
