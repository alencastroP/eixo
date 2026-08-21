/**
 * Prova de isolamento entre contas - roda contra o banco configurado.
 *
 *   npm run verify:isolation
 *
 * Cria duas lojas descartáveis, gera atendimento em cada uma e verifica, pelos
 * MESMOS serviços que a API usa, que nenhuma enxerga a outra. Ao final apaga
 * tudo que criou (as contas saem por CASCADE).
 *
 * Existe porque isolamento de tenant é o tipo de regra que o compilador não
 * garante: uma consulta sem `where accountId` compila perfeitamente e só se
 * revela em produção, com dado de cliente errado na tela de outro lojista.
 */
import { AccountStatus, UserRole } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { WILDCARD, expandPermissions } from '../src/modules/roles/permissions';
import { ingestNormalizedLead } from '../src/modules/tickets/ingest.service';
import { listTickets, ticketStats, getTicket, type CurrentUser } from '../src/modules/tickets/tickets.service';
import { runQuery, recentQueries, getQuery } from '../src/modules/credit/credit.service';

const SUFFIX = Date.now().toString(36);
let failures = 0;

function check(label: string, condition: boolean, detail = '') {
  const mark = condition ? '  ok  ' : ' FALHA';
  if (!condition) failures += 1;
  // eslint-disable-next-line no-console
  console.log(`[${mark}] ${label}${detail ? ` - ${detail}` : ''}`);
}

async function makeAccount(name: string) {
  const account = await prisma.account.create({
    data: { name: `${name} (teste ${SUFFIX})`, status: AccountStatus.ACTIVE },
  });
  const user = await prisma.user.create({
    data: {
      name: `Admin ${name}`,
      email: `admin-${name.toLowerCase()}-${SUFFIX}@teste.local`,
      passwordHash: 'x', // não faz login neste teste
      role: UserRole.ADMIN,
      accountId: account.id,
    },
  });
  const asUser: CurrentUser = {
    id: user.id,
    role: 'ADMIN',
    name: user.name,
    email: user.email,
    accountId: account.id,
    permissions: expandPermissions([WILDCARD]),
  };
  return { account, asUser };
}

async function main() {
  // eslint-disable-next-line no-console
  console.log(`\nIsolamento por conta - verificação (sufixo ${SUFFIX})\n`);

  const A = await makeAccount('LojaA');
  const B = await makeAccount('LojaB');

  // Mesmo lead externo, MESMO telefone, mesma plataforma, em duas lojas: o pior
  // caso para a deduplicação, que antes fundiria os dois num registro só.
  const inA = await ingestNormalizedLead(A.account.id, 'olx', {
    externalLeadId: 'lead-colisao-1',
    name: 'Cliente Colisão',
    phone: '11999998888',
    message: 'Tenho interesse (loja A)',
  });
  const inB = await ingestNormalizedLead(B.account.id, 'olx', {
    externalLeadId: 'lead-colisao-1',
    name: 'Cliente Colisão',
    phone: '11999998888',
    message: 'Tenho interesse (loja B)',
  });

  check('mesmo externalId em duas lojas gera TICKETS distintos', inA.ticketId !== inB.ticketId);
  check('mesmo externalId em duas lojas gera LEADS distintos', inA.leadId !== inB.leadId);

  // ── Listagem: cada admin só vê o próprio funil ────────────────────────────
  const listA = await listTickets({ page: 1, pageSize: 50 }, A.asUser);
  const listB = await listTickets({ page: 1, pageSize: 50 }, B.asUser);

  check('admin da Loja A vê exatamente 1 ticket', listA.total === 1, `viu ${listA.total}`);
  check('admin da Loja B vê exatamente 1 ticket', listB.total === 1, `viu ${listB.total}`);
  check(
    'nenhum ticket da Loja B aparece para a Loja A',
    !listA.items.some((t) => t.id === inB.ticketId),
  );

  // ── Acesso direto por id: o vetor mais comum de vazamento ─────────────────
  let blocked = false;
  try {
    await getTicket(inB.ticketId, A.asUser); // id de OUTRA conta
  } catch {
    blocked = true;
  }
  check('abrir ticket de outra loja pelo id é bloqueado', blocked);

  // ── Contadores do painel também respeitam a fronteira ─────────────────────
  const statsA = await ticketStats(A.asUser);
  check('contadores do painel são por conta', statsA.total === 1, `total=${statsA.total}`);

  // ── Crédito: até aqui a ÚNICA tabela de dado de negócio sem accountId ─────
  await runQuery('52998224725', A.asUser, {
    leadId: inA.leadId,
    consentConfirmed: true,
    consentSource: 'presencial',
  });
  const creditB = await runQuery('52998224725', B.asUser, {
    leadId: inB.leadId,
    consentConfirmed: true,
    consentSource: 'presencial',
  });

  const recentA = await recentQueries(A.account.id, 50);
  check('histórico de crédito da Loja A não inclui consulta da Loja B', !recentA.some((q) => q.id === creditB.id));

  let creditBlocked = false;
  try {
    await getQuery(creditB.id, A.account.id); // consulta de OUTRA conta
  } catch {
    creditBlocked = true;
  }
  check('abrir consulta de crédito de outra loja pelo id é bloqueado', creditBlocked);

  let queryWithoutConsent = false;
  try {
    await runQuery('52998224725', A.asUser, { leadId: inA.leadId, consentConfirmed: false, consentSource: '' });
  } catch {
    queryWithoutConsent = true;
  }
  check('consulta de crédito sem consentimento confirmado é bloqueada', queryWithoutConsent);

  // ── Visão do banco: o que o usuário pediu para conseguir enxergar ─────────
  const overview = await prisma.account.findMany({
    where: { name: { contains: `teste ${SUFFIX}` } },
    select: {
      id: true,
      name: true,
      _count: { select: { leads: true, tickets: true, users: true, integrations: true } },
    },
  });
  // eslint-disable-next-line no-console
  console.log('\nRelações por conta no banco:');
  // eslint-disable-next-line no-console
  console.table(
    overview.map((a) => ({
      accountId: a.id,
      conta: a.name,
      usuarios: a._count.users,
      leads: a._count.leads,
      tickets: a._count.tickets,
      integracoes: a._count.integrations,
    })),
  );

  // ── Limpeza (CASCADE leva leads/tickets/eventos junto) ────────────────────
  await prisma.account.deleteMany({ where: { id: { in: [A.account.id, B.account.id] } } });

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
