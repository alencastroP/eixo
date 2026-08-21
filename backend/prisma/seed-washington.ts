/**
 * Provisionamento da conta Washington Veículos (São Gonçalo do Amarante/RN) -
 * primeira loja com vitrine pública configurada.
 *
 *   npm run seed:washington
 *
 * Idempotente: pode rodar de novo sem duplicar nada. Cria/atualiza a conta, o
 * usuário administrador, a configuração da vitrine (publicada) e o estoque
 * inicial transcrito do site atual da loja.
 *
 * As FOTOS não são semeadas de propósito - entram pelo CRM (Estoque → editar
 * veículo → galeria), que é de onde a vitrine as lê.
 *
 * Credenciais criadas (trocar no primeiro acesso):
 *   contato@washingtonveiculos.com.br / Washington@123
 */
import { AccountStatus, Prisma, SubscriptionStatus, UserRole, VehicleSaleStatus, VehicleType } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { hashPassword } from '../src/modules/auth/auth.service';
import { DEFAULT_CONFIG, type StorefrontConfig } from '../src/modules/storefront/storefront.service';

const SLUG = 'washington-veiculos';
const ACCOUNT_NAME = 'Washington Veículos';
const ADMIN_EMAIL = 'contato@washingtonveiculos.com.br';
const WHATSAPP = '5584988013786'; // (84) 98801-3786 com DDI

const D = (n: number) => new Prisma.Decimal(n);

const CONFIG: StorefrontConfig = {
  ...DEFAULT_CONFIG,
  brand: {
    name: 'Washington Veículos',
    tagline: 'Seminovos selecionados em São Gonçalo do Amarante',
    // arquivo em frontend/public/logos - o lojista pode substituir pelo
    // original enviando em Vitrine → Identidade (ver PENDENCIAS-VITRINE.md)
    logoUrl: '/logos/washington-veiculos.svg',
    primary: '#f5a623',
    theme: 'light',
  },
  hero: {
    title: 'Veículos revisados, ficha técnica aberta.',
    subtitle:
      'Todo carro do pátio com ano, quilometragem e câmbio na frente do preço. Você compara antes de conversar com o vendedor.',
    imageUrl: null,
    ctaPrimary: 'Ver todo o estoque',
    ctaSecondary: 'Avaliar meu usado',
    badges: ['Compra', 'Venda', 'Troca', 'Financiamento'],
  },
  highlights: [
    {
      icon: 'shield',
      title: 'Procedência verificada',
      text: 'Consulta de débitos, multas e histórico antes de qualquer veículo entrar no pátio.',
    },
    {
      icon: 'wallet',
      title: 'Financiamento aprovado no dia',
      text: 'Trabalhamos com os principais bancos e cuidamos de toda a papelada por você.',
    },
    {
      icon: 'swap',
      title: 'Avaliamos seu usado',
      text: 'Traga seu carro para avaliação gratuita e use o valor como entrada na troca.',
    },
    {
      icon: 'wrench',
      title: 'Revisado antes da entrega',
      text: 'Mecânica, elétrica e estética revisadas - o carro sai pronto para rodar.',
    },
  ],
  about: {
    title: 'Quem é a Washington Veículos',
    text:
      'Somos uma revenda de São Gonçalo do Amarante que trabalha com carros e utilitários seminovos escolhidos um a um. '
      + 'Cada veículo passa por checagem de documentação e revisão mecânica antes de ser anunciado - é assim que a gente '
      + 'consegue olhar no olho do cliente e garantir o que está vendendo. Atendemos toda a Grande Natal, com avaliação '
      + 'do seu usado na troca e financiamento junto aos principais bancos.',
  },
  contact: {
    phone: '(84) 98801-3786',
    whatsapp: WHATSAPP,
    email: ADMIN_EMAIL,
    address: 'Rua das Açucenas, 426 - Jardins',
    city: 'São Gonçalo do Amarante',
    state: 'RN',
    hours: 'Seg a Sex: 8h às 17h · Sáb: 8h às 17h',
    mapUrl: 'https://www.google.com/maps/search/?api=1&query=Rua+das+Acucenas+426+Jardins+Sao+Goncalo+do+Amarante+RN',
    instagram: '',
    facebook: '',
  },
  financing: { downPercent: 20, months: 48, monthlyRate: 1.99 },
  sections: { featured: true, inventory: true, highlights: true, financing: true, sell: true, about: true, contact: true },
  seo: {
    title: 'Washington Veículos | Seminovos em São Gonçalo do Amarante/RN',
    description:
      'Carros e utilitários seminovos revisados, com procedência verificada. Aceitamos troca e financiamos em até 60x. '
      + 'Rua das Açucenas, 426 - Jardins, São Gonçalo do Amarante/RN.',
  },
};

/** Estoque transcrito do site atual da loja (preços e km da data da migração). */
const STOCK: Array<Omit<Prisma.VehicleUncheckedCreateInput, 'accountId'> & { featured?: boolean }> = [
  {
    type: VehicleType.CAR, brand: 'Nissan', model: 'Frontier', version: '2.3 16V Turbo Diesel PRO-4X CD 4x4 Automático',
    yearFabrication: 2023, yearModel: 2024, color: 'Cinza', fuel: 'Diesel', km: 58428,
    salePrice: D(211900), status: VehicleSaleStatus.AVAILABLE, featured: true,
    optionals: ['4x4', 'Ar condicionado digital', 'Central multimídia', 'Bancos de couro', 'Câmera de ré', 'Controle de tração', 'Airbag', 'ABS'],
  },
  {
    type: VehicleType.CAR, brand: 'Toyota', model: 'Hilux', version: '3.0 SR 4x4 CD 16V Turbo Intercooler Diesel Automático',
    yearFabrication: 2012, yearModel: 2012, color: 'Prata', fuel: 'Diesel', km: 299000,
    salePrice: D(121900), status: VehicleSaleStatus.AVAILABLE, featured: true,
    optionals: ['4x4', 'Ar condicionado', 'Direção hidráulica', 'Vidros elétricos', 'Airbag', 'ABS'],
  },
  {
    type: VehicleType.CAR, brand: 'Honda', model: 'HR-V', version: '1.8 16V Flex EX 4P Automático',
    yearFabrication: 2015, yearModel: 2016, color: 'Branco', fuel: 'Flex', km: 68949,
    salePrice: D(86900), status: VehicleSaleStatus.AVAILABLE, featured: true,
    optionals: ['Ar condicionado digital', 'Central multimídia', 'Câmera de ré', 'Direção elétrica', 'Airbag', 'ABS'],
  },
  {
    type: VehicleType.CAR, brand: 'Volkswagen', model: 'Saveiro', version: '1.6 MSI Trendline CS 16V Flex 2P Manual',
    yearFabrication: 2023, yearModel: 2024, color: 'Branco', fuel: 'Flex', km: 91270,
    salePrice: D(79900), status: VehicleSaleStatus.AVAILABLE,
    optionals: ['Ar condicionado', 'Direção hidráulica', 'Vidros elétricos', 'Airbag', 'ABS'],
  },
  {
    type: VehicleType.CAR, brand: 'Honda', model: 'Fit', version: '1.5 EX 16V Flex 4P Automático',
    yearFabrication: 2019, yearModel: 2019, color: 'Prata', fuel: 'Flex', km: 88000,
    salePrice: D(76900), status: VehicleSaleStatus.AVAILABLE,
    optionals: ['Ar condicionado', 'Direção elétrica', 'Central multimídia', 'Câmera de ré', 'Airbag', 'ABS'],
  },
  {
    type: VehicleType.CAR, brand: 'Chevrolet', model: 'Onix', version: '1.0 Turbo Flex Plus LT Manual',
    yearFabrication: 2020, yearModel: 2021, color: 'Preto', fuel: 'Flex', km: 78452,
    salePrice: D(66900), status: VehicleSaleStatus.AVAILABLE,
    optionals: ['Ar condicionado', 'Direção elétrica', 'Central multimídia', 'Airbag', 'ABS'],
  },
  {
    type: VehicleType.CAR, brand: 'Chevrolet', model: 'Celta', version: '1.0 MPFI LT 8V Flex 4P Manual',
    yearFabrication: 2012, yearModel: 2013, color: 'Prata', fuel: 'Flex', km: 190517,
    salePrice: D(34900), status: VehicleSaleStatus.AVAILABLE,
    optionals: ['Ar condicionado', 'Direção hidráulica', 'Vidros elétricos'],
  },
];

async function main() {
  // 1) plano + conta
  const plan =
    (await prisma.plan.findUnique({ where: { code: 'pro' } })) ??
    (await prisma.plan.findFirst({ where: { active: true } }));
  if (!plan) throw new Error('Nenhum plano cadastrado - rode `npm run backfill:accounts` antes.');

  const existingAccount = await prisma.account.findFirst({ where: { name: ACCOUNT_NAME } });
  const account =
    existingAccount ??
    (await prisma.account.create({
      data: { name: ACCOUNT_NAME, status: AccountStatus.ACTIVE, planId: plan.id },
    }));

  await prisma.subscription.upsert({
    where: { accountId: account.id },
    update: {},
    create: { accountId: account.id, planId: plan.id, status: SubscriptionStatus.ACTIVE },
  });

  // 2) usuário administrador da loja
  await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { accountId: account.id },
    create: {
      name: 'Washington',
      email: ADMIN_EMAIL,
      passwordHash: hashPassword('Washington@123'),
      role: UserRole.ADMIN,
      accountId: account.id,
    },
  });

  // 3) vitrine publicada
  await prisma.storefront.upsert({
    where: { accountId: account.id },
    update: { slug: SLUG, published: true, config: CONFIG as unknown as Prisma.InputJsonValue },
    create: {
      accountId: account.id,
      slug: SLUG,
      published: true,
      config: CONFIG as unknown as Prisma.InputJsonValue,
    },
  });

  // 4) estoque inicial (só na primeira execução - depois o CRM é a fonte)
  const alreadyHasStock = await prisma.vehicle.count({ where: { accountId: account.id } });
  if (alreadyHasStock === 0) {
    for (const { featured, ...vehicle } of STOCK) {
      await prisma.vehicle.create({
        data: { ...vehicle, accountId: account.id, showOnSite: true, featured: featured ?? false },
      });
    }
    console.log(`Estoque inicial criado: ${STOCK.length} veículos.`);
  } else {
    console.log(`Estoque preservado: a conta já tem ${alreadyHasStock} veículo(s).`);
  }

  console.log('');
  console.log(`Conta "${ACCOUNT_NAME}" pronta.`);
  console.log(`  Vitrine:  /loja/${SLUG}   (subdomínio: ${SLUG}.<seu-domínio>)`);
  console.log(`  Acesso:   ${ADMIN_EMAIL} / Washington@123  - troque a senha no primeiro login`);
  console.log('  Fotos:    adicione pelo CRM em Estoque → editar veículo → galeria');
}

main()
  .catch((err) => {
    console.error('Falha ao provisionar a conta Washington Veículos:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
