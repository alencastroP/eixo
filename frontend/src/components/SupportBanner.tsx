import { useEffect, useState } from 'react';
import { decodeJwtExpiry, tokenStore } from '../api/client';
import { supportSessionApi } from '../api/endpoints';
import type { AccountSummary } from '../types';

function formatRemaining(ms: number): string {
  if (ms <= 0) return '0:00';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Faixa persistente durante uma sessão de suporte: mostra em qual conta o
 * admin da plataforma está e por quanto tempo ainda, com um jeito explícito
 * de sair antes da hora. Só existe nesta aba - `tokenStore.isSupportMode()`
 * é isolado por `sessionStorage`, então a aba original do admin nunca mostra
 * isto nem é afetada pelo fim da sessão.
 */
export function SupportBanner({ account }: { account?: AccountSummary | null }) {
  const [remaining, setRemaining] = useState<number | null>(null);
  const [ending, setEnding] = useState(false);

  useEffect(() => {
    if (!tokenStore.isSupportMode()) return;
    const expiry = decodeJwtExpiry(tokenStore.getAccess() ?? '');
    if (!expiry) return;
    const tick = () => setRemaining(expiry.getTime() - Date.now());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  if (!tokenStore.isSupportMode()) return null;

  const end = async () => {
    setEnding(true);
    try {
      await supportSessionApi.endMine();
    } catch {
      /* mesmo se a chamada falhar, limpar o token local já tira o acesso desta aba */
    }
    tokenStore.clear();
    window.location.href = '/login';
  };

  const expired = remaining !== null && remaining <= 0;

  return (
    <div className={`trial-banner support-banner ${expired ? 'urgent' : ''}`}>
      <span className="trial-banner-dot" />
      <span>
        Modo suporte - <strong>{account?.name ?? 'conta do cliente'}</strong>
        {remaining !== null && !expired && <> - expira em <strong>{formatRemaining(remaining)}</strong></>}
        {expired && <> - <strong>sessão expirada</strong></>}
      </span>
      <button className="trial-banner-cta" onClick={() => void end()} disabled={ending}>
        {ending ? 'Encerrando…' : 'Encerrar sessão'}
      </button>
    </div>
  );
}
