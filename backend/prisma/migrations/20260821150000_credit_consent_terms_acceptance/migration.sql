-- Isolamento das consultas de crédito por conta + consentimento do titular +
-- registro de aceite dos Termos de Uso.
--
-- Três lacunas descritas em legal/09-CONSENTIMENTO-CONSULTA-DE-CREDITO.md e
-- legal/07-CONTROLE-DE-VERSOES-E-REGISTRO-DE-ACEITE.md que o código ainda não
-- fechava:
--   1. credit_queries não tinha dono - era a ÚNICA tabela de dado de negócio
--      sem accountId. Consultas (CPF/CNPJ + score) de todas as lojas ficavam
--      no mesmo balde, visíveis entre contas.
--   2. Nada registrava se o titular autorizou a consulta.
--   3. Não existia prova de aceite dos Termos de Uso.

-- ─── 1. credit_queries.accountId (nullable até o backfill) ─────────────────
ALTER TABLE "credit_queries" ADD COLUMN "accountId" TEXT;

DO $$
DECLARE
  fallback_account TEXT;
  orphan_count     BIGINT;
BEGIN
  SELECT "id" INTO fallback_account FROM "accounts" ORDER BY "createdAt" ASC LIMIT 1;

  -- 1a. herda a conta do lead vinculado (o caso comum)
  UPDATE "credit_queries" q
     SET "accountId" = l."accountId"
    FROM "leads" l
   WHERE q."accountId" IS NULL AND q."leadId" = l."id";

  -- 1b. sem lead: herda a conta de quem consultou
  UPDATE "credit_queries" q
     SET "accountId" = u."accountId"
    FROM "users" u
   WHERE q."accountId" IS NULL AND q."actorId" = u."id" AND u."accountId" IS NOT NULL;

  -- 1c. o que sobrou (consulta do agente de IA sem ator humano, ou ator sem
  -- conta) vai para a conta mais antiga - mesma estratégia de fallback já
  -- usada no isolamento de leads/tickets (ver 20260820020000_account_isolation).
  IF fallback_account IS NOT NULL THEN
    UPDATE "credit_queries" SET "accountId" = fallback_account WHERE "accountId" IS NULL;
  END IF;

  SELECT COUNT(*) INTO orphan_count FROM "credit_queries" WHERE "accountId" IS NULL;
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'Isolamento de crédito: % consulta(s) sem accountId e nenhuma conta para adotá-las. Crie uma conta e rode a migration de novo.', orphan_count;
  END IF;
END $$;

ALTER TABLE "credit_queries" ALTER COLUMN "accountId" SET NOT NULL;

-- índices antigos eram globais; os novos começam pela conta
DROP INDEX IF EXISTS "credit_queries_document_idx";
DROP INDEX IF EXISTS "credit_queries_createdAt_idx";
CREATE INDEX "credit_queries_accountId_createdAt_idx" ON "credit_queries"("accountId", "createdAt");
CREATE INDEX "credit_queries_accountId_document_idx" ON "credit_queries"("accountId", "document");

ALTER TABLE "credit_queries" ADD CONSTRAINT "credit_queries_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── 2. Consentimento do titular para consulta de crédito (mora no lead) ───
-- Vale para a consulta mais recente; toda nova consulta regrava os três
-- campos (inclusive quando quem colhe é o agente de IA, a partir do CPF que o
-- próprio titular forneceu voluntariamente no chat).
ALTER TABLE "leads" ADD COLUMN "creditConsentAt" TIMESTAMP(3);
ALTER TABLE "leads" ADD COLUMN "creditConsentSource" TEXT;
ALTER TABLE "leads" ADD COLUMN "creditConsentVersion" TEXT;

-- ─── 3. Registro de aceite dos Termos de Uso ────────────────────────────────
-- Somente inserção: nunca é atualizada nem apagada (ver doc 07 §5.2).
CREATE TABLE "terms_acceptances" (
    "id"              TEXT NOT NULL,
    "accountId"       TEXT NOT NULL,
    "userId"          TEXT NOT NULL,
    "documentCode"    TEXT NOT NULL,
    "documentVersion" TEXT NOT NULL,
    "context"         TEXT NOT NULL,
    "ip"              TEXT,
    "userAgent"       TEXT,
    "acceptedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "terms_acceptances_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "terms_acceptances_accountId_idx" ON "terms_acceptances"("accountId");
CREATE INDEX "terms_acceptances_userId_idx" ON "terms_acceptances"("userId");

ALTER TABLE "terms_acceptances" ADD CONSTRAINT "terms_acceptances_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "terms_acceptances" ADD CONSTRAINT "terms_acceptances_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
