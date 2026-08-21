import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { rolesApi, type ProfilePayload } from '../api/endpoints';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { PageHeader } from '../components/PageHeader';
import { PlusIcon, ShieldIcon, UsersIcon } from '../components/icons';
import type { AccessProfile, PermissionCatalog, PermissionDef, PermissionGroup, Permission } from '../types';

/** Perfil sendo editado no painel da direita. `id` ausente = perfil novo. */
interface Draft {
  id?: string;
  name: string;
  description: string;
  selected: Set<Permission>;
}

const draftFrom = (profile: AccessProfile): Draft => ({
  id: profile.id,
  name: profile.name,
  description: profile.description ?? '',
  // parte da lista EFETIVA: é o que a pessoa vê marcado, e o que ela desmarca
  // precisa sair de verdade (senão "ver estoque" voltaria sozinho ao salvar)
  selected: new Set(profile.effectivePermissions),
});

/**
 * Mapa `permissão → quem a arrasta junto`, derivado do catálogo.
 *
 * Serve para o inverso da implicação: ao desmarcar "ver estoque", as caixas
 * que só existem por cima dela ("editar", "ver custo") caem junto. Sem isso a
 * tela mostraria um perfil que edita o que não pode ver.
 */
function buildDependents(groups: PermissionGroup[]): Map<Permission, Permission[]> {
  const dependents = new Map<Permission, Permission[]>();
  for (const group of groups) {
    for (const def of group.permissions) {
      for (const base of def.implies ?? []) {
        dependents.set(base, [...(dependents.get(base) ?? []), def.key]);
      }
    }
  }
  return dependents;
}

export function RolesPage() {
  const { user, refreshUser } = useAuth();
  const [profiles, setProfiles] = useState<AccessProfile[]>([]);
  const [catalog, setCatalog] = useState<PermissionCatalog | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const dependents = useMemo(() => buildDependents(catalog?.groups ?? []), [catalog]);
  const defs = useMemo(() => {
    const map = new Map<Permission, PermissionDef>();
    for (const group of catalog?.groups ?? []) for (const def of group.permissions) map.set(def.key, def);
    return map;
  }, [catalog]);

  const load = async (selectId?: string) => {
    setLoading(true);
    try {
      const [list, cat] = await Promise.all([rolesApi.list(), catalog ? Promise.resolve(catalog) : rolesApi.catalog()]);
      setProfiles(list);
      setCatalog(cat);
      const target = selectId ? list.find((p) => p.id === selectId) : list[0];
      if (target) setDraft(draftFrom(target));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao carregar os perfis');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = draft?.id ? profiles.find((p) => p.id === draft.id) : undefined;
  const locked = current?.locked ?? false;

  const select = (profile: AccessProfile) => {
    setError(null);
    setNotice(null);
    setDraft(draftFrom(profile));
  };

  const startNew = (templateKey: string) => {
    const template = catalog?.templates.find((t) => t.key === templateKey);
    setError(null);
    setNotice(null);
    setDraft({
      id: undefined,
      // o nome do modelo é só sugestão: dois perfis não podem ter o mesmo nome,
      // então quem já tem "Atendente" vai renomear - por isso o campo abre focado
      name: template && template.key !== 'blank' ? template.name : '',
      description: template && template.key !== 'blank' ? template.description : '',
      selected: new Set(template?.permissions ?? []),
    });
  };

  /** Liga/desliga uma permissão levando junto as que dependem dela. */
  const toggle = (key: Permission) => {
    if (!draft || locked) return;
    const selected = new Set(draft.selected);
    if (selected.has(key)) {
      selected.delete(key);
      // cascata: quem exigia esta cai junto (e quem exigia aquelas, etc.)
      const queue = [...(dependents.get(key) ?? [])];
      while (queue.length > 0) {
        const dep = queue.shift()!;
        if (!selected.delete(dep)) continue;
        queue.push(...(dependents.get(dep) ?? []));
      }
    } else {
      selected.add(key);
      const queue = [...(defs.get(key)?.implies ?? [])];
      while (queue.length > 0) {
        const base = queue.shift()!;
        if (selected.has(base)) continue;
        selected.add(base);
        queue.push(...(defs.get(base)?.implies ?? []));
      }
    }
    setNotice(null);
    setDraft({ ...draft, selected });
  };

  const toggleGroup = (group: PermissionGroup, on: boolean) => {
    if (!draft || locked) return;
    const selected = new Set(draft.selected);
    for (const def of group.permissions) {
      if (on) {
        selected.add(def.key);
        (def.implies ?? []).forEach((b) => selected.add(b));
      } else {
        selected.delete(def.key);
        (dependents.get(def.key) ?? []).forEach((d) => selected.delete(d));
      }
    }
    setDraft({ ...draft, selected });
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    const payload: ProfilePayload = {
      name: draft.name.trim(),
      description: draft.description.trim() || undefined,
      permissions: [...draft.selected],
    };
    try {
      const saved = draft.id ? await rolesApi.update(draft.id, payload) : await rolesApi.create(payload);
      await load(saved.id);
      setNotice(draft.id ? 'Perfil atualizado.' : 'Perfil criado.');
      // o próprio usuário pode ter mudado de alçada: recarrega a sessão para o
      // menu refletir agora o que ele passa a ver
      if (user?.profile?.id === saved.id) await refreshUser();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao salvar o perfil');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!draft?.id || !current) return;
    if (!window.confirm(`Excluir o perfil "${current.name}"? Esta ação não pode ser desfeita.`)) return;
    setSaving(true);
    setError(null);
    try {
      await rolesApi.remove(draft.id);
      setDraft(null);
      await load();
      setNotice('Perfil excluído.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao excluir o perfil');
    } finally {
      setSaving(false);
    }
  };

  const granted = draft?.selected.size ?? 0;
  const total = catalog?.groups.reduce((n, g) => n + g.permissions.length, 0) ?? 0;

  return (
    <div className="dash roles-page">
      <PageHeader
        back={{ to: '/admin', label: 'Voltar à Administração' }}
        eyebrow="Administração · Perfis"
        title="Perfis & Permissões"
        subtitle="Crie perfis com o recorte de acesso de cada cargo da loja e escolha, módulo a módulo, o que cada um enxerga e pode fazer."
        actions={
          <button className="btn btn-primary" onClick={() => startNew('blank')} disabled={!catalog}>
            <PlusIcon size={16} /> Novo Perfil
          </button>
        }
      />

      <div className="roles-layout">
        {/* ── Coluna esquerda: os perfis da loja ─────────────────────────── */}
        <aside className="card roles-list">
          <div className="roles-list-head">
            <h2>Perfis da loja</h2>
            <span className="muted small">{profiles.length}</span>
          </div>

          {loading && profiles.length === 0 && (
            <div className="roles-list-items">
              {Array.from({ length: 3 }, (_, i) => (
                <span key={i} className="ds-skeleton" style={{ height: 58 }} />
              ))}
            </div>
          )}

          <div className="roles-list-items">
            {profiles.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`role-item ${draft?.id === p.id ? 'active' : ''}`}
                onClick={() => select(p)}
              >
                <span className="role-item-icon">
                  <ShieldIcon size={16} />
                </span>
                <span className="role-item-text">
                  <strong>
                    {p.name}
                    {p.systemKey && <span className="role-tag">padrão</span>}
                  </strong>
                  <span className="muted small">
                    {p.locked ? 'Acesso total' : `${p.effectivePermissions.length} de ${total} permissões`}
                  </span>
                </span>
                <span className="role-item-count" title={`${p.userCount} usuário(s) com este perfil`}>
                  <UsersIcon size={13} /> {p.userCount}
                </span>
              </button>
            ))}
          </div>

          {catalog && catalog.templates.length > 0 && (
            <div className="roles-templates">
              <p className="muted small">Criar a partir de um modelo</p>
              <div className="roles-template-chips">
                {catalog.templates
                  .filter((t) => t.key !== 'blank')
                  .map((t) => (
                    <button key={t.key} type="button" className="chip" onClick={() => startNew(t.key)} title={t.description}>
                      {t.name}
                    </button>
                  ))}
              </div>
            </div>
          )}
        </aside>

        {/* ── Coluna direita: o editor ───────────────────────────────────── */}
        {draft && catalog ? (
          <form className="card roles-editor" onSubmit={save}>
            <div className="roles-editor-head">
              <div className="field-row">
                <label className="field">
                  <span>Nome do perfil *</span>
                  <input
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    required
                    minLength={2}
                    maxLength={40}
                    disabled={locked}
                    autoFocus={!draft.id}
                    placeholder="Ex.: Gerente de vendas"
                  />
                </label>
                <label className="field">
                  <span>Descrição</span>
                  <input
                    value={draft.description}
                    onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                    maxLength={160}
                    disabled={locked}
                    placeholder="Para que serve este perfil"
                  />
                </label>
              </div>

              <div className="roles-editor-meta">
                <span className="badge">{locked ? 'Acesso total' : `${granted} de ${total} permissões`}</span>
                {current && (
                  <span className="muted small">
                    {current.userCount === 0
                      ? 'Nenhum usuário usa este perfil'
                      : `${current.userCount} ${current.userCount === 1 ? 'usuário usa' : 'usuários usam'} este perfil`}
                  </span>
                )}
              </div>
            </div>

            {locked && (
              <div className="alert alert-info">
                O perfil de Administrador tem acesso a tudo e não pode ser alterado - é ele que garante que a loja nunca
                fique sem quem administre a conta. Para dar um acesso menor a alguém, crie outro perfil.
              </div>
            )}

            <div className="perm-groups">
              {catalog.groups.map((group) => {
                const on = group.permissions.filter((d) => locked || draft.selected.has(d.key)).length;
                const all = group.permissions.length;
                return (
                  <section className="perm-group" key={group.key}>
                    <header className="perm-group-head">
                      <div>
                        <h3>{group.label}</h3>
                        <p className="muted small">{group.hint}</p>
                      </div>
                      <div className="perm-group-actions">
                        <span className="muted small">
                          {on}/{all}
                        </span>
                        {!locked && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => toggleGroup(group, on < all)}
                          >
                            {on < all ? 'Marcar tudo' : 'Limpar'}
                          </button>
                        )}
                      </div>
                    </header>

                    <div className="perm-items">
                      {group.permissions.map((def) => {
                        const checked = locked || draft.selected.has(def.key);
                        const base = (def.implies ?? [])
                          .map((k) => defs.get(k)?.label)
                          .filter(Boolean)
                          .join(', ');
                        return (
                          <label key={def.key} className={`perm-item ${checked ? 'on' : ''} ${locked ? 'locked' : ''}`}>
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={locked}
                              onChange={() => toggle(def.key)}
                            />
                            <span className="perm-item-text">
                              <strong>{def.label}</strong>
                              <span className="muted small">{def.description}</span>
                              {base && <span className="perm-item-implies">Inclui: {base}</span>}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>

            {error && <div className="alert alert-error">{error}</div>}
            {notice && <div className="alert alert-success">{notice}</div>}

            <div className="roles-editor-footer">
              <div>
                {current && !current.systemKey && (
                  <button type="button" className="btn btn-ghost danger" onClick={remove} disabled={saving}>
                    Excluir perfil
                  </button>
                )}
              </div>
              <div className="row-actions">
                {draft.id ? (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => current && select(current)}
                    disabled={saving || locked}
                  >
                    Descartar alterações
                  </button>
                ) : (
                  <button type="button" className="btn btn-ghost" onClick={() => setDraft(null)} disabled={saving}>
                    Cancelar
                  </button>
                )}
                <button type="submit" className="btn btn-primary" disabled={saving || locked}>
                  {saving ? 'Salvando…' : draft.id ? 'Salvar perfil' : 'Criar perfil'}
                </button>
              </div>
            </div>
          </form>
        ) : (
          <div className="card roles-empty">
            <ShieldIcon size={28} />
            <h2>Escolha um perfil</h2>
            <p className="muted">
              Selecione um perfil à esquerda para ver e ajustar o que ele libera, ou crie um novo a partir de um modelo.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
