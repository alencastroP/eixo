/**
 * Prova do permissionamento por perfil - roda contra o banco configurado.
 *
 *   npm run verify:permissions
 *
 * Sobe a API de verdade numa porta alta, cria uma loja descartável com três
 * perfis (Administrador, Atendente e um "Gerente de vendas" feito à mão) e
 * bate nas rotas com o token de cada um, conferindo 200 x 403. Ao final apaga
 * a conta que criou (o resto sai por CASCADE).
 *
 * Existe pelo mesmo motivo do verify:isolation: autorização é regra que o
 * compilador não garante. Esquecer um `requirePermission` num endpoint novo
 * compila, sobe e só aparece quando o atendente errado abre o financeiro.
 */
import type { Server } from 'node:http';
import { AccountStatus, UserRole } from '@prisma/client';
import { createApiApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { hashPassword } from '../src/modules/auth/auth.service';
import { ensureDefaultProfiles } from '../src/modules/roles/roles.service';

const SUFFIX = Date.now().toString(36);
const PORT = Number(process.env.VERIFY_PORT ?? 4599);
const BASE = `http://127.0.0.1:${PORT}/api`;
const PASSWORD = 'Verificacao@123';

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  if (!ok) failures += 1;
  // eslint-disable-next-line no-console
  console.log(`[${ok ? '  ok  ' : ' FALHA'}] ${label} → ${String(actual)}${ok ? '' : ` (esperado ${String(expected)})`}`);
}

async function call(token: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
  return { status: res.status, body: (await res.json().catch(() => null)) as unknown };
}

async function login(email: string): Promise<string> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const body = (await res.json()) as { accessToken?: string };
  if (!body.accessToken) throw new Error(`login falhou para ${email}: ${JSON.stringify(body)}`);
  return body.accessToken;
}

async function main() {
  const account = await prisma.account.create({
    data: { name: `Loja Permissões (teste ${SUFFIX})`, status: AccountStatus.ACTIVE },
  });

  try {
    const defaults = await ensureDefaultProfiles(prisma, account.id);
    const manager = await prisma.accessProfile.create({
      data: {
        accountId: account.id,
        name: 'Gerente de vendas',
        permissions: ['tickets.view', 'tickets.view.all', 'tickets.assign', 'tickets.reply', 'vehicles.manage', 'reports.view'],
      },
    });

    const makeUser = (name: string, role: UserRole, profileId: string) =>
      prisma.user.create({
        data: {
          name,
          email: `${name.toLowerCase()}-${SUFFIX}@teste.local`,
          passwordHash: hashPassword(PASSWORD),
          role,
          accountId: account.id,
          profileId,
        },
      });

    const dona = await makeUser('dona', UserRole.ADMIN, defaults.get('admin')!.id);
    const atendente = await makeUser('atendente', UserRole.AGENT, defaults.get('agent')!.id);
    const gerente = await makeUser('gerente', UserRole.AGENT, manager.id);

    const server: Server = await new Promise((resolve) => {
      const s = createApiApp().listen(PORT, () => resolve(s));
    });

    try {
      const admin = await login(dona.email);
      const agent = await login(atendente.email);
      const boss = await login(gerente.email);

      // eslint-disable-next-line no-console
      console.log(`\nAdministrador (perfil coringa "*")`);
      check('GET /roles/catalog', (await call(admin, '/roles/catalog')).status, 200);
      check('GET /finance/entries', (await call(admin, '/finance/entries')).status, 200);
      check('GET /integrations', (await call(admin, '/integrations')).status, 200);
      check('GET /agent/profile', (await call(admin, '/agent/profile')).status, 200);
      check('GET /webhook-events', (await call(admin, '/webhook-events')).status, 200);

      // eslint-disable-next-line no-console
      console.log('\nAtendente (perfil padrão)');
      check('GET /tickets (permitido)', (await call(agent, '/tickets')).status, 200);
      check('GET /vehicles (permitido)', (await call(agent, '/vehicles')).status, 200);
      check('GET /credit/queries/recent (permitido)', (await call(agent, '/credit/queries/recent')).status, 200);
      check('GET /finance/entries (negado)', (await call(agent, '/finance/entries')).status, 403);
      check('GET /fiscal/invoices (negado)', (await call(agent, '/fiscal/invoices')).status, 403);
      check('GET /integrations (negado)', (await call(agent, '/integrations')).status, 403);
      check('GET /agent/profile (negado)', (await call(agent, '/agent/profile')).status, 403);
      check('GET /webhook-events (negado)', (await call(agent, '/webhook-events')).status, 403);
      check('GET /roles (negado)', (await call(agent, '/roles')).status, 403);
      check('POST /vehicles (negado)', (await call(agent, '/vehicles', { method: 'POST', body: '{}' })).status, 403);
      check('POST /users (negado)', (await call(agent, '/users', { method: 'POST', body: '{}' })).status, 403);
      check('PUT /storefront (negado)', (await call(agent, '/storefront', { method: 'PUT', body: '{}' })).status, 403);

      // eslint-disable-next-line no-console
      console.log('\nGerente de vendas (perfil criado pelo lojista)');
      check('GET /tickets (permitido)', (await call(boss, '/tickets')).status, 200);
      check('GET /vehicles (implicado por vehicles.manage)', (await call(boss, '/vehicles')).status, 200);
      check('GET /roles (negado)', (await call(boss, '/roles')).status, 403);
      check('GET /finance/entries (negado)', (await call(boss, '/finance/entries')).status, 403);
      check(
        'POST /credit/queries (negado - perfil sem crédito)',
        (await call(boss, '/credit/queries', { method: 'POST', body: JSON.stringify({ document: '11144477735' }) })).status,
        403,
      );
      const novoVeiculo = await call(boss, '/vehicles', {
        method: 'POST',
        body: JSON.stringify({
          type: 'CAR', brand: 'Fiat', model: 'Argo', yearFabrication: 2022, yearModel: 2023, km: 12000,
          costPrice: 60000, salePrice: 78900, status: 'AVAILABLE', optionals: [], showOnSite: false, featured: false,
        }),
      });
      check('POST /vehicles (permitido)', novoVeiculo.status, 201);
      const veiculoId = (novoVeiculo.body as { id: string }).id;

      // eslint-disable-next-line no-console
      console.log('\nRecorte de dado sensível (custo e margem do estoque)');
      check(
        'gerente (sem vehicles.costs) não recebe o preço de compra',
        ((await call(boss, `/vehicles/${veiculoId}`)).body as { costPrice: number | null }).costPrice,
        null,
      );
      check(
        'gerente não recebe a margem',
        ((await call(boss, `/vehicles/${veiculoId}`)).body as { margin: number | null }).margin,
        null,
      );
      check(
        'administrador recebe o preço de compra',
        ((await call(admin, `/vehicles/${veiculoId}`)).body as { costPrice: number | null }).costPrice,
        60000,
      );
      check(
        'lançar gasto exige vehicles.costs',
        (
          await call(boss, `/vehicles/${veiculoId}/costs`, {
            method: 'POST',
            body: JSON.stringify({ category: 'Oficina', description: 'Revisão', amount: 500 }),
          })
        ).status,
        403,
      );

      // eslint-disable-next-line no-console
      console.log('\nCRUD de perfis e efeito imediato da mudança');
      const created = await call(admin, '/roles', {
        method: 'POST',
        body: JSON.stringify({ name: 'Financeiro', description: 'Só contas', permissions: ['finance.manage'] }),
      });
      check('POST /roles', created.status, 201);
      const novo = created.body as { id: string; effectivePermissions: string[] };
      check('implicação aplicada (finance.manage → finance.view)', novo.effectivePermissions.includes('finance.view'), true);

      check(
        'PATCH /users/:id troca o perfil do atendente',
        (await call(admin, `/users/${atendente.id}`, { method: 'PATCH', body: JSON.stringify({ profileId: novo.id }) }))
          .status,
        200,
      );
      // MESMO token de antes: a permissão é relida do banco, não vem do JWT
      check('com o token antigo, atendente JÁ alcança /finance/entries', (await call(agent, '/finance/entries')).status, 200);
      check('com o token antigo, atendente JÁ perdeu /tickets', (await call(agent, '/tickets')).status, 403);
      check(
        '/auth/me reflete o perfil novo',
        ((await call(agent, '/auth/me')).body as { profile: { name: string } }).profile.name,
        'Financeiro',
      );

      // eslint-disable-next-line no-console
      console.log('\nGuarda-corpos');
      check(
        'não deixa rebaixar a última pessoa que administra a conta',
        (await call(admin, `/users/${dona.id}`, { method: 'PATCH', body: JSON.stringify({ profileId: novo.id }) })).status,
        400,
      );
      check(
        'não deixa revogar a última pessoa que administra a conta',
        (await call(admin, `/users/${dona.id}`, { method: 'PATCH', body: JSON.stringify({ active: false }) })).status,
        400,
      );
      check(
        'perfil de Administrador é imutável',
        (
          await call(admin, `/roles/${defaults.get('admin')!.id}`, {
            method: 'PUT',
            body: JSON.stringify({ name: 'Alterado', permissions: [] }),
          })
        ).status,
        400,
      );
      check('não exclui perfil em uso', (await call(admin, `/roles/${novo.id}`, { method: 'DELETE' })).status, 400);
      check(
        'não exclui perfil padrão',
        (await call(admin, `/roles/${defaults.get('agent')!.id}`, { method: 'DELETE' })).status,
        400,
      );
      check(
        'rejeita permissão fora do catálogo',
        (await call(admin, '/roles', { method: 'POST', body: JSON.stringify({ name: `X${SUFFIX}`, permissions: ['deus.mode'] }) }))
          .status,
        400,
      );
      check(
        'rejeita nome de perfil duplicado',
        (await call(admin, '/roles', { method: 'POST', body: JSON.stringify({ name: 'Financeiro', permissions: [] }) })).status,
        409,
      );
      // já sem ninguém vestindo: aí sim a exclusão passa
      const descartavel = (
        await call(admin, '/roles', { method: 'POST', body: JSON.stringify({ name: `Temporário ${SUFFIX}`, permissions: [] }) })
      ).body as { id: string };
      check(
        'perfil sem usuários é excluível',
        (await call(admin, `/roles/${descartavel.id}`, { method: 'DELETE' })).status,
        204,
      );
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  } finally {
    // limpeza: a conta leva perfis, usuários e veículos por CASCADE
    await prisma.account.delete({ where: { id: account.id } }).catch(() => undefined);
  }

  // eslint-disable-next-line no-console
  console.log(failures === 0 ? '\nTodas as verificações passaram.\n' : `\n${failures} verificação(ões) FALHARAM.\n`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Falha na verificação:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
