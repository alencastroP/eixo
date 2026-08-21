/**
 * Perfis de acesso: criação dos padrões, resolução das permissões efetivas de
 * um usuário e o CRUD que a tela de Perfis & Permissões consome.
 */
import type { AccessProfile, Prisma, PrismaClient } from '@prisma/client';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import {
  ADMIN_PROFILE_KEY,
  DEFAULT_PROFILES,
  WILDCARD,
  expandPermissions,
  isKnownPermission,
  roleFromPermissions,
} from './permissions';

type Db = Prisma.TransactionClient | PrismaClient;

// ─── Perfis padrão ───────────────────────────────────────────────────────────

/**
 * Garante os perfis padrão da conta e devolve o mapa `systemKey → perfil`.
 *
 * Idempotente: roda no cadastro do trial, no `create:admin` e no seed sem
 * duplicar nada (o unique de `[accountId, systemKey]` fecha a corrida). NÃO
 * mexe nas permissões de um perfil que já existe - se o lojista afinou o
 * "Atendente" da loja dele, não é papel do sistema desfazer.
 */
export async function ensureDefaultProfiles(db: Db, accountId: string): Promise<Map<string, AccessProfile>> {
  const map = new Map<string, AccessProfile>();
  for (const seed of DEFAULT_PROFILES) {
    const profile = await db.accessProfile.upsert({
      where: { accountId_systemKey: { accountId, systemKey: seed.systemKey } },
      update: {},
      create: {
        accountId,
        systemKey: seed.systemKey,
        name: seed.name,
        description: seed.description,
        permissions: seed.permissions,
      },
    });
    map.set(seed.systemKey, profile);
  }
  return map;
}

/** Perfil de administrador da conta - o dono do trial e o `create:admin` caem nele. */
export async function adminProfileId(db: Db, accountId: string): Promise<string> {
  const profiles = await ensureDefaultProfiles(db, accountId);
  return profiles.get(ADMIN_PROFILE_KEY)!.id;
}

// ─── Resolução das permissões de um usuário ──────────────────────────────────

export interface UserAccess {
  profileId: string | null;
  profileName: string | null;
  /** Lista efetiva, já com o coringa e as implicações resolvidos. */
  permissions: string[];
}

/**
 * Cache curto das permissões por usuário.
 *
 * Sem ele, cada requisição autenticada pagaria um SELECT a mais só para saber
 * o que o usuário pode. Com TTL de 30s, uma mudança de perfil vale quase
 * imediatamente, mesmo em outra instância da API - e as escritas locais já
 * limpam o cache na hora (`invalidateAccess`).
 *
 * O JWT seria mais barato ainda, mas carregaria a permissão congelada até o
 * refresh: revogar acesso de alguém demoraria os 15 minutos do access token.
 */
const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { value: UserAccess; expiresAt: number }>();

export function invalidateAccess(userId?: string): void {
  if (userId) cache.delete(userId);
  else cache.clear();
}

export async function resolveUserAccess(userId: string): Promise<UserAccess> {
  const hit = cache.get(userId);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, profile: { select: { id: true, name: true, permissions: true } } },
  });

  const value: UserAccess = user?.profile
    ? {
        profileId: user.profile.id,
        profileName: user.profile.name,
        permissions: expandPermissions(user.profile.permissions),
      }
    : {
        // Fallback de base antiga (usuário sem perfil): reproduz exatamente o
        // que o enum concedia antes desta feature - ADMIN tudo, AGENT o padrão
        // do perfil "Atendente".
        profileId: null,
        profileName: null,
        permissions: expandPermissions(
          user?.role === 'ADMIN' ? [WILDCARD] : DEFAULT_PROFILES[1].permissions,
        ),
      };

  cache.set(userId, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

// ─── CRUD da tela de perfis ──────────────────────────────────────────────────

export interface ProfileView {
  id: string;
  name: string;
  description: string | null;
  systemKey: string | null;
  /** Lista guardada (pode conter `*`) - é o que a tela edita. */
  permissions: string[];
  /** Lista efetiva, com implicações resolvidas - é o que a tela exibe marcado. */
  effectivePermissions: string[];
  /** Perfil de administrador: existe sempre e não pode ser editado nem apagado. */
  locked: boolean;
  userCount: number;
  createdAt: Date;
}

function toView(profile: AccessProfile & { _count?: { users: number } }): ProfileView {
  return {
    id: profile.id,
    name: profile.name,
    description: profile.description,
    systemKey: profile.systemKey,
    permissions: profile.permissions,
    effectivePermissions: expandPermissions(profile.permissions),
    locked: profile.systemKey === ADMIN_PROFILE_KEY,
    userCount: profile._count?.users ?? 0,
    createdAt: profile.createdAt,
  };
}

export async function listProfiles(accountId: string): Promise<ProfileView[]> {
  await ensureDefaultProfiles(prisma, accountId);
  const rows = await prisma.accessProfile.findMany({
    where: { accountId },
    include: { _count: { select: { users: true } } },
    // administrador primeiro, depois os demais padrões, depois os do lojista
    orderBy: [{ systemKey: 'asc' }, { name: 'asc' }],
  });
  return rows.map(toView);
}

/** Rejeita slug fora do catálogo: um perfil não pode prometer o que não existe. */
function sanitizePermissions(input: string[]): string[] {
  const unknown = input.filter((key) => !isKnownPermission(key));
  if (unknown.length > 0) throw badRequest(`Permissão desconhecida: ${unknown.join(', ')}`);
  // o coringa é do perfil de administrador; perfil do lojista guarda a lista
  return [...new Set(input.filter((key) => key !== WILDCARD))];
}

async function findScoped(id: string, accountId: string) {
  const profile = await prisma.accessProfile.findUnique({
    where: { id },
    include: { _count: { select: { users: true } } },
  });
  // Perfil de outra conta responde "não encontrado", nunca "proibido": a
  // diferença já confirmaria que aquele id existe em alguma loja.
  if (!profile || profile.accountId !== accountId) throw notFound('Perfil não encontrado');
  return profile;
}

export interface ProfileInput {
  name: string;
  description?: string | null;
  permissions: string[];
}

export async function createProfile(accountId: string, input: ProfileInput): Promise<ProfileView> {
  const permissions = sanitizePermissions(input.permissions);
  const taken = await prisma.accessProfile.findFirst({ where: { accountId, name: input.name } });
  if (taken) throw conflict('Já existe um perfil com este nome');

  const profile = await prisma.accessProfile.create({
    data: { accountId, name: input.name, description: input.description ?? null, permissions },
    include: { _count: { select: { users: true } } },
  });
  return toView(profile);
}

/**
 * Salva um perfil e propaga o efeito nos usuários que o vestem: o nível base
 * (`users.role`) é derivado de novo e o cache de permissões cai.
 *
 * `actorId` existe para o guarda-corpo do "não se tranque para fora": ninguém
 * remove de si mesmo a permissão de gerenciar perfis - restaria uma loja sem
 * quem administre acesso, e a única saída seria o suporte.
 */
export async function updateProfile(
  accountId: string,
  id: string,
  input: ProfileInput,
  actorId: string,
): Promise<ProfileView> {
  const existing = await findScoped(id, accountId);
  if (existing.systemKey === ADMIN_PROFILE_KEY) {
    throw badRequest('O perfil de Administrador tem acesso total e não pode ser alterado.');
  }

  const permissions = sanitizePermissions(input.permissions);
  const effective = expandPermissions(permissions);

  if (!effective.includes('profiles.manage')) {
    const usesThis = await prisma.user.findFirst({
      where: { id: actorId, profileId: id },
      select: { id: true },
    });
    if (usesThis) {
      throw badRequest(
        'Você usa este perfil: sem a permissão de gerenciar perfis, perderia o acesso a esta tela.',
      );
    }
  }

  const taken = await prisma.accessProfile.findFirst({
    where: { accountId, name: input.name, id: { not: id } },
  });
  if (taken) throw conflict('Já existe um perfil com este nome');

  const profile = await prisma.$transaction(async (tx) => {
    const saved = await tx.accessProfile.update({
      where: { id },
      data: {
        // renomear um perfil padrão é permitido: o código o reencontra pelo
        // systemKey, não pelo nome - a loja que chama de "Vendedor" fica à
        // vontade para dizer isso na tela
        name: input.name,
        description: input.description ?? null,
        permissions,
      },
      include: { _count: { select: { users: true } } },
    });
    await tx.user.updateMany({ where: { profileId: id }, data: { role: roleFromPermissions(effective) } });
    return saved;
  });

  invalidateAccess();
  return toView(profile);
}

export async function deleteProfile(accountId: string, id: string): Promise<void> {
  const profile = await findScoped(id, accountId);
  if (profile.systemKey) throw badRequest('Os perfis padrão não podem ser excluídos.');
  if (profile._count.users > 0) {
    const n = profile._count.users;
    throw badRequest(
      `${n} ${n === 1 ? 'usuário usa' : 'usuários usam'} este perfil. Mova ${n === 1 ? 'essa pessoa' : 'essas pessoas'} para outro perfil antes de excluir.`,
    );
  }
  await prisma.accessProfile.delete({ where: { id } });
  invalidateAccess();
}
