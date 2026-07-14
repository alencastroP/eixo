-- CreateEnum
CREATE TYPE "FinancialType" AS ENUM ('PAYABLE', 'RECEIVABLE');

-- CreateEnum
CREATE TYPE "FinancialStatus" AS ENUM ('PENDING', 'PAID');

-- CreateEnum
CREATE TYPE "FiscalKind" AS ENUM ('NFE_ENTRY', 'NFE_EXIT', 'NFE_RETURN', 'NFSE');

-- CreateEnum
CREATE TYPE "FiscalStatus" AS ENUM ('PROCESSING', 'AUTHORIZED', 'CANCELED', 'REJECTED');

-- CreateTable
CREATE TABLE "financial_entries" (
    "id" TEXT NOT NULL,
    "type" "FinancialType" NOT NULL,
    "status" "FinancialStatus" NOT NULL DEFAULT 'PENDING',
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "vehicleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_invoices" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "kind" "FiscalKind" NOT NULL,
    "status" "FiscalStatus" NOT NULL DEFAULT 'PROCESSING',
    "accessKey" TEXT,
    "recipientName" TEXT NOT NULL,
    "recipientDoc" TEXT,
    "operationValue" DECIMAL(12,2) NOT NULL,
    "taxBase" DECIMAL(12,2) NOT NULL,
    "taxRate" DECIMAL(5,4) NOT NULL,
    "taxAmount" DECIMAL(12,2) NOT NULL,
    "taxLabel" TEXT NOT NULL,
    "vehicleId" TEXT,
    "xml" TEXT,
    "rejectReason" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fiscal_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "financial_entries_type_dueDate_idx" ON "financial_entries"("type", "dueDate");

-- CreateIndex
CREATE INDEX "financial_entries_status_idx" ON "financial_entries"("status");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_invoices_number_key" ON "fiscal_invoices"("number");

-- CreateIndex
CREATE INDEX "fiscal_invoices_kind_issuedAt_idx" ON "fiscal_invoices"("kind", "issuedAt");

-- CreateIndex
CREATE INDEX "fiscal_invoices_status_idx" ON "fiscal_invoices"("status");

-- AddForeignKey
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_invoices" ADD CONSTRAINT "fiscal_invoices_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
