/**
 * Backfill da vitrine (idempotente). Roda uma vez após a migration
 * `storefront_module`:
 *   npm run backfill:storefronts
 *
 * - Vincula todo veículo sem `accountId` à conta default (a mesma criada pelo
 *   backfill de contas) - o estoque pré-SaaS passa a ter dono.
 * - Cria uma vitrine DESPUBLICADA para cada conta que ainda não tem,
 *   com slug derivado do nome da loja.
 *
 * Nada é publicado automaticamente: o lojista revisa a configuração e publica
 * pela tela Vitrine do CRM.
 */
import { prisma } from '../src/lib/prisma';
import { getOrCreateStorefront } from '../src/modules/storefront/storefront.service';

async function main() {
  // 1) dono do estoque órfão: a conta default do backfill de contas, com
  //    fallback para a conta mais antiga (instalações que renomearam a default)
  const orphanVehicles = await prisma.vehicle.count({ where: { accountId: null } });
  if (orphanVehicles > 0) {
    const account =
      (await prisma.account.findFirst({ where: { name: 'Conta Demonstração' } })) ??
      (await prisma.account.findFirst({ orderBy: { createdAt: 'asc' } }));

    if (!account) {
      throw new Error('Nenhuma conta encontrada - rode `npm run backfill:accounts` antes deste script.');
    }
    const { count } = await prisma.vehicle.updateMany({ where: { accountId: null }, data: { accountId: account.id } });
    // eslint-disable-next-line no-console
    console.log(`Veículos vinculados à conta "${account.name}": ${count}`);
  }

  // 2) uma vitrine por conta (criada despublicada pelo próprio serviço)
  const accounts = await prisma.account.findMany({ select: { id: true, name: true } });
  let created = 0;
  for (const account of accounts) {
    const existing = await prisma.storefront.findUnique({ where: { accountId: account.id }, select: { id: true } });
    if (existing) continue;
    const store = await getOrCreateStorefront(account.id);
    created++;
    // eslint-disable-next-line no-console
    console.log(`Vitrine criada para "${account.name}": /loja/${store.slug} (despublicada)`);
  }

  // eslint-disable-next-line no-console
  console.log(`Backfill de vitrines concluído: ${created} criada(s), ${accounts.length - created} já existiam.`);
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Falha no backfill de vitrines:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
