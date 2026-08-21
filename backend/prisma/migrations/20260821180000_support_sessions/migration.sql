-- CreateTable
CREATE TABLE "support_sessions" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "supportUserId" TEXT NOT NULL,
    "reason" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "endedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "support_sessions_supportUserId_key" ON "support_sessions"("supportUserId");

-- CreateIndex
CREATE INDEX "support_sessions_accountId_idx" ON "support_sessions"("accountId");

-- CreateIndex
CREATE INDEX "support_sessions_requestedById_idx" ON "support_sessions"("requestedById");

-- AddForeignKey
ALTER TABLE "support_sessions" ADD CONSTRAINT "support_sessions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_sessions" ADD CONSTRAINT "support_sessions_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_sessions" ADD CONSTRAINT "support_sessions_supportUserId_fkey" FOREIGN KEY ("supportUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

