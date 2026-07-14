/**
 * Cadastro do teste gratuito de 15 dias.
 *
 * Regra central anti-fraude: **um CPF só pode iniciar UM trial na vida**. A
 * unicidade é garantida no banco (constraint em `trial_cpf_registry.cpfHash`),
 * não só na aplicação. O CPF é validado pelo algoritmo oficial (mod 11) e nunca
 * é gravado em texto claro (hash + cifra — ver lib/cpf-token).
 */
import { AccountStatus, Prisma, SubscriptionStatus, UserRole } from '@prisma/client';
import { badRequest, conflict } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { maskDocument, isValidCpf, onlyDigits } from '../../lib/document';
import { prisma } from '../../lib/prisma';
import { hashCpf, sealCpf } from '../../lib/cpf-token';
import { hashPassword, issueTokens } from '../auth/auth.service';
import { TRIAL_DURATION_DAYS, TRIAL_PLAN_CODE } from '../billing/plans';

const toJson = (value: unknown) => value as Prisma.InputJsonValue;

export interface TrialSignupInput {
  name: string;
  email: string;
  cpf: string;
  password: string;
  companyName: string;
  companyCnpj?: string;
}

export class CpfAlreadyUsedError extends Error {
  status = 409;
  code = 'CPF_ALREADY_USED';
  constructor() {
    super('Este CPF já utilizou o período de teste gratuito.');
  }
}

export async function signupTrial(input: TrialSignupInput, meta: { ip?: string }) {
  const cpfDigits = onlyDigits(input.cpf);

  // (a) validação oficial de CPF no BACK-END (nunca confiar só no client)
  if (!isValidCpf(cpfDigits)) {
    throw badRequest('CPF inválido. Verifique os dígitos informados.', 'INVALID_CPF');
  }

  const email = input.email.toLowerCase().trim();
  const cpfHash = hashCpf(cpfDigits);

  // (b) CPF já usou trial? consulta a tabela dedicada ANTES de criar a conta
  const priorCpf = await prisma.trialCpfRegistry.findUnique({ where: { cpfHash } });
  if (priorCpf) {
    // (log anti-fraude — sem PII em texto claro)
    logger.warn('tentativa de reuso de CPF no trial', {
      cpf: maskDocument(cpfDigits),
      ip: meta.ip,
      existingSince: priorCpf.usedAt,
    });
    throw new CpfAlreadyUsedError();
  }

  // Controle secundário: e-mail também é único (não substitui a regra do CPF).
  const emailTaken = await prisma.user.findUnique({ where: { email } });
  if (emailTaken) throw conflict('Já existe uma conta com este e-mail.', 'EMAIL_TAKEN');

  const trialPlan = await prisma.plan.findUnique({ where: { code: TRIAL_PLAN_CODE } });
  if (!trialPlan) throw badRequest('Plano de trial não configurado. Rode o backfill de planos.');

  const now = new Date();
  const trialEndsAt = new Date(now.getTime() + TRIAL_DURATION_DAYS * 24 * 3_600_000);

  try {
    const user = await prisma.$transaction(async (tx) => {
      const account = await tx.account.create({
        data: {
          name: input.companyName.trim(),
          cnpj: input.companyCnpj ? onlyDigits(input.companyCnpj) : null,
          status: AccountStatus.TRIAL,
          planId: trialPlan.id,
          trialStartedAt: now,
          trialEndsAt,
        },
      });

      const createdUser = await tx.user.create({
        data: {
          name: input.name.trim(),
          email,
          passwordHash: hashPassword(input.password),
          role: UserRole.ADMIN, // quem cria o trial é o admin da própria conta
          accountId: account.id,
        },
      });

      await tx.subscription.create({
        data: { accountId: account.id, planId: trialPlan.id, status: SubscriptionStatus.TRIALING },
      });

      // registro anti-fraude (unique em cpfHash garante a corrida no banco)
      await tx.trialCpfRegistry.create({
        data: { cpfHash, cpfSealed: toJson(sealCpf(cpfDigits)), accountId: account.id },
      });

      return createdUser;
    });

    logger.info('trial iniciado', { accountId: user.accountId, cpf: maskDocument(cpfDigits), ip: meta.ip });

    // auto-login: emite a sessão já autenticada
    return issueTokens(user);
  } catch (err) {
    // corrida: dois cadastros simultâneos do mesmo CPF — a constraint única vence
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const target = (err.meta?.target as string[] | undefined)?.join(',') ?? '';
      if (target.includes('cpfHash')) throw new CpfAlreadyUsedError();
      if (target.includes('email')) throw conflict('Já existe uma conta com este e-mail.', 'EMAIL_TAKEN');
    }
    throw err;
  }
}
