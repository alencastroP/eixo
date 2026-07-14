import { useEffect, useState, type FormEvent } from 'react';
import { settingsApi } from '../api/endpoints';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { PageHeader } from '../components/PageHeader';
import { BuildingIcon } from '../components/icons';
import type { CompanySettings } from '../types';
import { formatDocumentInput } from '../utils/format';

const EMPTY: CompanySettings = {
  tradeName: '',
  legalName: '',
  cnpj: '',
  email: '',
  phone: '',
  address: '',
  city: '',
  state: '',
  logoUrl: null,
};

export function CompanyPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [form, setForm] = useState<CompanySettings>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    settingsApi
      .getCompany()
      .then(setForm)
      .catch(() => setForm(EMPTY))
      .finally(() => setLoading(false));
  }, []);

  const set = <K extends keyof CompanySettings>(k: K, v: CompanySettings[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setOk(false);
    try {
      setForm(await settingsApi.saveCompany(form));
      setOk(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao salvar');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="page-loading">Carregando…</div>;

  return (
    <div className="dash settings-page">
      <PageHeader
        icon={<BuildingIcon size={19} />}
        eyebrow="Configurações"
        title="Dados da Empresa"
        subtitle="CNPJ, endereço e dados de faturamento da loja."
      />

      <form className="settings-card" onSubmit={submit}>
        <div className="settings-section">
          <h3>Identificação</h3>
          <label className="field">
            <span>Nome fantasia *</span>
            <input value={form.tradeName} onChange={(e) => set('tradeName', e.target.value)} required disabled={!isAdmin} />
          </label>
          <div className="field-row">
            <label className="field">
              <span>Razão social</span>
              <input value={form.legalName} onChange={(e) => set('legalName', e.target.value)} disabled={!isAdmin} />
            </label>
            <label className="field">
              <span>CNPJ</span>
              <input value={form.cnpj} onChange={(e) => set('cnpj', formatDocumentInput(e.target.value))} disabled={!isAdmin} />
            </label>
          </div>
        </div>

        <div className="settings-section">
          <h3>Contato &amp; Faturamento</h3>
          <div className="field-row">
            <label className="field">
              <span>E-mail</span>
              <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} disabled={!isAdmin} />
            </label>
            <label className="field">
              <span>Telefone</span>
              <input value={form.phone} onChange={(e) => set('phone', e.target.value)} disabled={!isAdmin} />
            </label>
          </div>
          <label className="field">
            <span>Endereço</span>
            <input value={form.address} onChange={(e) => set('address', e.target.value)} disabled={!isAdmin} />
          </label>
          <div className="field-row">
            <label className="field">
              <span>Cidade</span>
              <input value={form.city} onChange={(e) => set('city', e.target.value)} disabled={!isAdmin} />
            </label>
            <label className="field">
              <span>UF</span>
              <input value={form.state} onChange={(e) => set('state', e.target.value.toUpperCase())} maxLength={2} disabled={!isAdmin} />
            </label>
          </div>
        </div>

        {error && <div className="alert alert-error">{error}</div>}
        {ok && <div className="alert alert-success">Dados da empresa salvos.</div>}

        {isAdmin && (
          <div className="settings-footer">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar dados'}
            </button>
          </div>
        )}
        {!isAdmin && <p className="muted small">Apenas administradores podem editar os dados da empresa.</p>}
      </form>
    </div>
  );
}
