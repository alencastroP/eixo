import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { billingApi } from '../api/endpoints';
import { ApiError } from '../api/client';
import { PageHeader } from '../components/PageHeader';
import {
  AlertIcon,
  CheckIcon,
  CoinsIcon,
  CreditCardIcon,
  ExternalIcon,
  RefreshIcon,
  SparkIcon,
} from '../components/icons';
import { useAuth } from '../auth/AuthContext';
import type {
  BillingCharge,
  BillingCycle,
  BillingMethod,
  BillingOverview,
  BillingPlan,
  ChargeStatus,
} from '../types';
import { formatBRL, formatDate, formatDocumentInput } from '../utils/format';

const METHOD_LABEL: Record<BillingMethod, string> = {
  CREDIT_CARD: 'Cartão de crédito',
  PIX: 'PIX',
  BOLETO: 'Boleto',
};

/** Como cada meio se comporta - o lojista decide melhor sabendo disso. */
const METHOD_HINT: Record<BillingMethod, string> = {
  CREDIT_CARD: 'Renova sozinho. É o único meio em que você não precisa fazer nada todo mês.',
  PIX: 'Uma cobrança nova a cada ciclo - você recebe o QR e paga.',
  BOLETO: 'Disponível no plano anual. Emitido uma vez, com alguns dias de prazo.',
};

const CHARGE_LABEL: Record<ChargeStatus, string> = {
  PENDING: 'Aguardando pagamento',
  CONFIRMED: 'Pago',
  RECEIVED: 'Pago',
  OVERDUE: 'Vencida',
  REFUNDED: 'Estornada',
  CANCELED: 'Cancelada',
  CHARGEBACK: 'Contestada',
  FAILED: 'Falhou',
};

const CHARGE_TONE: Record<ChargeStatus, string> = {
  PENDING: 'warn',
  CONFIRMED: 'ok',
  RECEIVED: 'ok',
  OVERDUE: 'bad',
  REFUNDED: 'bad',
  CANCELED: 'muted',
  CHARGEBACK: 'bad',
  FAILED: 'bad',
};

const brl = (cents: number) => formatBRL(cents / 100) ?? 'R$ 0,00';

/** Barra de consumo de uma cota ou limite. `max: null` = ilimitado. */
function UsageBar({ label, used, max }: { label: string; used: number; max: number | null }) {
  if (max === null) {
    return (
      <div className="usage-row">
        <span className="usage-label">{label}</span>
        <span className="usage-value muted small">{used} · sem limite</span>
      </div>
    );
  }
  const pct = max === 0 ? 100 : Math.min(100, Math.round((used / max) * 100));
  const tone = pct >= 100 ? 'bad' : pct >= 80 ? 'warn' : 'ok';
  return (
    <div className="usage-row">
      <span className="usage-label">{label}</span>
      <div className={`usage-track ${tone}`}>
        <div className="usage-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="usage-value">
        {used} / {max}
      </span>
    </div>
  );
}

export function BillingPage() {
  const { can, refreshUser } = useAuth();
  const canManage = can('billing.manage');

  const [data, setData] = useState<BillingOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [cycle, setCycle] = useState<BillingCycle>('MONTHLY');
  const [choosing, setChoosing] = useState<BillingPlan | null>(null);
  const [method, setMethod] = useState<BillingMethod>('CREDIT_CARD');
  const [payer, setPayer] = useState({ name: '', document: '', email: '', phone: '' });
  const [submitting, setSubmitting] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    billingApi
      .overview()
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Falha ao carregar a assinatura'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const subscription = data?.subscription ?? null;
  const account = data?.account ?? null;

  const methods = useMemo<BillingMethod[]>(
    () => data?.methodsByCycle?.[cycle] ?? ['CREDIT_CARD'],
    [data, cycle],
  );
  useEffect(() => {
    if (!methods.includes(method)) setMethod(methods[0]);
  }, [methods, method]);

  const openCheckout = async (plan: BillingPlan) => {
    setChoosing(plan);
    setCheckoutUrl(null);
    setNotice(null);
    setError(null);
    try {
      const defaults = await billingApi.payer();
      setPayer({
        name: defaults.name,
        document: formatDocumentInput(defaults.document),
        email: defaults.email,
        phone: defaults.phone,
      });
    } catch {
      // Falhar ao pré-preencher não pode impedir a contratação - o formulário
      // abre vazio e o lojista digita.
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!choosing || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await billingApi.subscribe({
        planCode: choosing.code,
        cycle,
        method,
        payer: {
          name: payer.name.trim(),
          document: payer.document.replace(/\D/g, ''),
          email: payer.email.trim(),
          phone: payer.phone.replace(/\D/g, '') || undefined,
        },
      });
      setCheckoutUrl(result.checkoutUrl);
      setChoosing(null);
      setNotice(
        result.checkoutUrl
          ? 'Assinatura criada. Conclua o pagamento na página do gateway - o acesso é liberado assim que ele confirmar.'
          : 'Assinatura criada. A primeira cobrança aparecerá aqui em instantes.',
      );
      load();
      refreshUser();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível concluir a assinatura');
    } finally {
      setSubmitting(false);
    }
  };

  const sync = async () => {
    setNotice(null);
    setError(null);
    try {
      await billingApi.sync();
      load();
      refreshUser();
      setNotice('Faturas atualizadas a partir do gateway.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao sincronizar');
    }
  };

  const cancel = async () => {
    if (!window.confirm('Cancelar a assinatura? O acesso continua até o fim do período já pago.')) return;
    setError(null);
    try {
      await billingApi.cancel();
      load();
      setNotice('Cancelamento agendado. Você continua com acesso até o fim do período pago.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao cancelar');
    }
  };

  if (loading && !data) {
    return (
      <div className="dash">
        <PageHeader icon={<CreditCardIcon size={19} />} eyebrow="Administração" title="Pagamentos" />
        <div className="muted small">Carregando…</div>
      </div>
    );
  }

  return (
    <div className="dash billing-page">
      <PageHeader
        icon={<CreditCardIcon size={19} />}
        eyebrow="Administração"
        title="Plano e pagamentos"
        subtitle="Sua assinatura, o consumo do mês e o histórico de faturas."
        actions={
          canManage && subscription?.connected ? (
            <button className="btn btn-ghost btn-sm" onClick={sync} title="Já paguei e não apareceu aqui">
              <RefreshIcon size={15} /> Atualizar faturas
            </button>
          ) : undefined
        }
      />

      {error && (
        <div className="alert alert-error">
          <AlertIcon size={14} /> {error}
        </div>
      )}
      {notice && (
        <div className="alert alert-info">
          <CheckIcon size={14} /> {notice}
        </div>
      )}

      {data && !data.gatewayEnabled && (
        <div className="alert alert-warning">
          <AlertIcon size={14} /> Pagamentos ainda não estão habilitados nesta instalação. A tela abre em modo
          leitura - fale com o suporte para contratar.
        </div>
      )}

      {checkoutUrl && (
        <div className="alert alert-info billing-checkout">
          <span>Sua fatura está pronta. O pagamento é feito na página segura do gateway.</span>
          <a className="btn btn-primary btn-sm" href={checkoutUrl} target="_blank" rel="noreferrer">
            <ExternalIcon size={15} /> Abrir página de pagamento
          </a>
        </div>
      )}

      {/* ── Situação atual ── */}
      <section className="panel">
        <div className="panel-header">
          <h2>Situação da conta</h2>
          {account && <span className={`badge status-${account.status.toLowerCase()}`}>{statusLabel(account)}</span>}
        </div>

        {subscription ? (
          <div className="billing-current">
            <div className="billing-plan-line">
              <strong>{subscription.planName}</strong>
              <span className="muted">
                {brl(subscription.priceCents)} · {subscription.cycle === 'YEARLY' ? 'anual' : 'mensal'} ·{' '}
                {METHOD_LABEL[subscription.method]}
              </span>
            </div>
            <dl className="billing-meta">
              {subscription.nextDueDate && (
                <>
                  <dt>Próxima cobrança</dt>
                  <dd>{formatDate(subscription.nextDueDate)}</dd>
                </>
              )}
              {subscription.currentPeriodEnd && (
                <>
                  <dt>Período pago até</dt>
                  <dd>{formatDate(subscription.currentPeriodEnd)}</dd>
                </>
              )}
              {subscription.card && (
                <>
                  <dt>Cartão</dt>
                  <dd>
                    {subscription.card.brand} ····{subscription.card.last4}
                  </dd>
                </>
              )}
            </dl>
            {subscription.cancelAtPeriodEnd && (
              <div className="alert alert-warning">
                <AlertIcon size={14} /> Cancelamento agendado. O acesso continua até{' '}
                {formatDate(subscription.currentPeriodEnd)} e nenhuma nova cobrança será feita.
              </div>
            )}
            {subscription.status === 'PAST_DUE' && (
              <div className="alert alert-warning">
                <AlertIcon size={14} /> Há uma fatura em aberto. Regularize para não perder o acesso - seus dados
                seguem preservados.
              </div>
            )}
          </div>
        ) : (
          <p className="muted small">
            {account?.status === 'TRIAL'
              ? `Você está no teste gratuito${account.trialEndsAt ? ` até ${formatDate(account.trialEndsAt)}` : ''}. Escolha um plano abaixo para continuar depois dessa data.`
              : 'Nenhuma assinatura ativa. Escolha um plano abaixo.'}
          </p>
        )}
      </section>

      {/* ── Consumo e limites ── */}
      {data && (data.limits || data.usage.length > 0) && (
        <section className="panel">
          <div className="panel-header">
            <h2>Consumo do plano</h2>
            <SparkIcon size={17} />
          </div>
          <div className="usage-list">
            {data.limits?.items.map((item) => (
              <UsageBar key={item.resource} label={item.label} used={item.used} max={item.max} />
            ))}
            {data.usage.map((u) => (
              <UsageBar
                key={u.metric}
                label={u.metric === 'AI_MESSAGE' ? 'Mensagens do agente de IA (mês)' : 'Consultas de crédito (mês)'}
                used={u.used}
                max={u.quota}
              />
            ))}
          </div>
          {data.usage.some((u) => u.exceeded) && (
            <p className="muted small">
              Franquia esgotada neste mês. O recurso volta no dia 1º ou imediatamente ao mudar de plano - o restante
              do sistema continua funcionando normalmente.
            </p>
          )}
        </section>
      )}

      {/* ── Planos ── */}
      {data && data.plans.length > 0 && (
        <section className="panel">
          <div className="panel-header">
            <h2>{subscription?.connected ? 'Trocar de plano' : 'Escolher um plano'}</h2>
            <div className="cycle-toggle">
              <button
                className={`cycle-btn ${cycle === 'MONTHLY' ? 'active' : ''}`}
                onClick={() => setCycle('MONTHLY')}
              >
                Mensal
              </button>
              <button className={`cycle-btn ${cycle === 'YEARLY' ? 'active' : ''}`} onClick={() => setCycle('YEARLY')}>
                Anual <span className="cycle-badge">2 meses grátis</span>
              </button>
            </div>
          </div>

          <div className="plan-grid">
            {data.plans.map((plan) => {
              const price = cycle === 'YEARLY' ? plan.priceYearlyCents : plan.priceCents;
              const available = plan.cycles.includes(cycle) && price !== null;
              const current = subscription?.planCode === plan.code && subscription.cycle === cycle;
              return (
                <div key={plan.code} className={`plan-card ${plan.highlight ? 'highlight' : ''} ${current ? 'current' : ''}`}>
                  {plan.highlight && <span className="plan-tag">Mais escolhido</span>}
                  <h3>{plan.name}</h3>
                  <p className="plan-desc muted small">{plan.description}</p>
                  <div className="plan-price">
                    {available ? (
                      <>
                        <strong>{brl(price!)}</strong>
                        <span className="muted small">/{cycle === 'YEARLY' ? 'ano' : 'mês'}</span>
                      </>
                    ) : (
                      <span className="muted small">Não vendido neste ciclo</span>
                    )}
                  </div>
                  <ul className="plan-features">
                    <li>{plan.features.maxUsers} usuários</li>
                    <li>{plan.features.maxVehicles} veículos em estoque</li>
                    <li>{plan.features.whatsappNumbers} número(s) de WhatsApp</li>
                    <li>
                      {plan.features.aiMessagesPerMonth === null
                        ? 'Mensagens de IA sem limite'
                        : `${plan.features.aiMessagesPerMonth} mensagens de IA/mês`}
                    </li>
                    <li>
                      {plan.features.creditQueriesPerMonth === null
                        ? 'Consultas de crédito sem limite'
                        : `${plan.features.creditQueriesPerMonth} consultas de crédito/mês`}
                    </li>
                    {plan.features.prioritySupport && <li>Suporte prioritário</li>}
                  </ul>
                  <button
                    className={`btn ${plan.highlight ? 'btn-primary' : 'btn-ghost'} btn-block`}
                    disabled={!available || current || !canManage || !data.gatewayEnabled}
                    onClick={() => openCheckout(plan)}
                  >
                    {current ? 'Plano atual' : subscription?.connected ? 'Mudar para este' : 'Assinar'}
                  </button>
                </div>
              );
            })}
          </div>

          {!canManage && (
            <p className="muted small">Seu perfil permite consultar, mas não contratar. Fale com um administrador.</p>
          )}
        </section>
      )}

      {/* ── Formulário de contratação ── */}
      {choosing && (
        <section className="panel">
          <div className="panel-header">
            <h2>
              Contratar {choosing.name} · {cycle === 'YEARLY' ? 'anual' : 'mensal'}
            </h2>
            <button className="btn btn-ghost btn-sm" onClick={() => setChoosing(null)}>
              Cancelar
            </button>
          </div>

          <form onSubmit={submit} className="billing-form">
            <div className="method-list">
              {methods.map((m) => (
                <label key={m} className={`method-option ${method === m ? 'selected' : ''}`}>
                  <input type="radio" name="method" checked={method === m} onChange={() => setMethod(m)} />
                  <span className="method-name">{METHOD_LABEL[m]}</span>
                  <span className="method-hint muted small">{METHOD_HINT[m]}</span>
                </label>
              ))}
            </div>

            <div className="form-grid">
              <label className="field">
                <span>Razão social ou nome do responsável</span>
                <input value={payer.name} onChange={(e) => setPayer({ ...payer, name: e.target.value })} required />
              </label>
              <label className="field">
                <span>CNPJ ou CPF do pagador</span>
                <input
                  value={payer.document}
                  onChange={(e) => setPayer({ ...payer, document: formatDocumentInput(e.target.value) })}
                  inputMode="numeric"
                  required
                />
              </label>
              <label className="field">
                <span>E-mail de cobrança</span>
                <input
                  type="email"
                  value={payer.email}
                  onChange={(e) => setPayer({ ...payer, email: e.target.value })}
                  required
                />
              </label>
              <label className="field">
                <span>Telefone</span>
                <input value={payer.phone} onChange={(e) => setPayer({ ...payer, phone: e.target.value })} />
              </label>
            </div>

            <p className="muted small">
              O pagamento é processado pelo nosso gateway. <strong>Nenhum dado de cartão passa pelo Eixo</strong> - você
              digita na página segura dele. A nota fiscal é emitida a cada cobrança confirmada.
            </p>

            <button type="submit" className="btn btn-primary" disabled={submitting}>
              <CoinsIcon size={16} /> {submitting ? 'Criando assinatura…' : `Assinar por ${brl(cycle === 'YEARLY' ? choosing.priceYearlyCents ?? 0 : choosing.priceCents)}`}
            </button>
          </form>
        </section>
      )}

      {/* ── Faturas ── */}
      {data && data.charges.length > 0 && (
        <section className="panel">
          <div className="panel-header">
            <h2>Faturas</h2>
          </div>
          <div className="charge-list">
            {data.charges.map((charge) => (
              <ChargeRow key={charge.id} charge={charge} />
            ))}
          </div>
        </section>
      )}

      {/* ── Cancelamento ── */}
      {canManage && subscription?.connected && !subscription.cancelAtPeriodEnd && (
        <section className="panel danger-zone">
          <div className="panel-header">
            <h2>Cancelar assinatura</h2>
          </div>
          <p className="muted small">
            O acesso continua até o fim do período já pago e seus dados ficam disponíveis para exportação por 30 dias
            depois disso. Nada é apagado no momento do cancelamento.
          </p>
          <button className="btn btn-ghost btn-danger" onClick={cancel}>
            Cancelar assinatura
          </button>
        </section>
      )}
    </div>
  );
}

function ChargeRow({ charge }: { charge: BillingCharge }) {
  return (
    <div className="charge-row">
      <span className={`charge-status ${CHARGE_TONE[charge.status]}`}>{CHARGE_LABEL[charge.status]}</span>
      <span className="charge-desc">{charge.description ?? 'Assinatura Eixo'}</span>
      <span className="charge-due muted small">
        {charge.paidAt ? `pago em ${formatDate(charge.paidAt)}` : `vence ${formatDate(charge.dueDate)}`}
      </span>
      <span className="charge-amount">{brl(charge.amountCents)}</span>
      <span className="charge-links">
        {charge.invoiceUrl && (charge.status === 'PENDING' || charge.status === 'OVERDUE') && (
          <a href={charge.invoiceUrl} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm">
            Pagar
          </a>
        )}
        {charge.nfseUrl && (
          <a href={charge.nfseUrl} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
            Nota fiscal
          </a>
        )}
        {charge.receiptUrl && !charge.nfseUrl && (
          <a href={charge.receiptUrl} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
            Comprovante
          </a>
        )}
      </span>
    </div>
  );
}

function statusLabel(account: { status: string; trialEndsAt: string | null }): string {
  switch (account.status) {
    case 'TRIAL':
      return account.trialEndsAt ? `Teste até ${formatDate(account.trialEndsAt)}` : 'Teste gratuito';
    case 'ACTIVE':
      return 'Ativa';
    case 'PAST_DUE':
      return 'Pagamento pendente';
    case 'SUSPENDED':
      return 'Suspensa';
    case 'EXPIRED':
      return 'Expirada';
    case 'CANCELED':
      return 'Cancelada';
    default:
      return account.status;
  }
}
