-- CreateEnum
CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "BillingMethod" AS ENUM ('CREDIT_CARD', 'PIX', 'BOLETO');

-- CreateEnum
CREATE TYPE "ChargeStatus" AS ENUM ('PENDING', 'CONFIRMED', 'RECEIVED', 'OVERDUE', 'REFUNDED', 'CANCELED', 'CHARGEBACK', 'FAILED');

-- CreateEnum
CREATE TYPE "BillingEventStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED');

-- CreateEnum
CREATE TYPE "UsageMetric" AS ENUM ('AI_MESSAGE', 'CREDIT_QUERY');

-- AlterTable
ALTER TABLE "accounts" ADD COLUMN     "billingEmail" TEXT,
ADD COLUMN     "billingName" TEXT,
ADD COLUMN     "billingPhone" TEXT,
ADD COLUMN     "gatewayCustomerId" TEXT;

-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "description" TEXT,
ADD COLUMN     "highlight" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "priceYearlyCents" INTEGER,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "subscriptions" DROP COLUMN "externalCustomerId",
ADD COLUMN     "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cardBrand" TEXT,
ADD COLUMN     "cardHolder" TEXT,
ADD COLUMN     "cardLast4" TEXT,
ADD COLUMN     "cycle" "BillingCycle" NOT NULL DEFAULT 'MONTHLY',
ADD COLUMN     "gateway" TEXT,
ADD COLUMN     "method" "BillingMethod" NOT NULL DEFAULT 'CREDIT_CARD',
ADD COLUMN     "nextDueDate" TIMESTAMP(3),
ADD COLUMN     "priceCents" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "billing_charges" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "gateway" TEXT NOT NULL DEFAULT 'asaas',
    "externalId" TEXT NOT NULL,
    "status" "ChargeStatus" NOT NULL DEFAULT 'PENDING',
    "method" "BillingMethod" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "description" TEXT,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "invoiceUrl" TEXT,
    "bankSlipUrl" TEXT,
    "receiptUrl" TEXT,
    "nfseStatus" TEXT,
    "nfseUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_events" (
    "id" TEXT NOT NULL,
    "gateway" TEXT NOT NULL DEFAULT 'asaas',
    "externalId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "BillingEventStatus" NOT NULL DEFAULT 'RECEIVED',
    "error" TEXT,
    "accountId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "billing_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_counters" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "metric" "UsageMetric" NOT NULL,
    "period" TEXT NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usage_counters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "billing_charges_externalId_key" ON "billing_charges"("externalId");

-- CreateIndex
CREATE INDEX "billing_charges_accountId_dueDate_idx" ON "billing_charges"("accountId", "dueDate");

-- CreateIndex
CREATE INDEX "billing_charges_status_idx" ON "billing_charges"("status");

-- CreateIndex
CREATE UNIQUE INDEX "billing_events_externalId_key" ON "billing_events"("externalId");

-- CreateIndex
CREATE INDEX "billing_events_status_receivedAt_idx" ON "billing_events"("status", "receivedAt");

-- CreateIndex
CREATE INDEX "billing_events_accountId_idx" ON "billing_events"("accountId");

-- CreateIndex
CREATE INDEX "usage_counters_period_idx" ON "usage_counters"("period");

-- CreateIndex
CREATE UNIQUE INDEX "usage_counters_accountId_metric_period_key" ON "usage_counters"("accountId", "metric", "period");

-- CreateIndex
CREATE INDEX "accounts_gatewayCustomerId_idx" ON "accounts"("gatewayCustomerId");

-- CreateIndex
CREATE INDEX "subscriptions_externalSubscriptionId_idx" ON "subscriptions"("externalSubscriptionId");

-- AddForeignKey
ALTER TABLE "billing_charges" ADD CONSTRAINT "billing_charges_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_charges" ADD CONSTRAINT "billing_charges_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

