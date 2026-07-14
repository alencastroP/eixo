import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { settingsApi, ticketsApi } from '../api/endpoints';
import { ApiError } from '../api/client';
import type { LeadFormSettings } from '../types';
import { formatDocumentInput } from '../utils/format';

interface Props {
  open: boolean;
  onClose: () => void;
}

/** Registro manual de um lead que chegou fora das plataformas (telefone, loja). */
export function NewTicketModal({ open, onClose }: Props) {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [vehicleText, setVehicleText] = useState('');
  const [message, setMessage] = useState('');
  const [leadForm, setLeadForm] = useState<LeadFormSettings | null>(null);
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // carrega os campos personalizados configurados em Configurações
  useEffect(() => {
    if (!open) return;
    settingsApi
      .getLeadForm()
      .then(setLeadForm)
      .catch(() => setLeadForm(null));
  }, [open]);

  if (!open) return null;

  const enabledFields = leadForm ? leadForm.fields.filter((f) => leadForm.config[f.key]?.enabled) : [];
  const isRequired = (key: string) => leadForm?.config[key]?.required ?? false;
  const setField = (key: string, value: string) => setCustom((c) => ({ ...c, [key]: value }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    // valida obrigatórios personalizados
    for (const f of enabledFields) {
      if (isRequired(f.key) && !custom[f.key]?.trim()) {
        setError(`O campo "${f.label}" é obrigatório.`);
        return;
      }
    }
    setSaving(true);
    setError(null);
    try {
      const { document, ...extra } = custom;
      const ticket = await ticketsApi.create({
        lead: { name, phone: phone || undefined, email: email || undefined, document: document || undefined },
        message,
        vehicleText: vehicleText || undefined,
        extra: Object.keys(extra).length ? extra : undefined,
      });
      onClose();
      navigate(`/tickets/${ticket.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao criar o ticket');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Novo ticket manual</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Fechar">
            ✕
          </button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body">
          <label className="field">
            <span>Nome do interessado *</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} autoFocus />
          </label>
          <div className="field-row">
            <label className="field">
              <span>Telefone</span>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 99999-9999" />
            </label>
            <label className="field">
              <span>E-mail</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
          </div>
          <label className="field">
            <span>Veículo de interesse</span>
            <input
              value={vehicleText}
              onChange={(e) => setVehicleText(e.target.value)}
              placeholder="Ex.: Honda Civic EXL 2020"
            />
          </label>

          {/* campos personalizados habilitados nas Configurações */}
          {enabledFields.length > 0 && (
            <div className="custom-fields">
              {enabledFields.map((f) => (
                <label className="field" key={f.key}>
                  <span>
                    {f.label} {isRequired(f.key) && <em className="req">*</em>}
                  </span>
                  <input
                    value={custom[f.key] ?? ''}
                    onChange={(e) =>
                      setField(f.key, f.key === 'document' ? formatDocumentInput(e.target.value) : e.target.value)
                    }
                    required={isRequired(f.key)}
                  />
                </label>
              ))}
            </div>
          )}

          <label className="field">
            <span>Mensagem / motivo do contato *</span>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} required rows={3} />
          </label>
          {error && <p className="form-error">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Criando…' : 'Criar ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
