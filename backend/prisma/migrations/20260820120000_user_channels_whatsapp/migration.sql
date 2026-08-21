-- CreateTable
CREATE TABLE "user_channels" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "displayNumber" TEXT NOT NULL,
    "verifiedName" TEXT,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastCheckedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_channels_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_channels_accountId_platform_idx" ON "user_channels"("accountId", "platform");

-- CreateIndex
CREATE UNIQUE INDEX "user_channels_accountId_platform_externalId_key" ON "user_channels"("accountId", "platform", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "user_channels_userId_platform_key" ON "user_channels"("userId", "platform");

-- AddForeignKey
ALTER TABLE "user_channels" ADD CONSTRAINT "user_channels_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_channels" ADD CONSTRAINT "user_channels_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

