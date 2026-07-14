-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('AVAILABLE', 'CONNECTED', 'AUTH_ERROR', 'DISABLED');

-- CreateEnum
CREATE TYPE "DispatchStatus" AS ENUM ('SENT', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "integrations" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'AVAILABLE',
    "syncEnabled" BOOLEAN NOT NULL DEFAULT true,
    "credentials" JSONB,
    "accountLabel" TEXT,
    "connectedAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_dispatches" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "ticketId" TEXT,
    "interactionId" TEXT,
    "status" "DispatchStatus" NOT NULL,
    "detail" TEXT,
    "externalRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_dispatches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "integrations_platform_key" ON "integrations"("platform");

-- CreateIndex
CREATE INDEX "integration_dispatches_platform_createdAt_idx" ON "integration_dispatches"("platform", "createdAt");

-- AddForeignKey
ALTER TABLE "integration_dispatches" ADD CONSTRAINT "integration_dispatches_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
