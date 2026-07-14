import { useAuth } from '../auth/AuthContext';
import type { AccountSummary, PublicUser } from '../types';
import { BrandMark } from './BrandMark';

/** Faixa de aviso do trial: dias restantes + CTA de assinatura. */
export function TrialBanner({ account }: { account?: AccountSummary | null }) {
  if (!account || account.status !== 'TRIAL') return null;
  const days = account.trialDaysLeft ?? 0;
  const urgent = days <= 2;

  return (
    <div className={`trial-banner ${urgent ? 'urgent' : ''}`}>
      <span className="trial-banner-dot" />
      <span>
        {days > 0 ? (
          <>
            Teste grátis — <strong>{days} {days === 1 ? 'dia restante' : 'dias restantes'}</strong>
          </>
        ) : (
          <>Seu teste termina <strong>hoje</strong></>
        )}
      </span>
      <button className="trial-banner-cta" onClick={() => window.alert('Fluxo de assinatura: pluga o gateway de pagamento (ver INTEGRATION.md).')}>
        Assinar agora
      </button>
    </div>
  );
}

/** Tela cheia quando a conta está bloqueada (trial expirado/inadimplente/suspensa). */
export function AccountBlocked({ user }: { user: PublicUser }) {
  const { logout } = useAuth();
  const messages: Record<string, string> = {
    EXPIRED: 'Seu período de teste terminou. Assine um plano para reativar o acesso — seus dados foram preservados.',
    PAST_DUE: 'Há uma pendência de pagamento na sua conta. Regularize para reativar o acesso.',
    SUSPENDED: 'Sua conta está suspensa. Fale com o suporte.',
    CANCELED: 'Sua conta foi cancelada. Fale com o suporte para reativá-la.',
  };
  const status = user.account?.status ?? 'EXPIRED';

  return (
    <div className="login-page">
      <div className="login-card blocked-card">
        <div className="login-brand">
          <span className="brand-mark big">
            <BrandMark variant="orange" size={34} />
          </span>
          <h1>Acesso pausado</h1>
        </div>
        <p className="blocked-message">{messages[status] ?? 'Acesso indisponível para esta conta.'}</p>
        <button
          className="btn btn-primary btn-block"
          onClick={() => window.alert('Fluxo de assinatura: pluga o gateway de pagamento (ver INTEGRATION.md).')}
        >
          Assinar / regularizar
        </button>
        <button className="btn btn-ghost btn-block" onClick={() => void logout()}>
          Sair
        </button>
      </div>
    </div>
  );
}
