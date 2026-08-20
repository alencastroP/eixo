-- Vitrine pública (landing page) por conta.
--
-- `vehicles.accountId` entra NULLABLE de propósito: o estoque criado antes do
-- SaaS não tem dono definido no momento da migration. Rode em seguida
-- `npm run backfill:storefronts`, que vincula essas linhas à conta default e
-- cria uma vitrine (despublicada) para cada conta existente.
--
-- A placa deixa de ser única globalmente e passa a ser única por conta: duas
-- lojas podem ter cadastrado o mesmo veículo (consignado que trocou de pátio).
-- Em Postgres, NULLs são distintos num índice único, então veículos sem conta
-- ou sem placa não colidem entre si.

-- DropIndex
DROP INDEX "vehicles_plate_key";

-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "accountId" TEXT,
ADD COLUMN     "featured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "show_on_site" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "storefronts" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "storefronts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "storefronts_accountId_key" ON "storefronts"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "storefronts_slug_key" ON "storefronts"("slug");

-- CreateIndex
CREATE INDEX "vehicles_accountId_status_idx" ON "vehicles"("accountId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_accountId_plate_key" ON "vehicles"("accountId", "plate");

-- AddForeignKey
ALTER TABLE "storefronts" ADD CONSTRAINT "storefronts_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
