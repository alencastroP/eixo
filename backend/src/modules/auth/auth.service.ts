import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { User } from '@prisma/client';
import { env } from '../../config/env';
import { badRequest, conflict, forbidden, unauthorized } from '../../lib/errors';
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

export async function issueTokens(user: User) {
  const accessToken = jwt.sign(
    { role: user.role, name: user.name, email: user.email, accountId: user.accountId },
    env.jwt.accessSecret,
    { subject: user.id, expiresIn: env.jwt.accessTtl as jwt.SignOptions['expiresIn'] },
  );

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
  // bcrypt.compare é assíncrono — não bloqueia o event loop sob carga.
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
