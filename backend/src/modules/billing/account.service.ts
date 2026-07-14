import { AccountStatus, type Account } from '@prisma/client';
import { prisma } from '../../lib/prisma';

/** Status que BLOQUEIAM o acesso (dados preservados, mas login/rotas negados). */
export const BLOCKING_STATUSES: AccountStatus[] = [
  AccountStatus.PAST_DUE,
  AccountStatus.SUSPENDED,
  AccountStatus.EXPIRED,
  AccountStatus.CANCELED,
];

export function isBlocked(status: AccountStatus): boolean {
  return BLOCKING_STATUSES.includes(status);
}

/** Mensagem amigável por status de bloqueio (mostrada no login e nas rotas). */
export function accessMessage(status: AccountStatus): string {
  switch (status) {
    case AccountStatus.EXPIRED:
      return 'Seu período de teste terminou. Assine um plano para reativar o acesso — seus dados foram preservados.';
    case AccountStatus.PAST_DUE:
      return 'Há uma pendência de pagamento na sua conta. Regularize para reativar o acesso.';
    case AccountStatus.SUSPENDED:
      return 'Sua conta está suspensa. Fale com o suporte.';
    case AccountStatus.CANCELED:
      return 'Sua conta foi cancelada. Fale com o suporte para reativá-la.';
    default:
      return 'Acesso indisponível para esta conta.';
  }
}

/** Serialização enxuta da conta para o front (status + dias restantes de trial). */
export function serializeAccount(account: Account) {
  const trialDaysLeft =
    account.status === AccountStatus.TRIAL && account.trialEndsAt
      ? Math.max(0, Math.ceil((account.trialEndsAt.getTime() - Date.now()) / 86_400_000))
      : null;
  return {
    id: account.id,
    name: account.name,
    status: account.status,
    trialEndsAt: account.trialEndsAt,
    trialDaysLeft,
  };
}

export function getAccount(accountId: string) {
  return prisma.account.findUnique({ where: { id: accountId } });
}
