import { useEffect, useState } from 'react';
import { settingsApi } from '../api/endpoints';
import { ApiError } from '../api/client';
import { PageHeader } from '../components/PageHeader';
import { SettingsIcon } from '../components/icons';
import type { LeadFormFieldConfig, LeadFormSettings } from '../types';

type Config = Record<string, LeadFormFieldConfig>;

export function SettingsPage() {
  const [data, setData] = useState<LeadFormSettings | null>(null);
  const [config, setConfig] = useState<Config>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    settingsApi
      .getLeadForm()
      .then((d) => {
        setData(d);
        setConfig(d.config);
      })
      .catch(() => setData(null));
  }, []);

  const toggleEnabled = (key: string) => {
    setOk(false);
    setConfig((c) => {
      const enabled = !c[key]?.enabled;
      return { ...c, [key]: { enabled, required: enabled ? (c[key]?.required ?? false) : false } };
    });
  };
  const toggleRequired = (key: string) => {
    setOk(false);
    setConfig((c) => ({ ...c, [key]: { enabled: true, required: !c[key]?.required } }));
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setOk(false);
    try {
      const saved = await settingsApi.saveLeadForm(config);
      setData(saved);
      setConfig(saved.config);
      setOk(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao salvar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dash settings-page">
      <PageHeader
        icon={<SettingsIcon size={19} />}
        eyebrow="Configurações"
        title="Formulário de Clientes/Leads"
        subtitle="Escolha quais campos aparecem — e quais são obrigatórios — no cadastro de leads."
      />

      <div className="settings-card">
        <div className="fields-note muted small">
          Os campos fixos (nome, telefone, e-mail) estão sempre presentes. Configure abaixo os campos adicionais.
        </div>

        <div className="field-toggles">
          {data?.fields.map((f) => {
            const cfg = config[f.key] ?? { enabled: false, required: false };
            return (
              <div key={f.key} className={`field-toggle ${cfg.enabled ? 'on' : ''}`}>
                <div className="field-toggle-main">
                  <span className="field-toggle-label">{f.label}</span>
                  <button
                    type="button"
                    className={`switch ${cfg.enabled ? 'on blue' : ''}`}
                    onClick={() => toggleEnabled(f.key)}
                    role="switch"
                    aria-checked={cfg.enabled}
                  >
                    <span className="switch-knob" />
                  </button>
                </div>
                <label className={`field-required ${cfg.enabled ? '' : 'disabled'}`}>
                  <input
                    type="checkbox"
                    checked={cfg.required}
                    disabled={!cfg.enabled}
                    onChange={() => toggleRequired(f.key)}
                  />
                  <span>Obrigatório</span>
                </label>
              </div>
            );
          })}
        </div>

        {error && <div className="alert alert-error">{error}</div>}
        {ok && <div className="alert alert-success">Configuração salva. Aplicada ao formulário de novo ticket.</div>}

        <div className="settings-footer">
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar configuração'}
          </button>
        </div>
      </div>
    </div>
  );
}
