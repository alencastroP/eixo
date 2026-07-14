import { useState, type FormEvent } from 'react';
import { authApi } from '../api/endpoints';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { PageHeader } from '../components/PageHeader';
import { UserIcon } from '../components/icons';
import { ROLE_LABELS } from '../types';

export function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setOk(false);
    try {
      await authApi.updateMe({
        name,
        email,
        currentPassword: newPassword ? currentPassword : undefined,
        newPassword: newPassword || undefined,
      });
      await refreshUser();
      setOk(true);
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao salvar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dash settings-page">
      <PageHeader icon={<UserIcon size={19} />} eyebrow="Conta" title="Meus Dados" subtitle="Edite seu perfil e senha de acesso." />

      <form className="settings-card" onSubmit={submit}>
        <div className="settings-section">
          <h3>Perfil</h3>
          <label className="field">
            <span>Nome</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
          </label>
          <label className="field">
            <span>E-mail</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <div className="field">
            <span>Papel</span>
            <div className="static-field">{user ? ROLE_LABELS[user.role] : '—'}</div>
          </div>
        </div>

        <div className="settings-section">
          <h3>Trocar senha</h3>
          <p className="muted small">Deixe em branco para manter a senha atual.</p>
          <div className="field-row">
            <label className="field">
              <span>Senha atual</span>
              <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" />
            </label>
            <label className="field">
              <span>Nova senha</span>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
            </label>
          </div>
        </div>

        {error && <div className="alert alert-error">{error}</div>}
        {ok && <div className="alert alert-success">Perfil atualizado com sucesso.</div>}

        <div className="settings-footer">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar alterações'}
          </button>
        </div>
      </form>
    </div>
  );
}
