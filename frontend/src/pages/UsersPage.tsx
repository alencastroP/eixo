import { useEffect, useState, type FormEvent } from 'react';
import { usersApi } from '../api/endpoints';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { PageHeader } from '../components/PageHeader';
import { PlusIcon, UsersIcon } from '../components/icons';
import { ROLE_LABELS, type Role, type UserListItem } from '../types';
import { avatarColor, initials } from '../utils/format';

interface EditState {
  id?: string;
  name: string;
  email: string;
  role: Role;
  password: string;
}

const BLANK: EditState = { name: '', email: '', role: 'AGENT', password: '' };

export function UsersPage() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    usersApi
      .list()
      .then(setUsers)
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const openNew = () => {
    setError(null);
    setModal({ ...BLANK });
  };
  const openEdit = (u: UserListItem) => {
    setError(null);
    setModal({ id: u.id, name: u.name, email: u.email, role: u.role, password: '' });
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!modal) return;
    setSaving(true);
    setError(null);
    try {
      if (modal.id) {
        await usersApi.update(modal.id, {
          name: modal.name,
          role: modal.role,
          password: modal.password || undefined,
        });
      } else {
        await usersApi.create({ name: modal.name, email: modal.email, password: modal.password, role: modal.role });
      }
      setModal(null);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (u: UserListItem) => {
    await usersApi.update(u.id, { active: !u.active });
    load();
  };

  return (
    <div className="dash settings-page users-page">
      <PageHeader
        icon={<UsersIcon size={19} />}
        eyebrow="Configurações"
        title="Gerenciar Usuários"
        subtitle="Crie, edite ou revogue o acesso dos funcionários da loja."
        actions={
          <button className="btn btn-primary" onClick={openNew}>
            <PlusIcon size={16} /> Novo Usuário
          </button>
        }
      />

      <div className="card table-wrap">
        <table className="fin-table users-table">
          <thead>
            <tr>
              <th>Funcionário</th>
              <th>E-mail</th>
              <th>Papel</th>
              <th>Status</th>
              <th className="right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <div className="user-cell">
                    <span className="avatar sm" style={{ backgroundColor: avatarColor(u.name) }}>
                      {initials(u.name)}
                    </span>
                    <span>
                      {u.name}
                      {u.id === me?.id && <span className="you-tag"> (você)</span>}
                    </span>
                  </div>
                </td>
                <td className="muted">{u.email}</td>
                <td>
                  <span className={`badge ${u.role === 'ADMIN' ? 'role-admin' : 'role-agent'}`}>{ROLE_LABELS[u.role]}</span>
                </td>
                <td>
                  <span className={`badge ${u.active ? 'fin-PAID' : 'fin-OVERDUE'}`}>{u.active ? 'Ativo' : 'Revogado'}</span>
                </td>
                <td className="right">
                  <div className="row-actions">
                    <button className="btn btn-ghost btn-sm" onClick={() => openEdit(u)}>
                      Editar
                    </button>
                    {u.id !== me?.id && (
                      <button className="btn btn-ghost btn-sm" onClick={() => toggleActive(u)}>
                        {u.active ? 'Revogar' : 'Reativar'}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {loading && users.length === 0 && (
              <tr>
                <td colSpan={5} className="empty-row">
                  Carregando…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{modal.id ? 'Editar Usuário' : 'Novo Usuário'}</h2>
              <button className="icon-btn" onClick={() => setModal(null)} aria-label="Fechar">
                ✕
              </button>
            </div>
            <form className="modal-body" onSubmit={save}>
              <label className="field">
                <span>Nome *</span>
                <input value={modal.name} onChange={(e) => setModal({ ...modal, name: e.target.value })} required autoFocus />
              </label>
              <label className="field">
                <span>E-mail *</span>
                <input
                  type="email"
                  value={modal.email}
                  onChange={(e) => setModal({ ...modal, email: e.target.value })}
                  required
                  disabled={!!modal.id}
                />
              </label>
              <div className="field-row">
                <label className="field">
                  <span>Papel</span>
                  <select value={modal.role} onChange={(e) => setModal({ ...modal, role: e.target.value as Role })}>
                    <option value="AGENT">Atendente</option>
                    <option value="ADMIN">Administrador</option>
                  </select>
                </label>
                <label className="field">
                  <span>{modal.id ? 'Nova senha (opcional)' : 'Senha *'}</span>
                  <input
                    type="password"
                    value={modal.password}
                    onChange={(e) => setModal({ ...modal, password: e.target.value })}
                    required={!modal.id}
                    minLength={8}
                    placeholder={modal.id ? 'Deixe em branco para manter' : ''}
                  />
                </label>
              </div>
              {error && <p className="form-error">{error}</p>}
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setModal(null)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Salvando…' : modal.id ? 'Salvar' : 'Criar usuário'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
