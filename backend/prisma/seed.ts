/**
 * Seed de desenvolvimento: usuários + tickets de demonstração.
 *
 * Os tickets são criados pelos MESMOS caminhos de código da aplicação
 * (ingestNormalizedLead + serviços de ticket), então linha do tempo, auditoria,
 * SLA e deduplicação ficam idênticos ao comportamento real.
 *
 * Credenciais (apenas dev — troque em produção):
 *   admin@crm.local  / Admin@123    (Administrador)
 *   carlos@crm.local / Vendedor@123 (Atendente)
 *   ana@crm.local    / Vendedor@123 (Atendente)
 */
import {
  FinancialStatus,
  FinancialType,
  Prisma,
  TicketPriority,
  TicketStatus,
  UserRole,
  VehicleSaleStatus,
  VehicleType,
} from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { hashPassword } from '../src/modules/auth/auth.service';
import { ingestNormalizedLead } from '../src/modules/tickets/ingest.service';
import * as tickets from '../src/modules/tickets/tickets.service';
import type { CurrentUser } from '../src/modules/tickets/tickets.service';

const HOUR = 3_600_000;

/** Estoque de demonstração (sem fotos — adicionadas pela UI via upload). */
async function seedVehicles() {
  if ((await prisma.vehicle.count()) > 0) return;
  const D = (n: number) => new Prisma.Decimal(n);

  const rows: Prisma.VehicleCreateInput[] = [
    {
      type: VehicleType.CAR, brand: 'Honda', model: 'Civic', version: 'EXL 2.0 CVT',
      yearFabrication: 2020, yearModel: 2020, color: 'Prata', fuel: 'Flex', km: 42000,
      plate: 'RIO2A20', fipePrice: D(112900), costPrice: D(98000), salePrice: D(112900),
      status: VehicleSaleStatus.AVAILABLE, optionals: ['Ar condicionado', 'Direção elétrica', 'Bancos de couro', 'Airbag', 'ABS', 'Central multimídia'],
      costs: { create: [
        { category: 'Estética', description: 'Polimento e higienização', amount: D(650) },
        { category: 'Oficina', description: 'Troca de pastilhas de freio', amount: D(480) },
      ] },
    },
    {
      type: VehicleType.CAR, brand: 'Toyota', model: 'Corolla', version: 'XEi 2.0',
      yearFabrication: 2021, yearModel: 2022, color: 'Branco', fuel: 'Flex', km: 28500,
      plate: 'BRA2E19', fipePrice: D(129900), costPrice: D(118000), salePrice: D(134900),
      status: VehicleSaleStatus.PREPARING, optionals: ['Ar condicionado', 'Direção elétrica', 'Airbag', 'ABS', 'Câmera de ré', 'Sensor de estacionamento'],
      costs: { create: [{ category: 'Documentação', description: 'Transferência e vistoria', amount: D(320) }] },
    },
    {
      type: VehicleType.CAR, brand: 'Jeep', model: 'Compass', version: 'Longitude T270',
      yearFabrication: 2022, yearModel: 2023, color: 'Cinza', fuel: 'Flex', km: 19800,
      plate: 'SPO4F55', fipePrice: D(152990), costPrice: D(139000), salePrice: D(158900),
      status: VehicleSaleStatus.RESERVED, optionals: ['Ar condicionado digital', 'Teto solar', 'Bancos de couro', 'Airbag', 'ABS', 'Central multimídia'],
    },
    {
      type: VehicleType.MOTORCYCLE, brand: 'Yamaha', model: 'MT-07', version: 'ABS',
      yearFabrication: 2022, yearModel: 2022, color: 'Azul', fuel: 'Gasolina', km: 12300,
      plate: 'MOT7A22', fipePrice: D(42900), costPrice: D(38000), salePrice: D(43900),
      status: VehicleSaleStatus.SOLD, optionals: ['ABS', 'Partida elétrica'],
    },
    {
      type: VehicleType.CAR, brand: 'Chevrolet', model: 'Onix', version: 'LTZ 1.0 Turbo',
      yearFabrication: 2023, yearModel: 2023, color: 'Preto', fuel: 'Flex', km: 15200,
      plate: 'CHE1X23', fipePrice: D(84900), costPrice: D(76000), salePrice: D(86900),
      status: VehicleSaleStatus.CONSIGNED, optionals: ['Ar condicionado', 'Direção elétrica', 'Airbag', 'ABS', 'Central multimídia'],
    },
    {
      type: VehicleType.HEAVY, brand: 'Volkswagen', model: 'Constellation', version: '24.280 6x2',
      yearFabrication: 2019, yearModel: 2019, color: 'Branco', fuel: 'Diesel', km: 320000,
      plate: 'CAM2C19', fipePrice: D(285000), costPrice: D(260000), salePrice: D(298000),
      status: VehicleSaleStatus.AVAILABLE, optionals: ['Ar condicionado', 'Direção hidráulica', 'Freio a ar'],
      costs: { create: [{ category: 'Oficina', description: 'Revisão de motor e câmbio', amount: D(4200) }] },
    },
  ];

  for (const data of rows) await prisma.vehicle.create({ data });
  console.log(`Seed: ${rows.length} veículos de demonstração criados.`);
}

/** Lançamentos financeiros de demonstração (a pagar/receber, com atrasados). */
async function seedFinance() {
  if ((await prisma.financialEntry.count()) > 0) return;
  const D = (n: number) => new Prisma.Decimal(n);
  const day = (offset: number) => new Date(Date.now() + offset * 24 * 3_600_000);

  const vehicles = await prisma.vehicle.findMany({ select: { id: true, brand: true, model: true }, take: 3 });
  const veh = (i: number) => vehicles[i]?.id ?? null;

  const rows: Prisma.FinancialEntryUncheckedCreateInput[] = [
    { type: FinancialType.RECEIVABLE, category: 'Venda de Veículo', description: 'Entrada Yamaha MT-07 (à vista)', amount: D(43900), dueDate: day(-5), status: FinancialStatus.PAID, paidAt: day(-5) },
    { type: FinancialType.RECEIVABLE, category: 'Venda de Veículo', description: 'Parcela financiamento Compass', amount: D(31780), dueDate: day(8), vehicleId: veh(2) },
    { type: FinancialType.RECEIVABLE, category: 'Comissão', description: 'Comissão intermediação consignado', amount: D(2400), dueDate: day(15) },
    { type: FinancialType.PAYABLE, category: 'Aluguel', description: 'Aluguel do pátio - mês corrente', amount: D(6500), dueDate: day(3) },
    { type: FinancialType.PAYABLE, category: 'Preparação de Veículo', description: 'Funilaria e pintura Corolla', amount: D(2800), dueDate: day(-2), vehicleId: veh(1) },
    { type: FinancialType.PAYABLE, category: 'Combustível', description: 'Abastecimento test-drives', amount: D(480), dueDate: day(-8), status: FinancialStatus.PAID, paidAt: day(-8) },
    { type: FinancialType.PAYABLE, category: 'Comissão', description: 'Comissão vendedor - MT-07', amount: D(1317), dueDate: day(-1) },
    { type: FinancialType.PAYABLE, category: 'Preparação de Veículo', description: 'Revisão completa Civic', amount: D(1130), dueDate: day(6), vehicleId: veh(0) },
  ];
  for (const data of rows) await prisma.financialEntry.create({ data });
  console.log(`Seed: ${rows.length} lançamentos financeiros criados.`);
}

async function upsertUser(name: string, email: string, password: string, role: UserRole) {
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: { name, email, passwordHash: hashPassword(password), role },
  });
}

/** Recuo de datas para dar variedade visual a SLA/kanban (apenas dados de demo). */
async function backdateTicket(ticketId: string, hoursAgo: number) {
  const when = new Date(Date.now() - hoursAgo * HOUR);
  await prisma.ticket.update({ where: { id: ticketId }, data: { createdAt: when, lastCustomerMessageAt: when } });
  await prisma.ticketInteraction.updateMany({ where: { ticketId }, data: { createdAt: when } });
}

async function main() {
  const admin = await upsertUser('Administrador', 'admin@crm.local', 'Admin@123', UserRole.ADMIN);
  const carlos = await upsertUser('Carlos Andrade', 'carlos@crm.local', 'Vendedor@123', UserRole.AGENT);
  const ana = await upsertUser('Ana Souza', 'ana@crm.local', 'Vendedor@123', UserRole.AGENT);

  const asUser = (u: { id: string; role: UserRole; name: string; email: string }): CurrentUser => ({
    id: u.id,
    role: u.role as CurrentUser['role'],
    name: u.name,
    email: u.email,
  });

  await seedVehicles();
  await seedFinance();

  if ((await prisma.ticket.count()) > 0) {
    console.log('Seed: já existem tickets — mantendo dados atuais (apenas usuários garantidos).');
    return;
  }

  // ── OLX: lead novo, sem resposta há horas (SLA estourado) + dedup de 2ª mensagem
  const t1 = await ingestNormalizedLead('olx', {
    externalLeadId: 'olx-1001',
    name: 'João Pereira',
    phone: '11987654321',
    email: 'joao.pereira@example.com',
    message: 'Olá! O Civic ainda está disponível? Aceita troca por um Corolla 2017?',
    vehicle: { externalId: '812345', title: 'Honda Civic EXL 2.0 2020', price: 112900, url: 'https://olx.com.br/anuncio/812345' },
    campaign: 'olx-destaque',
  });
  await backdateTicket(t1.ticketId, 3);
  await ingestNormalizedLead('olx', {
    externalLeadId: 'olx-1001',
    name: 'João Pereira',
    phone: '11987654321',
    message: 'Consigo ir ver o carro no sábado de manhã?',
  }); // mesma plataforma + mesmo lead dentro da janela → anexa ao ticket t1

  // ── OLX: em atendimento, aguardando retorno do cliente
  const t2 = await ingestNormalizedLead('olx', {
    externalLeadId: 'olx-1002',
    name: 'Fernanda Lima',
    phone: '21999887766',
    email: 'fernanda.lima@example.com',
    message: 'Tenho interesse no Argo. Qual o valor à vista?',
    vehicle: { externalId: '812900', title: 'Fiat Argo Drive 1.3 2022', price: 68500, url: 'https://olx.com.br/anuncio/812900' },
  });
  await backdateTicket(t2.ticketId, 26);
  await tickets.addInteraction(
    t2.ticketId,
    { type: 'AGENT_REPLY', body: 'Oi, Fernanda! À vista fazemos por R$ 66.900. Quer agendar uma visita?' },
    asUser(carlos),
  );
  await tickets.updateTicket(t2.ticketId, { status: TicketStatus.WAITING_CUSTOMER }, asUser(carlos));

  // ── Mercado Livre: negociação que virou venda
  const t3 = await ingestNormalizedLead('mercadolivre', {
    externalLeadId: 'ml-501',
    name: 'Maria Santos',
    phone: '31988776655',
    email: 'maria.santos@example.com',
    message: 'A MT-07 é a versão ABS? Vocês facilitam financiamento?',
    vehicle: { externalId: 'MLB2233445566', title: 'Yamaha MT-07 ABS 2022', price: 42900, url: 'https://moto.mercadolivre.com.br/MLB2233445566' },
  });
  await backdateTicket(t3.ticketId, 120);
  await tickets.addInteraction(
    t3.ticketId,
    { type: 'AGENT_REPLY', body: 'Oi, Maria! Sim, ABS de série. Financiamos em até 48x — me passa seu CPF por telefone que simulo pra você.' },
    asUser(carlos),
  );
  await tickets.addInteraction(
    t3.ticketId,
    { type: 'INTERNAL_NOTE', body: 'Cliente pré-aprovada no financiamento. Agendou test ride para quinta.' },
    asUser(carlos),
  );
  await ingestNormalizedLead('mercadolivre', {
    externalLeadId: 'ml-501',
    name: 'Maria Santos',
    message: 'Fechado! Ficou ótima a condição. Confirmo a retirada no sábado.',
  });
  await tickets.updateTicket(t3.ticketId, { status: TicketStatus.CONVERTED }, asUser(carlos));

  // ── Mercado Livre: novo, prioridade alta definida pelo admin
  const t4 = await ingestNormalizedLead('mercadolivre', {
    externalLeadId: 'ml-502',
    name: 'Roberto Alves',
    phone: '41977665544',
    message: 'Quero fechar hoje se tiver desconto no Onix. Pago à vista.',
    vehicle: { externalId: 'MLB9988776655', title: 'Chevrolet Onix LTZ 1.0 Turbo 2023', price: 84900 },
  });
  await tickets.updateTicket(t4.ticketId, { priority: TicketPriority.HIGH }, asUser(admin));

  // ── Webmotors: atribuído pelo admin à Ana, negociação perdida
  const t5 = await ingestNormalizedLead('webmotors', {
    externalLeadId: 'wm-9001',
    name: 'Carlos Eduardo Braga',
    phone: '47966554433',
    email: 'cadu.braga@example.com',
    message: 'O Compass aceita troca com volta? Tenho um HR-V 2019.',
    vehicle: { externalId: '77812', title: 'Jeep Compass Longitude T270 2023', price: 152990 },
    campaign: 'webmotors-vitrine',
  });
  await backdateTicket(t5.ticketId, 72);
  await tickets.updateTicket(t5.ticketId, { assignedToId: ana.id }, asUser(admin));
  await tickets.addInteraction(
    t5.ticketId,
    { type: 'AGENT_REPLY', body: 'Olá, Carlos! Aceitamos sim. Consegue trazer o HR-V para avaliação?' },
    asUser(ana),
  );
  await tickets.addInteraction(
    t5.ticketId,
    { type: 'INTERNAL_NOTE', body: 'Cliente achou a diferença alta e fechou com outra loja. Registrar como perdido.' },
    asUser(ana),
  );
  await tickets.updateTicket(t5.ticketId, { status: TicketStatus.LOST }, asUser(ana));

  // ── Webmotors: novo, livre para ser assumido
  await ingestNormalizedLead('webmotors', {
    externalLeadId: 'wm-9002',
    name: 'Juliana Costa',
    phone: '11955443322',
    email: 'ju.costa@example.com',
    message: 'A CB 500F 2023 tem histórico de revisões na concessionária?',
    vehicle: { externalId: '77990', title: 'Honda CB 500F 2023', price: 38900 },
  });

  // ── Manual: cliente que ligou na loja, registrado pelo Carlos
  await tickets.createManualTicket(
    {
      lead: { name: 'Pedro Martins', phone: '19944332211' },
      message: 'Ligou perguntando por SUVs compactos até R$ 90 mil. Vai passar na loja no fim de semana.',
      vehicleText: 'SUV compacto até R$ 90.000',
    },
    asUser(carlos),
  );

  // ── OLX: antigo e arquivado
  const t8 = await ingestNormalizedLead('olx', {
    externalLeadId: 'olx-1003',
    name: 'Ricardo Nunes',
    phone: '85933221100',
    message: 'Ainda tem a Hilux 2019?',
    vehicle: { externalId: '810001', title: 'Toyota Hilux SRX 2019', price: 189900 },
  });
  await backdateTicket(t8.ticketId, 24 * 20);
  await tickets.updateTicket(t8.ticketId, { status: TicketStatus.ARCHIVED }, asUser(admin));

  const count = await prisma.ticket.count();
  console.log(`Seed concluído: ${count} tickets de demonstração.`);
  console.log('Logins: admin@crm.local / Admin@123 · carlos@crm.local / Vendedor@123 · ana@crm.local / Vendedor@123');
}

main()
  .catch((err) => {
    console.error('Seed falhou:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
