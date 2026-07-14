import { useEffect, useState } from 'react';
import { creditApi, leadsApi } from '../api/endpoints';
import { ApiError } from '../api/client';
import type { CreditQuery, LeadSearchResult } from '../types';
import { avatarColor, formatPhone, initials } from '../utils/format';
import { SearchIcon } from './icons';

interface Props {
  queryId: string;
  onClose: () => void;
  onLinked: (updated: CreditQuery) => void;
}

/** Vincula a consulta de crédito a um lead/cliente existente (busca em tempo real). */
export function LinkLeadModal({ queryId, onClose, onLinked }: Props) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<LeadSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [linking, setLinking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      leadsApi
        .search(term.trim())
        .then((r) => !cancelled && setResults(r))
        .catch(() => !cancelled && setResults([]))
        .finally(() => !cancelled && setLoading(false));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [term]);

  const link = async (leadId: string) => {
    setLinking(leadId);
    setError(null);
    try {
      onLinked(await creditApi.link(queryId, leadId));
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao vincular');
      setLinking(null);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Vincular a um lead/cliente</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar">
            ✕
          </button>
        </div>
        <div className="modal-body">
          <div className="inbox-search link-search">
            <SearchIcon size={15} />
            <input
              autoFocus
              placeholder="Buscar por nome, telefone ou e-mail…"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
            />
          </div>

          {error && <div className="alert alert-error">{error}</div>}

          <div className="lead-results">
            {loading && results.length === 0 && <div className="muted small">Buscando…</div>}
            {!loading && results.length === 0 && (
              <div className="muted small">Nenhum lead encontrado. Ajuste a busca.</div>
            )}
            {results.map((l) => (
              <button key={l.id} className="lead-result" disabled={linking !== null} onClick={() => link(l.id)}>
                <span className="avatar sm" style={{ backgroundColor: avatarColor(l.name) }}>
                  {initials(l.name)}
                </span>
                <span className="lead-result-info">
                  <span className="lead-result-name">{l.name}</span>
                  <span className="lead-result-contact muted small">
                    {formatPhone(l.phone) ?? l.email ?? 'sem contato'}
                  </span>
                </span>
                <span className="lead-result-cta">{linking === l.id ? 'Vinculando…' : 'Vincular'}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
