/**
 * Panorama das contas e do que pertence a cada uma.
 *
 *   npm run accounts
 *
 * Leitura pura — não escreve nada. Serve para conferir de fora que o
 * isolamento está de pé: cada linha é um tenant, e os números só contam
 * registros daquela conta.
 */
import { prisma } from '../src/lib/prisma';
import { buildWebhookUrl } from '../src/lib/webhook-key';
import { env } from '../src/config/env';

/* eslint-disable no-console */
async function main() {
  const accounts = await prisma.account.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      name: true,
      status: true,
      createdAt: true,
      storefront: { select: { slug: true, published: true } },
      _count: {
        select: { users: true, leads: true, tickets: true, vehicles: true, integrations: true, webhookEvents: true },
      },
    },
  });

  if (accounts.length === 0) {
    console.log('Nenhuma conta cadastrada. Crie uma com: npm run create:admin -- <email> "<loja>"');
    return;
  }

  console.log(`\n${accounts.length} conta(s):\n`);
  console.table(
    accounts.map((a) => ({
      accountId: a.id,
      conta: a.name,
      status: a.status,
      vitrine: a.storefront ? `/loja/${a.storefront.slug}${a.storefront.published ? '' : ' (despublicada)'}` : '—',
      usuarios: a._count.users,
      veiculos: a._count.vehicles,
      leads: a._count.leads,
      tickets: a._count.tickets,
      eventos: a._count.webhookEvents,
      integracoes: a._count.integrations,
    })),
  );

  // Endpoints de recepção — um por (conta, plataforma). A webhookKey não é
  // segredo (só roteia), então pode ser listada; o inboundSecret NÃO aparece
  // aqui: ele só sai pela rota auditada de revelação, na tela de Integrações.
  const integrations = await prisma.integration.findMany({
    orderBy: [{ accountId: 'asc' }, { platform: 'asc' }],
    select: {
      platform: true,
      status: true,
      webhookKey: true,
      inboundSecret: true,
      account: { select: { name: true } },
    },
  });

  if (integrations.length > 0) {
    console.log('\nEndpoints de recepção por loja:\n');
    console.table(
      integrations.map((i) => ({
        conta: i.account.name,
        plataforma: i.platform,
        status: i.status,
        url: buildWebhookUrl(env.webhookPublicUrl, i.platform, i.webhookKey),
        segredo: i.inboundSecret ? 'definido (cifrado)' : 'ausente',
      })),
    );
  } else {
    console.log('\nNenhuma integração conectada ainda.\n');
  }

  // Conferência de fronteira: qualquer resultado aqui é um bug de isolamento.
  const crossed = await prisma.$queryRaw<Array<{ ticketId: string }>>`
    SELECT t."id" AS "ticketId"
      FROM "tickets" t
      JOIN "leads" l ON l."id" = t."leadId"
     WHERE l."accountId" <> t."accountId"
  `;
  console.log(
    crossed.length === 0
      ? '\nIntegridade: nenhum ticket aponta para lead de outra conta.\n'
      : `\nATENÇÃO: ${crossed.length} ticket(s) apontam para lead de outra conta.\n`,
  );
}

main()
  .catch((err) => {
    console.error('Falha ao ler contas:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
