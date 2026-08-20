import { useEffect, useState } from 'react';
import { siteApi } from './api';
import { VehicleCard } from './components';
import { ChevronLeftIcon, ChevronRightIcon } from './icons';
import type { SiteFacets, SiteTag, SiteVehicle, SiteVehicleQuery, StorefrontFinancing } from './types';

export interface InventoryFilters {
  search: string;
  brand: string;
  chip: string;
  sort: NonNullable<SiteVehicleQuery['sort']>;
  page: number;
}

export const EMPTY_FILTERS: InventoryFilters = { search: '', brand: '', chip: 'Todos', sort: 'recent', page: 1 };

const PAGE_SIZE = 12;

/**
 * Recortes rápidos do estoque. Faixa de preço vira priceMin/priceMax e câmbio/
 * tração viram `tag` — os três filtram no servidor, para a contagem e a
 * paginação continuarem verdadeiras.
 */
const CHIPS: { key: string; query: Partial<SiteVehicleQuery> }[] = [
  { key: 'Todos', query: {} },
  { key: 'Até 50 mil', query: { priceMax: 50000 } },
  { key: '50 a 100 mil', query: { priceMin: 50000, priceMax: 100000 } },
  { key: 'Acima de 100 mil', query: { priceMin: 100000 } },
  { key: 'Automático', query: { tag: 'automatico' as SiteTag } },
  { key: 'Manual', query: { tag: 'manual' as SiteTag } },
  { key: '4x4', query: { tag: '4x4' as SiteTag } },
];

const favKey = (slug: string) => `eixo.favs.${slug}`;

function readFavs(slug: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(favKey(slug)) ?? '[]') as string[];
  } catch {
    return [];
  }
}

export function Inventory({
  slug,
  facets,
  whatsapp,
  storeName,
  financing,
  filters,
  onChange,
}: {
  slug: string;
  facets: SiteFacets;
  whatsapp: string;
  storeName: string;
  financing: StorefrontFinancing;
  filters: InventoryFilters;
  onChange: (next: InventoryFilters) => void;
}) {
  const [items, setItems] = useState<SiteVehicle[] | null>(null);
  const [total, setTotal] = useState(0);
  const [showInstallment, setShowInstallment] = useState(false);
  const [favs, setFavs] = useState<string[]>(() => readFavs(slug));

  useEffect(() => {
    let active = true;
    setItems(null);
    const chip = CHIPS.find((c) => c.key === filters.chip)?.query ?? {};
    siteApi
      .vehicles(slug, {
        ...chip,
        search: filters.search || undefined,
        brand: filters.brand || undefined,
        sort: filters.sort,
        page: filters.page,
        pageSize: PAGE_SIZE,
      })
      .then((data) => {
        if (!active) return;
        setItems(data.items);
        setTotal(data.total);
      })
      .catch(() => active && setItems([]));
    return () => {
      active = false;
    };
  }, [slug, filters]);

  const toggleFav = (id: string) => {
    setFavs((list) => {
      const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
      localStorage.setItem(favKey(slug), JSON.stringify(next));
      return next;
    });
  };

  const set = <K extends keyof InventoryFilters>(key: K, value: InventoryFilters[K]) =>
    onChange({ ...filters, [key]: value, page: key === 'page' ? (value as number) : 1 });

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <div className="sf-stock-tools" style={{ justifyContent: 'flex-end', paddingTop: 22 }}>
        <button
          className={`sf-toggle ${showInstallment ? 'is-on' : ''}`}
          onClick={() => setShowInstallment((v) => !v)}
          aria-pressed={showInstallment}
        >
          Ver parcela estimada
        </button>
        <div className="sf-sort">
          <span>Ordenar</span>
          <select
            value={filters.sort}
            onChange={(e) => set('sort', e.target.value as InventoryFilters['sort'])}
            aria-label="Ordenar estoque"
          >
            <option value="recent">Mais recentes</option>
            <option value="priceAsc">Menor preço</option>
            <option value="priceDesc">Maior preço</option>
            <option value="kmAsc">Menor km</option>
            <option value="yearDesc">Ano mais novo</option>
          </select>
        </div>
      </div>

      <div className="sf-chips">
        {CHIPS.map((c) => (
          <button
            key={c.key}
            className={`sf-chip ${filters.chip === c.key ? 'is-on' : ''}`}
            onClick={() => set('chip', c.key)}
          >
            {c.key}
          </button>
        ))}
        {facets.brands.length > 0 && (
          <span className="sf-note" style={{ alignSelf: 'center', marginLeft: 'auto' }}>
            {items === null ? 'buscando…' : `${total} ${total === 1 ? 'veículo' : 'veículos'}`}
          </span>
        )}
      </div>

      {items === null ? (
        <div className="sf-grid">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="sf-skeleton" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="sf-empty">
          <p>Nenhum veículo com esses filtros.</p>
          <button className="sf-btn sf-btn-ink sf-btn-sm" onClick={() => onChange(EMPTY_FILTERS)}>
            Limpar filtros
          </button>
        </div>
      ) : (
        <div className="sf-grid">
          {items.map((v) => (
            <VehicleCard
              key={v.id}
              vehicle={v}
              slug={slug}
              whatsapp={whatsapp}
              storeName={storeName}
              financing={financing}
              showInstallment={showInstallment}
              favorite={favs.includes(v.id)}
              onToggleFavorite={() => toggleFav(v.id)}
            />
          ))}
        </div>
      )}

      {pages > 1 && (
        <nav className="sf-pagination" aria-label="Paginação do estoque">
          <button className="sf-page" onClick={() => set('page', filters.page - 1)} disabled={filters.page <= 1}>
            <ChevronLeftIcon size={16} />
          </button>
          {Array.from({ length: pages }, (_, i) => i + 1)
            .filter((p) => p === 1 || p === pages || Math.abs(p - filters.page) <= 1)
            .map((p, index, list) => (
              <span key={p} style={{ display: 'contents' }}>
                {index > 0 && list[index - 1] !== p - 1 && <span className="sf-note">…</span>}
                <button
                  className={`sf-page ${p === filters.page ? 'is-on' : ''}`}
                  onClick={() => set('page', p)}
                  aria-current={p === filters.page ? 'page' : undefined}
                >
                  {p}
                </button>
              </span>
            ))}
          <button className="sf-page" onClick={() => set('page', filters.page + 1)} disabled={filters.page >= pages}>
            <ChevronRightIcon size={16} />
          </button>
        </nav>
      )}
    </>
  );
}
