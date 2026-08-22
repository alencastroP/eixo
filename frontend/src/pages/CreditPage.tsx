import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { creditApi, leadsApi } from '../api/endpoints';
import { ApiError } from '../api/client';
import { PageHeader } from '../components/PageHeader';
import { LinkLeadModal } from '../components/LinkLeadModal';
import { ScoreGauge } from '../components/ScoreGauge';
import {
  AlertIcon,
  CheckIcon,
  CoinsIcon,
  FileTextIcon,
  HistoryIcon,
  InfoIcon,
  LinkIcon,
  SearchDataIcon,
  SearchIcon,
  ShieldIcon,
  TrendUpIcon,
  UserIcon,
} from '../components/icons';
import type { CreditQuery, LeadSearchResult, ScoreBand, UsageStatus } from '../types';
import { formatBRL, formatDateTime, formatDocumentInput, formatPhone, timeAgo } from '../utils/format';
import { documentState, onlyDigits } from '../utils/document';

/** Canais aceitos para o registro do consentimento (legal/09 §8.1). */
const CONSENT_SOURCES: { value: string; label: string }[] = [
  { value: 'presencial', label: 'Presencial' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'site', label: 'Site / chat' },
  { value: 'telefone', label: 'Telefone' },
];

/** Campo que o envio precisa devolver o foco quando a validação barra. */
type FormField = 'lead' | 'document' | 'consent';

/**
 * Cabeçalho numerado de cada etapa. O número vira um check assim que a etapa
 * está satisfeita: a consulta tem três pré-requisitos legais e o operador
 * precisa ver de relance qual ainda falta.
 */
function StepHead({ n, done, title, hint }: { n: number; done: boolean; title: string; hint?: string }) {
  return (
    <div className="credit-step-head">
      <span className={`credit-step-num ${done ? 'done' : ''}`} aria-hidden="true">
        {done ? <CheckIcon size={13} /> : n}
      </span>
      <span className="credit-step-text">
        <span className="credit-step-title">{title}</span>
        {hint && <span className="credit-step-hint">{hint}</span>}
      </span>
    </div>
  );
}

const BAND_CLASS: Record<ScoreBand, string> = {
  HIGH_RISK: 'band-high',
  MEDIUM_RISK: 'band-medium',
  LOW_RISK: 'band-low',
};

/** Item de restrição com badge semântico (verde quando zero, vermelho/âmbar quando há). */
function RestrictionRow({ label, count, amber }: { label: string; count: number; amber?: boolean }) {
  const clean = count === 0;
  return (
    <div className="restriction-row">
      <span className={`restriction-icon ${clean ? 'ok' : amber ? 'warn' : 'bad'}`}>
        {clean ? <CheckIcon size={15} /> : <AlertIcon size={15} />}
      </span>
      <span className="restriction-label">{label}</span>
      <span className={`restriction-badge ${clean ? 'ok' : amber ? 'warn' : 'bad'}`}>
        {clean ? 'Nenhuma' : count === 1 ? '1 ocorrência' : `${count} ocorrências`}
      </span>
    </div>
  );
}

export function CreditPage() {
  const [docInput, setDocInput] = useState('');
  /** true enquanto o documento veio do cadastro do lead e não da digitação -
   *  só um valor autopreenchido pode ser trocado ao mudar de titular. */
  const [docAutofilled, setDocAutofilled] = useState(false);
  const [result, setResult] = useState<CreditQuery | null>(null);
  const [recent, setRecent] = useState<CreditQuery[]>([]);
  const [quota, setQuota] = useState<UsageStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<FormField | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);

  // Titular da consulta - obrigatório: sem lead não há como registrar quem
  // autorizou (legal/09-CONSENTIMENTO-CONSULTA-DE-CREDITO.md §6.3).
  const [leadTerm, setLeadTerm] = useState('');
  const [leadResults, setLeadResults] = useState<LeadSearchResult[]>([]);
  const [leadSearching, setLeadSearching] = useState(false);
  const [leadFailed, setLeadFailed] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [selectedLead, setSelectedLead] = useState<LeadSearchResult | null>(null);
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [consentSource, setConsentSource] = useState('presencial');

  const leadInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const consentRef = useRef<HTMLInputElement>(null);

  const loadRecent = useCallback(() => {
    creditApi
      .recent()
      .then(setRecent)
      .catch(() => setRecent([]));
  }, []);

  /** Saldo do mês: a consulta é tarifada, então o custo aparece antes do clique. */
  const loadQuota = useCallback(() => {
    creditApi
      .quota()
      .then(setQuota)
      .catch(() => setQuota(null));
  }, []);

  useEffect(() => {
    loadRecent();
    loadQuota();
  }, [loadRecent, loadQuota]);

  useEffect(() => {
    if (selectedLead || !leadTerm.trim()) {
      setLeadResults([]);
      return;
    }
    let cancelled = false;
    setLeadSearching(true);
    setLeadFailed(false);
    const t = setTimeout(() => {
      leadsApi
        .search(leadTerm.trim())
        .then((r) => {
          if (cancelled) return;
          setLeadResults(r);
          setActiveIdx(0);
        })
        .catch(() => {
          if (cancelled) return;
          setLeadResults([]);
          setLeadFailed(true);
        })
        .finally(() => !cancelled && setLeadSearching(false));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [leadTerm, selectedLead]);

  const docState = useMemo(() => documentState(docInput), [docInput]);

  /** Mesmo documento consultado há pouco: abrir o relatório arquivado entrega
   *  o mesmo dado sem queimar outra consulta tarifada. */
  const duplicate = useMemo(() => {
    if (docState.status !== 'valid') return null;
    return recent.find((q) => onlyDigits(q.report.document) === docState.digits) ?? null;
  }, [docState, recent]);

  const quotaExhausted = quota?.exceeded === true;
  const listboxOpen = !selectedLead && leadResults.length > 0;

  const pickLead = (lead: LeadSearchResult) => {
    setSelectedLead(lead);
    setLeadResults([]);
    setError(null);
    setErrorField(null);
    // O documento do cadastro entra sozinho; digitação do operador tem precedência.
    if (lead.document && (!docInput || docAutofilled)) {
      setDocInput(formatDocumentInput(lead.document));
      setDocAutofilled(true);
    }
  };

  const clearLead = () => {
    setSelectedLead(null);
    setConsentConfirmed(false);
    setLeadTerm('');
    if (docAutofilled) {
      setDocInput('');
      setDocAutofilled(false);
    }
  };

  /** Navegação por teclado no combobox de titular (setas, Enter, Esc). */
  const onLeadKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setLeadTerm('');
      setLeadResults([]);
      return;
    }
    if (!listboxOpen) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % leadResults.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => (i - 1 + leadResults.length) % leadResults.length);
    } else if (e.key === 'Enter') {
      e.preventDefault(); // o Enter escolhe o titular, não envia o formulário
      const lead = leadResults[activeIdx];
      if (lead) pickLead(lead);
    }
  };

  const fail = (field: FormField, message: string, focus: HTMLElement | null) => {
    setError(message);
    setErrorField(field);
    focus?.focus();
  };

  const runQuery = async (e: FormEvent) => {
    e.preventDefault();
    // A ordem das checagens é a ordem das etapas na tela: assim o foco sempre
    // anda para frente, nunca volta a um campo que o operador já resolveu.
    if (!selectedLead) {
      fail('lead', 'Selecione o lead/cliente desta consulta.', leadInputRef.current);
      return;
    }
    if (docState.status === 'empty' || docState.status === 'incomplete') {
      fail('document', 'Informe um CPF (11 dígitos) ou CNPJ (14 dígitos).', docInputRef.current);
      return;
    }
    if (docState.status === 'invalid') {
      fail(
        'document',
        `${docState.docType} inválido - os dígitos verificadores não conferem. Confira o número com o cliente.`,
        docInputRef.current,
      );
      return;
    }
    if (!consentConfirmed) {
      fail('consent', 'Confirme que o cliente foi informado e autorizou a consulta.', consentRef.current);
      return;
    }
    setLoading(true);
    setError(null);
    setErrorField(null);
    try {
      const q = await creditApi.query(docInput, {
        leadId: selectedLead.id,
        consentConfirmed,
        consentSource,
      });
      setResult(q);
      loadRecent();
      loadQuota();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha na consulta');
      setErrorField(null);
      // A franquia pode ter estourado nesta chamada - reflete o saldo real.
      loadQuota();
    } finally {
      setLoading(false);
    }
  };

  const openReport = async (id: string) => {
    setLoading(true);
    setError(null);
    setErrorField(null);
    try {
      setResult(await creditApi.get(id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao abrir relatório');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setResult(null);
    setDocInput('');
    setDocAutofilled(false);
    setError(null);
    setErrorField(null);
    setSelectedLead(null);
    setLeadTerm('');
    setConsentConfirmed(false);
    loadRecent();
    loadQuota();
  };

  // ─── Tela 2: painel de diagnóstico ───
  if (result) {
    const r = result.report;
    return (
      <div className="dash credit-page">
        <PageHeader
          icon={<ShieldIcon size={19} />}
          eyebrow="Análise de Crédito"
          title={r.name}
          subtitle={`${r.docType} ${r.document} · consultado em ${formatDateTime(r.queriedAt)}${
            r.protocol ? ` · protocolo ${r.protocol}` : ''
          }`}
          actions={
            <button className="btn btn-ghost btn-sm" onClick={reset}>
              <SearchDataIcon size={15} /> Nova consulta
            </button>
          }
        />

        <div className="credit-report" id="credit-report">
          {r.source === 'mock' && (
            <div className="alert alert-warning credit-simulated-banner">
              <AlertIcon size={14} /> <strong>Resultado simulado</strong> - sem consulta a bureau de crédito. Não
              tem validade para decisão de crédito. Não apresente como análise real.
            </div>
          )}

          {/* O bureau devolveu score sem confirmar o titular: o nome no
              cabeçalho é o do nosso cadastro, e isso não pode passar por
              identificação conferida. */}
          {r.source !== 'mock' && r.nameConfirmed === false && (
            <div className="alert alert-info">
              <InfoIcon size={14} /> O bureau não retornou o nome do titular. O nome exibido é o do cadastro da loja
              e <strong>não foi conferido</strong> na base consultada.
            </div>
          )}

          {result.lead && (
            <div className="alert alert-info credit-linked">
              <LinkIcon size={14} /> Vinculado ao lead <strong>{result.lead.name}</strong>
            </div>
          )}

          <div className="credit-grid">
            {/* BLOCO 1 - Velocímetro */}
            <section className="panel gauge-panel">
              <div className="panel-header">
                <h2>Score de Crédito</h2>
              </div>
              <div className="gauge-wrap">
                <ScoreGauge score={r.score} band={r.band} />
                <div className="gauge-readout">
                  <span className={`gauge-score ${BAND_CLASS[r.band]}`}>{r.score}</span>
                  <span className="gauge-band">{r.bandLabel}</span>
                </div>
                <p className="gauge-headline">{r.headline}</p>
              </div>
            </section>

            {/* BLOCO 2 - Restrições */}
            <section className="panel restrictions-panel">
              <div className="panel-header">
                <h2>Saúde Financeira</h2>
                <span className={`badge ${r.restrictions.hasRestrictions ? 'credit-pill-bad' : 'credit-pill-ok'}`}>
                  {r.restrictions.hasRestrictions ? 'Restrições ativas' : 'Sem restrições'}
                </span>
              </div>

              <div className="restrictions-list">
                <RestrictionRow label="Protestos" count={r.restrictions.protests} />
                <RestrictionRow label="Negativações" count={r.restrictions.negativacoes} />
                <RestrictionRow label="Cheques sem fundo" count={r.restrictions.badChecks} amber />
                <RestrictionRow label="Ações judiciais" count={r.restrictions.judicialActions} />
              </div>

              {r.restrictions.totalAmount > 0 && (
                <div className="restrictions-total">
                  <span>Valor total em pendências</span>
                  <strong className="band-high">{formatBRL(r.restrictions.totalAmount)}</strong>
                </div>
              )}

              {/* Fecho do painel: a leitura de uma linha, com a hora real da apuração. */}
              <div className={`credit-verdict ${r.restrictions.hasRestrictions ? 'bad' : 'ok'}`}>
                <span className="credit-verdict-icon">
                  {r.restrictions.hasRestrictions ? <AlertIcon size={15} /> : <CheckIcon size={15} />}
                </span>
                <div>
                  <strong>
                    {r.restrictions.hasRestrictions ? 'Pendências em aberto' : 'Nenhuma pendência em aberto'}
                  </strong>
                  <span className="credit-verdict-meta">apurado em {formatDateTime(r.queriedAt)}</span>
                </div>
              </div>

              {r.company && (
                <div className={`company-status ${r.company.active ? 'active' : 'inactive'}`}>
                  <span className="company-icon">{r.company.active ? <CheckIcon size={15} /> : <AlertIcon size={15} />}</span>
                  <div>
                    <strong>{r.company.situation}</strong>
                    <span className="muted small">Empresa aberta em {r.company.openedYear}</span>
                  </div>
                </div>
              )}
            </section>

            {/* BLOCO 3 - Estimativa de crédito */}
            <section className="panel credit-estimate-panel">
              <div className="panel-header">
                <h2>Potencial de Compra</h2>
                <CoinsIcon size={17} />
              </div>

              <div className="credit-limit">
                <span className="credit-limit-label">Limite de financiamento estimado</span>
                <span className="credit-limit-value">{r.credit.limit > 0 ? formatBRL(r.credit.limit) : 'Não liberado'}</span>
              </div>

              {r.credit.limit > 0 && (
                <div className="credit-detail-row">
                  <TrendUpIcon size={15} />
                  <span>Parcela estimada em 48x: <strong>{formatBRL(r.credit.installmentEstimate)}</strong></span>
                </div>
              )}

              <div
                className={`down-payment ${
                  r.credit.downPaymentPct === 0 ? 'ok' : r.credit.downPaymentPct <= 20 ? 'warn' : 'bad'
                }`}
              >
                <span className="down-payment-pct">{r.credit.downPaymentPct}%</span>
                <span className="down-payment-label">{r.credit.downPaymentLabel}</span>
              </div>
            </section>
          </div>

          {/* CTAs de rodapé */}
          <div className="credit-actions no-print">
            <button className="btn btn-ghost" onClick={() => setLinkOpen(true)}>
              <LinkIcon size={16} /> {result.lead ? 'Alterar vínculo' : 'Vincular a um Lead/Cliente'}
            </button>
            <button
              className="btn btn-ghost"
              title="Módulo de financiamento em desenvolvimento"
              onClick={() =>
                window.alert('O módulo de Financiamento ainda não está disponível. Os dados do cliente serão pré-carregados quando ele for lançado.')
              }
            >
              <CoinsIcon size={16} /> Iniciar Proposta de Financiamento
            </button>
            <button className="btn btn-primary" onClick={() => window.print()}>
              <FileTextIcon size={16} /> Exportar Relatório em PDF
            </button>
          </div>
        </div>

        {linkOpen && (
          <LinkLeadModal
            queryId={result.id}
            onClose={() => setLinkOpen(false)}
            onLinked={(updated) => {
              setResult(updated);
              loadRecent();
            }}
          />
        )}
      </div>
    );
  }

  // ─── Tela 1: busca ───
  return (
    <div className="dash credit-page">
      <PageHeader
        icon={<ShieldIcon size={19} />}
        eyebrow="Análise de Crédito"
        title="Consulta de Bureau"
        subtitle="Valide score, restrições e crédito liberado por CPF ou CNPJ."
      />

      <div className="credit-search-wrap">
        <form className="credit-search credit-form" onSubmit={runQuery} noValidate>
          <div className="credit-form-head">
            <span className="credit-search-badge">
              <SearchDataIcon size={24} />
            </span>
            <div>
              <h2 className="credit-search-title">Consultar perfil de crédito</h2>
              <p className="credit-search-hint">
                Cada consulta é tarifada e fica registrada com o titular, o canal e a data da autorização.
              </p>
            </div>
            {quota && (
              <span
                className={`credit-quota ${quota.exceeded ? 'bad' : quota.remaining !== null && quota.remaining <= 3 ? 'warn' : ''}`}
                title="Franquia de consultas do plano no mês corrente"
              >
                <CoinsIcon size={13} />
                {quota.quota === null
                  ? `${quota.used} no mês · sem limite`
                  : `${quota.remaining} de ${quota.quota} restantes no mês`}
              </span>
            )}
          </div>

          {quotaExhausted && (
            <div className="alert alert-warning">
              <AlertIcon size={14} /> A franquia de consultas deste mês acabou. Mude de plano em{' '}
              <strong>Administração › Pagamentos</strong> para liberar novas consultas.
            </div>
          )}

          {/* ── Etapa 1 · titular ── */}
          <section className="credit-step">
            <StepHead
              n={1}
              done={!!selectedLead}
              title="Titular da consulta"
              hint="Quem autorizou. Obrigatório para registrar o consentimento."
            />
            {selectedLead ? (
              <div className="lead-result lead-result-picked">
                <span className="lead-avatar" aria-hidden="true">
                  <UserIcon size={15} />
                </span>
                <span className="lead-result-info">
                  <span className="lead-result-name">{selectedLead.name}</span>
                  <span className="lead-result-contact muted small">
                    {formatPhone(selectedLead.phone) ?? selectedLead.email ?? 'sem contato'}
                  </span>
                </span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={clearLead}>
                  Trocar
                </button>
              </div>
            ) : (
              <>
                <div className={`inbox-search link-search ${errorField === 'lead' ? 'has-error' : ''}`}>
                  <SearchIcon size={15} />
                  <input
                    autoFocus
                    id="credit-lead"
                    ref={leadInputRef}
                    role="combobox"
                    aria-expanded={listboxOpen}
                    aria-controls="credit-lead-results"
                    aria-autocomplete="list"
                    aria-invalid={errorField === 'lead'}
                    aria-activedescendant={
                      listboxOpen && leadResults[activeIdx] ? `credit-lead-opt-${leadResults[activeIdx].id}` : undefined
                    }
                    placeholder="Buscar por nome, telefone ou e-mail…"
                    value={leadTerm}
                    onChange={(e) => setLeadTerm(e.target.value)}
                    onKeyDown={onLeadKeyDown}
                  />
                </div>
                {leadTerm.trim() && leadResults.length === 0 && (
                  <div className="lead-search-status" aria-live="polite">
                    {leadSearching && <span className="muted small">Buscando…</span>}
                    {!leadSearching && leadFailed && (
                      <span className="field-hint bad">Não foi possível buscar agora. Tente de novo.</span>
                    )}
                    {!leadSearching && !leadFailed && (
                      <span className="muted small">
                        Nenhum lead encontrado. Só é possível consultar quem já está no funil.
                      </span>
                    )}
                  </div>
                )}
                {listboxOpen && (
                  <div className="lead-results" id="credit-lead-results" role="listbox" aria-label="Leads encontrados">
                    {leadResults.map((l, i) => (
                      <div
                        key={l.id}
                        id={`credit-lead-opt-${l.id}`}
                        role="option"
                        aria-selected={i === activeIdx}
                        className={`lead-result ${i === activeIdx ? 'active' : ''}`}
                        onMouseEnter={() => setActiveIdx(i)}
                        onMouseDown={(e) => e.preventDefault()} // mantém o foco no campo de busca
                        onClick={() => pickLead(l)}
                      >
                        <span className="lead-result-info">
                          <span className="lead-result-name">{l.name}</span>
                          <span className="lead-result-contact muted small">
                            {formatPhone(l.phone) ?? l.email ?? 'sem contato'}
                          </span>
                        </span>
                        {l.document && <span className="lead-result-doc mono">{formatDocumentInput(l.document)}</span>}
                        <span className="lead-result-cta">Selecionar</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>

          {/* ── Etapa 2 · documento ── */}
          <section className="credit-step">
            <StepHead
              n={2}
              done={docState.status === 'valid'}
              title="CPF ou CNPJ"
              hint="Os dígitos verificadores são conferidos antes do envio."
            />
            <div className="credit-search-row">
              <input
                id="credit-document"
                ref={docInputRef}
                className={`credit-doc-input ${
                  docState.status === 'valid' ? 'input-ok' : docState.status === 'invalid' ? 'input-bad' : ''
                }`}
                value={docInput}
                onChange={(e) => {
                  setDocInput(formatDocumentInput(e.target.value));
                  setDocAutofilled(false);
                  if (errorField === 'document') {
                    setError(null);
                    setErrorField(null);
                  }
                }}
                placeholder="000.000.000-00"
                inputMode="numeric"
                autoComplete="off"
                aria-label="CPF ou CNPJ do titular"
                aria-invalid={docState.status === 'invalid'}
                aria-describedby="credit-document-hint"
              />
            </div>
            <p
              id="credit-document-hint"
              className={`field-hint credit-doc-hint ${
                docState.status === 'invalid' ? 'bad' : docState.status === 'valid' ? 'ok' : ''
              }`}
              role={docState.status === 'invalid' ? 'alert' : undefined}
            >
              {docState.status === 'valid' && (
                <>
                  <CheckIcon size={13} /> {docState.docType} válido
                  {docAutofilled && ' · preenchido pelo cadastro do lead'}
                </>
              )}
              {docState.status === 'invalid' && (
                <>
                  <AlertIcon size={13} /> {docState.docType} inválido - os dígitos verificadores não conferem.
                </>
              )}
              {docState.status === 'incomplete' && `${docState.digits.length} de 11 (CPF) ou 14 (CNPJ) dígitos`}
              {docState.status === 'empty' && 'CPF com 11 dígitos ou CNPJ com 14.'}
            </p>

            {duplicate && (
              <div className="credit-dup">
                <HistoryIcon size={15} />
                <span>
                  Este documento já foi consultado <strong>{timeAgo(duplicate.createdAt)}</strong>. Abrir o relatório
                  arquivado não consome uma nova consulta.
                </span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => openReport(duplicate.id)}>
                  Abrir
                </button>
              </div>
            )}
          </section>

          {/* ── Etapa 3 · consentimento (legal/09 §8.1) ── */}
          <section className="credit-step">
            <StepHead
              n={3}
              done={consentConfirmed}
              title="Autorização do titular"
              hint="Sem a confirmação, o servidor recusa a consulta."
            />
            <label className={`checkbox-field consent-check ${errorField === 'consent' ? 'has-error' : ''}`}>
              <input
                ref={consentRef}
                type="checkbox"
                checked={consentConfirmed}
                aria-invalid={errorField === 'consent'}
                onChange={(e) => {
                  setConsentConfirmed(e.target.checked);
                  if (e.target.checked && errorField === 'consent') {
                    setError(null);
                    setErrorField(null);
                  }
                }}
              />
              <span>
                {selectedLead ? (
                  <>
                    <strong>{selectedLead.name}</strong> foi informado e <strong>autorizou</strong> esta consulta.
                  </>
                ) : (
                  <>
                    O cliente foi informado e <strong>autorizou</strong> esta consulta.
                  </>
                )}
              </span>
            </label>

            <span className="credit-search-label consent-label" id="credit-consent-channel">
              Canal da autorização
            </span>
            <div className="consent-channels" role="radiogroup" aria-labelledby="credit-consent-channel">
              {CONSENT_SOURCES.map((s) => (
                <label key={s.value} className={`consent-channel ${consentSource === s.value ? 'on' : ''}`}>
                  <input
                    type="radio"
                    name="consentSource"
                    value={s.value}
                    checked={consentSource === s.value}
                    onChange={() => setConsentSource(s.value)}
                  />
                  {s.label}
                </label>
              ))}
            </div>
          </section>

          <button type="submit" className="btn btn-primary credit-submit" disabled={loading || quotaExhausted}>
            <SearchDataIcon size={17} /> {loading ? 'Consultando…' : 'Consultar Perfil'}
          </button>

          {error && (
            <p className="form-error credit-search-error" role="alert">
              {error}
            </p>
          )}

          <p className="credit-legal-note">
            <InfoIcon size={13} /> Ao consultar, ficam registrados o titular, o canal e a data da autorização, e a
            versão do termo de consentimento vigente.
          </p>
        </form>

        {recent.length > 0 && (
          <div className="recent-queries">
            <div className="recent-title">Consultas recentes</div>
            <div className="recent-list">
              {recent.map((q) => (
                <button key={q.id} className="recent-item" onClick={() => openReport(q.id)}>
                  <span className="recent-name">{q.report.name}</span>
                  <span className="recent-doc muted small">{q.report.document}</span>
                  <span className="recent-date muted small">{formatDateTime(q.createdAt)}</span>
                  <span className={`recent-score ${BAND_CLASS[q.report.band]}`}>{q.score}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
