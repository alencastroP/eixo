import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { rolesApi, usersApi } from '../api/endpoints';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { PageHeader } from '../components/PageHeader';
import { PlusIcon } from '../components/icons';
import { ROLE_LABELS, type AccessProfile, type UserListItem } from '../types';
import { avatarColor, initials } from '../utils/format';

interface EditState {
  id?: string;
  name: string;
  email: string;
  profileId: string;
  password: string;
}

const BLANK: EditState = { name: '', email: '', profileId: '', password: '' };

export function UsersPage() {
  const { user: me, can } = useAuth();
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [profiles, setProfiles] = useState<AccessProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([usersApi.list(), rolesApi.list().catch(() => [] as AccessProfile[])])
      .then(([list, profileList]) => {
        setUsers(list);
        setProfiles(profileList);
      })
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  /** Padrão do formulário: o perfil menos abrangente que a loja tem. */
  const defaultProfileId = () =>
    profiles.find((p) => p.systemKey === 'agent')?.id ?? profiles.find((p) => !p.locked)?.id ?? '';

  const openNew = () => {
    setError(null);
    setModal({ ...BLANK, profileId: defaultProfileId() });
  };
  const openEdit = (u: UserListItem) => {
    setError(null);
    setModal({ id: u.id, name: u.name, email: u.email, profileId: u.profile?.id ?? defaultProfileId(), password: '' });
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
          profileId: modal.profileId || undefined,
          password: modal.password || undefined,
        });
      } else {
        await usersApi.create({
          name: modal.name,
          email: modal.email,
          password: modal.password,
          profileId: modal.profileId || undefined,
        });
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
    setError(null);
    try {
      await usersApi.update(u.id, { active: !u.active });
      load();
    } catch (err) {
      // a API barra revogar a última pessoa que administra a conta
      setError(err instanceof ApiError ? err.message : 'Falha ao alterar o acesso');
    }
  };

  return (
    <div className="dash settings-page users-page">
      <PageHeader
        back={{ to: '/admin', label: 'Voltar à Administração' }}
        eyebrow="Administração · Usuários"
        title="Gerenciar Usuários"
        subtitle="Crie, edite ou revogue o acesso dos funcionários da loja."
        actions={
          <>
            {can('profiles.manage') && (
              <Link className="btn btn-ghost" to="/roles">
                Perfis & Permissões
              </Link>
            )}
            <button className="btn btn-primary" onClick={openNew}>
              <PlusIcon size={16} /> Novo Usuário
            </button>
          </>
        }
      />

      {error && !modal && <div className="alert alert-error">{error}</div>}

      <div className="card table-wrap">
        <table className="fin-table users-table ds-table-cards">
          <thead>
            <tr>
              <th>Funcionário</th>
              <th>E-mail</th>
              <th>Perfil de acesso</th>
              <th>Status</th>
              <th className="right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td className="ds-cell-title">
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
                <td className="muted" data-label="E-mail">
                  {u.email}
                </td>
                <td data-label="Perfil de acesso">
                  <span className={`badge ${u.role === 'ADMIN' ? 'role-admin' : 'role-agent'}`}>
                    {u.profile?.name ?? ROLE_LABELS[u.role]}
                  </span>
                </td>
                <td data-label="Status">
                  <span className={`badge ${u.active ? 'fin-PAID' : 'fin-OVERDUE'}`}>{u.active ? 'Ativo' : 'Revogado'}</span>
                </td>
                <td className="right ds-cell-actions">
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
            {loading &&
              users.length === 0 &&
              Array.from({ length: 3 }, (_, i) => (
                <tr key={`sk-${i}`} aria-hidden="true">
                  <td colSpan={5} className="ds-skeleton-row">
                    <span className="ds-skeleton" style={{ height: 18 }} />
                  </td>
                </tr>
              ))}
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
                  <span>Perfil de acesso</span>
                  <select
                    value={modal.profileId}
                    onChange={(e) => setModal({ ...modal, profileId: e.target.value })}
                  >
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
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
              <p className="muted small">
                O perfil define o que a pessoa enxerga e pode fazer.{' '}
                {can('profiles.manage') && <Link to="/roles">Configurar perfis</Link>}
              </p>
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
