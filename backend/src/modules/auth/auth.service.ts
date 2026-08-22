import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { User } from '@prisma/client';
import { env } from '../../config/env';
import { badRequest, conflict, forbidden, unauthorized } from '../../lib/errors';
import { sendEmail } from '../../lib/email';
import { passwordResetEmail } from '../../lib/email-templates';
import { logger } from '../../lib/logger';
import { prisma } from '../../lib/prisma';
import { accessMessage, isBlocked } from '../billing/account.service';

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: User['role'];
}

export function toPublicUser(user: User): PublicUser {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

// Hash "isca" (bcrypt cost 10) usado quando o e-mail não existe, para que o
// tempo de resposta do login não revele se a conta existe (anti-enumeração).
const DUMMY_HASH = '$2b$10$CwTycUXWue0Thq9StjUM0uJ8Hql8xM3iQnS0ubb2Yk5Zl6L6Q1Vy';

/** Só a assinatura do access token - usada tanto no login normal quanto nas
 *  sessões de suporte (que precisam de uma validade diferente dos 15min padrão
 *  e nunca emitem refresh token). Ver modules/platform/platform.service.ts. */
export function signAccessToken(user: User, expiresIn: jwt.SignOptions['expiresIn']) {
  return jwt.sign(
    { role: user.role, name: user.name, email: user.email, accountId: user.accountId },
    env.jwt.accessSecret,
    { subject: user.id, expiresIn },
  );
}

export async function issueTokens(user: User) {
  const accessToken = signAccessToken(user, env.jwt.accessTtl as jwt.SignOptions['expiresIn']);

  const refreshToken = randomBytes(48).toString('hex');
  await prisma.refreshToken.create({
    data: {
      tokenHash: sha256(refreshToken),
      userId: user.id,
      expiresAt: new Date(Date.now() + env.jwt.refreshTtlDays * 24 * 3_600_000),
    },
  });

  return { accessToken, refreshToken, user: toPublicUser(user) };
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: { account: true },
  });
  // compara sempre (mesmo sem usuário) para não vazar existência por timing;
  // bcrypt.compare é assíncrono - não bloqueia o event loop sob carga.
  const ok = user ? await bcrypt.compare(password, user.passwordHash) : await bcrypt.compare(password, DUMMY_HASH);
  if (!user || !user.active || !ok) {
    throw unauthorized('E-mail ou senha inválidos', 'BAD_CREDENTIALS');
  }
  // Bloqueio de acesso por status da conta (trial expirado, inadimplente, etc.).
  if (user.account && isBlocked(user.account.status)) {
    throw forbidden(accessMessage(user.account.status), 'ACCOUNT_BLOCKED');
  }
  return issueTokens(user);
}

/** Rotação de refresh token: o token usado é revogado e um novo par é emitido. */
export async function refresh(refreshToken: string) {
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: sha256(refreshToken) },
    include: { user: true },
  });
  if (!stored || stored.revokedAt || stored.expiresAt < new Date() || !stored.user.active) {
    throw unauthorized('Sessão inválida ou expirada', 'REFRESH_INVALID');
  }
  await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
  return issueTokens(stored.user);
}

export async function logout(refreshToken: string) {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: sha256(refreshToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

const PASSWORD_RESET_TTL_MINUTES = 30;

/**
 * Pede o link de recuperação de senha. NUNCA revela se o e-mail existe (mesmo
 * princípio anti-enumeração do login): quem chama sempre recebe sucesso: a
 * diferença fica só em enviar ou não o e-mail.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || !user.active) {
    logger.info('recuperação de senha pedida para e-mail inexistente/inativo', { email });
    return;
  }

  // Invalida qualquer link anterior ainda não usado - só o mais recente vale.
  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  const token = randomBytes(32).toString('hex');
  await prisma.passwordResetToken.create({
    data: {
      tokenHash: sha256(token),
      userId: user.id,
      expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60_000),
    },
  });

  await sendEmail(user.email, passwordResetEmail({ name: user.name, token }));
}

/** Troca a senha a partir do token recebido por e-mail. Uso único, vida curta. */
export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const stored = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true },
  });
  if (!stored || stored.usedAt || stored.expiresAt < new Date() || !stored.user.active) {
    throw badRequest('Link de recuperação inválido ou expirado', 'RESET_TOKEN_INVALID');
  }

  await prisma.$transaction([
    prisma.passwordResetToken.update({ where: { id: stored.id }, data: { usedAt: new Date() } }),
    prisma.user.update({ where: { id: stored.userId }, data: { passwordHash: hashPassword(newPassword) } }),
    // Senha comprometida o bastante para justificar o reset também justifica
    // derrubar qualquer sessão já aberta - login de novo em todo dispositivo.
    prisma.refreshToken.updateMany({ where: { userId: stored.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
}

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}

export interface UpdateProfileInput {
  name?: string;
  email?: string;
  currentPassword?: string;
  newPassword?: string;
}

/** Atualiza o próprio perfil. Troca de senha valida a senha atual. */
export async function updateOwnProfile(userId: string, input: UpdateProfileInput): Promise<PublicUser> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw unauthorized();

  if (input.newPassword) {
    if (!input.currentPassword || !bcrypt.compareSync(input.currentPassword, user.passwordHash)) {
      throw badRequest('Senha atual incorreta', 'BAD_PASSWORD');
    }
  }
  if (input.email && input.email.toLowerCase() !== user.email) {
    const taken = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
    if (taken) throw conflict('Já existe um usuário com este e-mail');
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      name: input.name,
      email: input.email?.toLowerCase(),
      passwordHash: input.newPassword ? hashPassword(input.newPassword) : undefined,
    },
  });
  return toPublicUser(updated);
}
