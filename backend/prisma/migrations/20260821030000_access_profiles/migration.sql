-- Perfis de acesso por loja (permissionamento).
--
-- ANTES: o que cada pessoa podia fazer vinha de um enum de duas posições
-- (ADMIN/AGENT) gravado no usuário. Ou a pessoa via tudo - inclusive
-- financeiro, custo do estoque e a tela de usuários -, ou via só a própria
-- caixa de entrada. Não havia meio-termo para o gerente de vendas, para o
-- financeiro ou para o avaliador, e o lojista não tinha como desenhar isso.
--
-- DEPOIS: cada conta tem seus perfis (`access_profiles`), com a lista de
-- permissões que concede, e cada usuário veste um. O enum `users.role`
-- continua na tabela, mas passa a ser DERIVADO do perfil - vale como "quem
-- administra esta loja?" para quem não pergunta por permissão (o aviso de
-- expiração do trial, por exemplo).
--
-- Cada conta recebe os dois perfis que reproduzem o enum anterior, e cada
-- usuário é ligado ao perfil equivalente ao papel que já tinha.
--
-- UMA diferença deliberada: o perfil "Atendente" NÃO nasce com
-- 'vehicles.costs'. Antes, qualquer atendente via preço de compra, gastos de
-- preparação e margem de cada veículo, porque não havia como separar isso de
-- "ver o estoque". Agora há, e o padrão passa a ser o menor privilégio - esse
-- é justamente o dado que o lojista costuma não querer no balcão. Quem quiser
-- o comportamento anterior marca a permissão em Administração › Perfis, e ela
-- passa a valer para todos os atendentes na requisição seguinte.

-- ─── 1. Tabela de perfis ────────────────────────────────────────────────────
CREATE TABLE "access_profiles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "accountId" TEXT NOT NULL,
    "systemKey" TEXT,
    "permissions" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "access_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "access_profiles_accountId_idx" ON "access_profiles"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "access_profiles_accountId_name_key" ON "access_profiles"("accountId", "name");

-- CreateIndex
-- systemKey nulo (perfil criado pelo lojista) não colide: no Postgres, NULL
-- nunca é igual a NULL para efeito de unicidade.
CREATE UNIQUE INDEX "access_profiles_accountId_systemKey_key" ON "access_profiles"("accountId", "systemKey");

-- AddForeignKey
ALTER TABLE "access_profiles" ADD CONSTRAINT "access_profiles_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── 2. Vínculo do usuário ──────────────────────────────────────────────────
ALTER TABLE "users" ADD COLUMN "profileId" TEXT;

-- CreateIndex
CREATE INDEX "users_profileId_idx" ON "users"("profileId");

-- AddForeignKey
-- SET NULL (e não CASCADE): apagar um perfil jamais pode apagar gente. A rota
-- de exclusão já barra perfil em uso; isto é a rede de segurança do banco.
ALTER TABLE "users" ADD CONSTRAINT "users_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "access_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── 3. Backfill: os dois perfis padrão em cada conta ───────────────────────
-- Os textos abaixo espelham DEFAULT_PROFILES em src/modules/roles/permissions.ts
-- (lá para contas novas, aqui para as que já existem).
--
-- O id é gerado no SQL porque cuid() é da camada da aplicação. Formato
-- compatível (texto opaco de 25 caracteres começando por 'c'), com aleatório +
-- relógio para não colidir.
INSERT INTO "access_profiles" ("id", "accountId", "systemKey", "name", "description", "permissions", "createdAt", "updatedAt")
SELECT
    'c' || substr(md5(random()::text || clock_timestamp()::text || a."id"), 1, 24),
    a."id",
    'admin',
    'Administrador',
    'Acesso total à loja, inclusive usuários, financeiro e configurações.',
    ARRAY['*'],
    NOW(),
    NOW()
FROM "accounts" a;

INSERT INTO "access_profiles" ("id", "accountId", "systemKey", "name", "description", "permissions", "createdAt", "updatedAt")
SELECT
    'c' || substr(md5(random()::text || clock_timestamp()::text || a."id"), 1, 24),
    a."id",
    'agent',
    'Atendente',
    'Atende os próprios leads, consulta o estoque e roda análise de crédito.',
    ARRAY['tickets.view', 'tickets.create', 'tickets.reply', 'tickets.bot', 'vehicles.view', 'credit.view', 'credit.query'],
    NOW(),
    NOW()
FROM "accounts" a;

-- ─── 4. Backfill: cada usuário veste o perfil equivalente ao papel atual ────
UPDATE "users" u
   SET "profileId" = p."id"
  FROM "access_profiles" p
 WHERE u."profileId" IS NULL
   AND u."accountId" IS NOT NULL
   AND p."accountId" = u."accountId"
   AND p."systemKey" = CASE WHEN u."role" = 'ADMIN' THEN 'admin' ELSE 'agent' END;

-- Usuário sem conta (resíduo pré-SaaS) fica sem perfil de propósito: a
-- aplicação cai no fallback pelo `role` e o backfill de contas o adota depois.
