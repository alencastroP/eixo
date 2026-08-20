import { useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '../api/client';
import { agentApi } from '../api/endpoints';
import type { AgentProfileConfig, FlowPolicyConfig, KnowledgeDoc } from '../types';

/**
 * Configuração do Agente de IA e do motor de fluxo, por loja.
 *
 * Três blocos que respondem a perguntas diferentes:
 *  Persona      — como o agente fala e o que ele pode fazer;
 *  Conhecimento — o que ele sabe sobre esta loja;
 *  Fluxo        — o que acontece quando o cliente some.
 */

type Tab = 'persona' | 'conhecimento' | 'fluxo';

const minutesLabel = (min: number) => {
  if (min < 60) return `${min} min`;
  if (min < 1440) return `${Math.round((min / 60) * 10) / 10} h`.replace('.0', '');
  return `${Math.round((min / 1440) * 10) / 10} dia(s)`.replace('.0', '');
};

export function AgentConfigPage() {
  const [tab, setTab] = useState<Tab>('persona');
  const [profile, setProfile] = useState<AgentProfileConfig | null>(null);
  const [flow, setFlow] = useState<FlowPolicyConfig | null>(null);
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [usage, setUsage] = useState({ chars: 0, budgetChars: 1 });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const flash = (msg: string) => {
    setSaved(msg);
    setTimeout(() => setSaved(null), 2500);
  };
  const fail = (err: unknown, fallback: string) =>
    setError(err instanceof ApiError ? err.message : fallback);

  const loadKnowledge = async () => {
    const res = await agentApi.listKnowledge();
    setDocs(res.docs);
    setUsage({ chars: res.chars, budgetChars: res.budgetChars });
  };

  useEffect(() => {
    Promise.all([agentApi.getProfile(), agentApi.getFlow(), agentApi.listKnowledge()])
      .then(([p, f, k]) => {
        setProfile(p);
        setFlow(f);
        setDocs(k.docs);
        setUsage({ chars: k.chars, budgetChars: k.budgetChars });
      })
      .catch((err) => fail(err, 'Falha ao carregar a configuração'));
  }, []);

  // ─── Persona ──────────────────────────────────────────────────────────────
  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setBusy(true);
    setError(null);
    try {
      setProfile(await agentApi.saveProfile({
        enabled: profile.enabled,
        storeName: profile.storeName || null,
        persona: profile.persona || null,
        rules: profile.rules || null,
        canSearchInventory: profile.canSearchInventory,
        canQuoteCredit: profile.canQuoteCredit,
        canScheduleVisit: profile.canScheduleVisit,
      }));
      flash('Persona salva.');
    } catch (err) {
      fail(err, 'Falha ao salvar');
    } finally {
      setBusy(false);
    }
  };

  // ─── Conhecimento ─────────────────────────────────────────────────────────
  const [newDoc, setNewDoc] = useState({ title: '', content: '' });

  const addDoc = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await agentApi.createDoc(newDoc);
      setNewDoc({ title: '', content: '' });
      await loadKnowledge();
      flash('Documento adicionado.');
    } catch (err) {
      fail(err, 'Falha ao adicionar');
    } finally {
      setBusy(false);
    }
  };

  const toggleDoc = async (doc: KnowledgeDoc) => {
    try {
      await agentApi.updateDoc(doc.id, { enabled: !doc.enabled });
      await loadKnowledge();
    } catch (err) {
      fail(err, 'Falha ao atualizar');
    }
  };

  const removeDoc = async (doc: KnowledgeDoc) => {
    if (!window.confirm(`Remover "${doc.title}" da base de conhecimento?`)) return;
    try {
      await agentApi.removeDoc(doc.id);
      await loadKnowledge();
      flash('Documento removido.');
    } catch (err) {
      fail(err, 'Falha ao remover');
    }
  };

  // ─── Fluxo ────────────────────────────────────────────────────────────────
  const saveFlow = async (e: FormEvent) => {
    e.preventDefault();
    if (!flow) return;
    setBusy(true);
    setError(null);
    try {
      const res = await agentApi.saveFlow(flow);
      setFlow(res);
      flash(`Fluxo salvo. ${res.ticketsReprogramados} atendimento(s) reprogramado(s).`);
    } catch (err) {
      fail(err, 'Falha ao salvar');
    } finally {
      setBusy(false);
    }
  };

  const setDelay = (index: number, value: number) => {
    if (!flow) return;
    const next = [...flow.followUpDelaysMin];
    next[index] = value;
    setFlow({ ...flow, followUpDelaysMin: next });
  };

  const addDelay = () => {
    if (!flow || flow.followUpDelaysMin.length >= 5) return;
    const last = flow.followUpDelaysMin[flow.followUpDelaysMin.length - 1] ?? 30;
    setFlow({ ...flow, followUpDelaysMin: [...flow.followUpDelaysMin, last * 4] });
  };

  const removeDelay = (index: number) => {
    if (!flow || flow.followUpDelaysMin.length <= 1) return;
    setFlow({ ...flow, followUpDelaysMin: flow.followUpDelaysMin.filter((_, i) => i !== index) });
  };

  if (!profile || !flow) {
    return <div className="page"><p className="muted">Carregando…</p></div>;
  }

  const pct = Math.min(100, Math.round((usage.chars / usage.budgetChars) * 100));

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Agente de IA</h1>
          <p className="muted">Como o agente fala, o que ele sabe e o que acontece quando o cliente some.</p>
        </div>
      </header>

      {error && <div className="alert error">{error}</div>}
      {saved && <div className="alert ok">{saved}</div>}

      <nav className="tabs">
        <button className={tab === 'persona' ? 'active' : ''} onClick={() => setTab('persona')}>Persona</button>
        <button className={tab === 'conhecimento' ? 'active' : ''} onClick={() => setTab('conhecimento')}>
          Conhecimento <span className="tab-count">{docs.length}</span>
        </button>
        <button className={tab === 'fluxo' ? 'active' : ''} onClick={() => setTab('fluxo')}>Fluxo</button>
      </nav>

      {/* ─── Persona ─────────────────────────────────────────────────────── */}
      {tab === 'persona' && (
        <form className="card form-card" onSubmit={saveProfile}>
          <label className="switch-row">
            <input
              type="checkbox"
              checked={profile.enabled}
              onChange={(e) => setProfile({ ...profile, enabled: e.target.checked })}
            />
            <span>
              <strong>Agente ativo</strong>
              <span className="muted small">Desligado, todo atendimento fica 100% humano.</span>
            </span>
          </label>

          <label>
            Nome da loja como o agente se refere a ela
            <input
              value={profile.storeName ?? ''}
              onChange={(e) => setProfile({ ...profile, storeName: e.target.value })}
              placeholder="ex.: a Washington Veículos"
            />
          </label>

          <label>
            Tom de voz
            <textarea
              rows={3}
              value={profile.persona ?? ''}
              onChange={(e) => setProfile({ ...profile, persona: e.target.value })}
              placeholder="ex.: Consultivo e direto, sem formalidade excessiva. Trata o cliente por você."
            />
            <span className="muted small">Uma ou duas frases sobre como o agente deve soar.</span>
          </label>

          <label>
            Regras comerciais desta loja
            <textarea
              rows={6}
              value={profile.rules ?? ''}
              onChange={(e) => setProfile({ ...profile, rules: e.target.value })}
              placeholder={'ex.:\n- Nunca prometer entrega em menos de 5 dias úteis.\n- Só falar de troca depois de saber o modelo e o ano do carro do cliente.'}
            />
            <span className="muted small">
              Entram no prompt com a mesma força das regras invioláveis. Uma por linha.
            </span>
          </label>

          <fieldset className="capabilities">
            <legend>O que o agente pode fazer</legend>
            <label className="switch-row">
              <input
                type="checkbox"
                checked={profile.canSearchInventory}
                onChange={(e) => setProfile({ ...profile, canSearchInventory: e.target.checked })}
              />
              <span>
                <strong>Consultar o estoque</strong>
                <span className="muted small">
                  Responde sobre disponibilidade, preço, ano e km a partir do seu pátio. Desligado, ele
                  encaminha essas perguntas ao vendedor.
                </span>
              </span>
            </label>
            <label className="switch-row">
              <input
                type="checkbox"
                checked={profile.canQuoteCredit}
                onChange={(e) => setProfile({ ...profile, canQuoteCredit: e.target.checked })}
              />
              <span>
                <strong>Simular crédito</strong>
                <span className="muted small">Só quando o cliente oferece o CPF espontaneamente.</span>
              </span>
            </label>
            <label className="switch-row">
              <input
                type="checkbox"
                checked={profile.canScheduleVisit}
                onChange={(e) => setProfile({ ...profile, canScheduleVisit: e.target.checked })}
              />
              <span>
                <strong>Registrar interesse de visita</strong>
                <span className="muted small">Avisa a equipe; quem confirma o horário é um vendedor.</span>
              </span>
            </label>
          </fieldset>

          <div className="form-actions">
            <button className="btn btn-primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar persona'}</button>
          </div>
        </form>
      )}

      {/* ─── Conhecimento ────────────────────────────────────────────────── */}
      {tab === 'conhecimento' && (
        <>
          <div className="card knowledge-meter">
            <div className="meter-head">
              <strong>{docs.filter((d) => d.enabled).length} documento(s) ativo(s)</strong>
              <span className="mono small">{usage.chars.toLocaleString('pt-BR')} / {usage.budgetChars.toLocaleString('pt-BR')} caracteres</span>
            </div>
            <div className="meter-bar"><div className="meter-fill" style={{ width: `${pct}%` }} /></div>
            <p className="muted small">
              {profile.knowledge.mode === 'injected' ? (
                <>
                  Modo <strong>completo</strong>: todo o conteúdo vai junto em cada conversa, então o agente
                  enxerga tudo. É o melhor resultado — e o que cabe até o limite acima.
                </>
              ) : (
                <>
                  Modo <strong>busca</strong>: o conteúdo passou do limite, então o agente pesquisa os trechos
                  relevantes a cada pergunta. Funciona, mas pode não achar o trecho certo. Se quiser voltar ao
                  modo completo, enxugue ou desative documentos.
                </>
              )}
            </p>
          </div>

          <form className="card form-card" onSubmit={addDoc}>
            <h3>Adicionar documento</h3>
            <label>
              Título
              <input
                value={newDoc.title}
                onChange={(e) => setNewDoc({ ...newDoc, title: e.target.value })}
                placeholder="ex.: Garantia"
                required
              />
            </label>
            <label>
              Conteúdo
              <textarea
                rows={5}
                value={newDoc.content}
                onChange={(e) => setNewDoc({ ...newDoc, content: e.target.value })}
                placeholder="ex.: Todos os veículos saem com 3 meses de garantia de motor e câmbio. Não cobre itens de desgaste."
                required
              />
            </label>
            <div className="form-actions">
              <button className="btn btn-primary" disabled={busy}>Adicionar</button>
            </div>
          </form>

          <div className="doc-list">
            {docs.length === 0 && (
              <p className="muted">
                Nenhum documento ainda. Comece pelo que os clientes mais perguntam: garantia,
                financiamento, avaliação do usado, documentação e horários.
              </p>
            )}
            {docs.map((doc) => (
              <article className={`card doc-item ${doc.enabled ? '' : 'off'}`} key={doc.id}>
                <header>
                  <strong>{doc.title}</strong>
                  <div className="doc-actions">
                    <button className="btn btn-ghost btn-sm" onClick={() => toggleDoc(doc)}>
                      {doc.enabled ? 'Desativar' : 'Ativar'}
                    </button>
                    <button className="btn btn-ghost btn-sm danger-ghost" onClick={() => removeDoc(doc)}>
                      Remover
                    </button>
                  </div>
                </header>
                <p className="doc-body">{doc.content}</p>
              </article>
            ))}
          </div>
        </>
      )}

      {/* ─── Fluxo ───────────────────────────────────────────────────────── */}
      {tab === 'fluxo' && (
        <form className="card form-card" onSubmit={saveFlow}>
          <label className="switch-row">
            <input
              type="checkbox"
              checked={flow.enabled}
              onChange={(e) => setFlow({ ...flow, enabled: e.target.checked })}
            />
            <span>
              <strong>Automação de tempo ativa</strong>
              <span className="muted small">
                Desligada, nada é enviado automaticamente. Ligue só quando os tempos abaixo estiverem
                do jeito que você quer — a partir daí o sistema fala com clientes em nome da loja.
              </span>
            </span>
          </label>

          <fieldset>
            <legend>Quando o cliente para de responder</legend>
            <p className="muted small">
              Contado a partir da última mensagem do cliente. Cada degrau é uma tentativa de retomada.
            </p>
            {flow.followUpDelaysMin.map((min, i) => (
              <div className="delay-row" key={i}>
                <span className="delay-label">{i + 1}ª retomada</span>
                <input
                  type="number"
                  min={5}
                  max={20160}
                  value={min}
                  onChange={(e) => setDelay(i, Number(e.target.value))}
                />
                <span className="muted small">minutos · {minutesLabel(min)}</span>
                {flow.followUpDelaysMin.length > 1 && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeDelay(i)}>
                    Remover
                  </button>
                )}
              </div>
            ))}
            {flow.followUpDelaysMin.length < 5 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={addDelay}>
                + Adicionar degrau
              </button>
            )}
          </fieldset>

          <label>
            Encerrar o atendimento após
            <div className="inline-field">
              <input
                type="number"
                min={60}
                max={129600}
                value={flow.autoCloseAfterMin}
                onChange={(e) => setFlow({ ...flow, autoCloseAfterMin: Number(e.target.value) })}
              />
              <span className="muted small">minutos de silêncio · {minutesLabel(flow.autoCloseAfterMin)}</span>
            </div>
            <span className="muted small">
              O atendimento é marcado como perdido, com o motivo registrado. Se o cliente escrever depois,
              a conversa volta a ficar ativa.
            </span>
          </label>

          <fieldset>
            <legend>Horário em que nada é enviado</legend>
            <div className="inline-field">
              <span className="muted small">das</span>
              <input
                type="number" min={0} max={23}
                value={flow.quietHoursStart}
                onChange={(e) => setFlow({ ...flow, quietHoursStart: Number(e.target.value) })}
              />
              <span className="muted small">h às</span>
              <input
                type="number" min={0} max={23}
                value={flow.quietHoursEnd}
                onChange={(e) => setFlow({ ...flow, quietHoursEnd: Number(e.target.value) })}
              />
              <span className="muted small">h</span>
            </div>
            <label className="switch-row">
              <input
                type="checkbox"
                checked={flow.businessDaysOnly}
                onChange={(e) => setFlow({ ...flow, businessDaysOnly: e.target.checked })}
              />
              <span>Não enviar em sábados e domingos</span>
            </label>
            <span className="muted small">
              Mensagem vencida dentro da janela não é perdida — ela espera e sai no primeiro horário liberado.
            </span>
          </fieldset>

          <label>
            SLA de primeira resposta da equipe
            <div className="inline-field">
              <input
                type="number" min={5} max={10080}
                value={flow.slaFirstResponseMin}
                onChange={(e) => setFlow({ ...flow, slaFirstResponseMin: Number(e.target.value) })}
              />
              <span className="muted small">minutos · {minutesLabel(flow.slaFirstResponseMin)}</span>
            </div>
            <span className="muted small">
              Este é o outro lado do fluxo: quando é o <strong>cliente</strong> que está esperando a loja,
              ninguém recebe mensagem automática — o atendimento sobe para urgente e a equipe é alertada.
            </span>
          </label>

          <label>
            Texto das retomadas
            <select
              value={flow.followUpMode}
              onChange={(e) => setFlow({ ...flow, followUpMode: e.target.value as 'ai' | 'template' })}
            >
              <option value="ai">Escrito pela IA a partir da conversa</option>
              <option value="template">Texto fixo</option>
            </select>
            <span className="muted small">
              A IA retoma o assunto concreto (o carro, a dúvida que ficou). O texto fixo é gratuito, mas
              soa genérico.
            </span>
          </label>

          <div className="form-actions">
            <button className="btn btn-primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar fluxo'}</button>
          </div>
        </form>
      )}
    </div>
  );
}
