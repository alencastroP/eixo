-- CreateEnum
CREATE TYPE "CreditDocType" AS ENUM ('CPF', 'CNPJ');

-- CreateTable
CREATE TABLE "credit_queries" (
    "id" TEXT NOT NULL,
    "document" TEXT NOT NULL,
    "docType" "CreditDocType" NOT NULL,
    "name" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "report" JSONB NOT NULL,
    "actorId" TEXT,
    "leadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_queries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "credit_queries_document_idx" ON "credit_queries"("document");

-- CreateIndex
CREATE INDEX "credit_queries_createdAt_idx" ON "credit_queries"("createdAt");

-- AddForeignKey
ALTER TABLE "credit_queries" ADD CONSTRAINT "credit_queries_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_queries" ADD CONSTRAINT "credit_queries_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
