-- Isolamento por conta do funil de atendimento + credenciais de webhook por loja.
--
-- ANTES: leads, tickets e webhook_events não tinham dono. Qualquer atendente de
-- qualquer loja enxergava o funil inteiro da instalação. E os segredos de
-- webhook (OLX_WEBHOOK_TOKEN & cia.) eram variáveis de ambiente ÚNICAS,
-- compartilhadas por todos os lojistas.
--
-- DEPOIS: cada linha carrega accountId, e cada conta tem sua própria linha em
-- `integrations` com webhookKey (roteamento) + inboundSecret (autenticação).
--
-- Estratégia de backfill, nesta ordem:
--   1. leads/tickets originados do site → conta resolvida pelo slug da vitrine
--      (campaign = 'site:<slug>');
--   2. o restante → conta mais antiga (a "default" do período pré-SaaS);
--   3. se sobrar linha sem conta, a migration ABORTA com mensagem explícita.
--      Preferimos falhar ruidosamente a apagar dado de titular em silêncio.

-- ─── 1. Colunas nullable (backfill acontece antes do NOT NULL) ──────────────
ALTER TABLE "leads" ADD COLUMN "accountId" TEXT;
ALTER TABLE "tickets" ADD COLUMN "accountId" TEXT;
ALTER TABLE "webhook_events" ADD COLUMN "accountId" TEXT;
ALTER TABLE "integrations" ADD COLUMN "accountId" TEXT;
ALTER TABLE "integrations" ADD COLUMN "webhookKey" TEXT;
ALTER TABLE "integrations" ADD COLUMN "inboundSecret" JSONB;

-- ─── 2. Backfill ────────────────────────────────────────────────────────────
DO $$
DECLARE
  fallback_account TEXT;
  orphan_count     BIGINT;
BEGIN
  SELECT "id" INTO fallback_account FROM "accounts" ORDER BY "createdAt" ASC LIMIT 1;

  -- 2a. tickets do site: o slug da vitrine identifica a loja com precisão
  UPDATE "tickets" t
     SET "accountId" = s."accountId"
    FROM "storefronts" s
   WHERE t."accountId" IS NULL
     AND t."campaign" IS NOT NULL
     AND t."campaign" LIKE 'site:' || s."slug" || '%';

  -- 2b. leads herdam a conta do próprio ticket
  UPDATE "leads" l
     SET "accountId" = t."accountId"
    FROM "tickets" t
   WHERE l."accountId" IS NULL
     AND t."leadId" = l."id"
     AND t."accountId" IS NOT NULL;

  -- 2c. o que restou é anterior à vitrine: vai para a conta mais antiga
  IF fallback_account IS NOT NULL THEN
    UPDATE "leads"          SET "accountId" = fallback_account WHERE "accountId" IS NULL;
    UPDATE "tickets"        SET "accountId" = fallback_account WHERE "accountId" IS NULL;
    UPDATE "integrations"   SET "accountId" = fallback_account WHERE "accountId" IS NULL;
  END IF;

  -- 2d. eventos de webhook herdam do ticket que geraram; o resto, fallback
  UPDATE "webhook_events" w
     SET "accountId" = t."accountId"
    FROM "tickets" t
   WHERE w."accountId" IS NULL AND w."ticketId" = t."id";

  IF fallback_account IS NOT NULL THEN
    UPDATE "webhook_events" SET "accountId" = fallback_account WHERE "accountId" IS NULL;
  END IF;

  -- 2e. porta de segurança: nada pode seguir sem dono
  SELECT (SELECT COUNT(*) FROM "leads"          WHERE "accountId" IS NULL)
       + (SELECT COUNT(*) FROM "tickets"        WHERE "accountId" IS NULL)
       + (SELECT COUNT(*) FROM "webhook_events" WHERE "accountId" IS NULL)
       + (SELECT COUNT(*) FROM "integrations"   WHERE "accountId" IS NULL)
    INTO orphan_count;

  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'Isolamento por conta: % linha(s) sem accountId e nenhuma conta para adotá-las. Crie uma conta (npm run create:admin ou npm run backfill:accounts) e rode a migration de novo.', orphan_count;
  END IF;
END $$;

-- ─── 3. webhookKey: identificador opaco de roteamento, um por integração ────
-- Gerado aqui para as linhas preexistentes; novas linhas recebem o valor pela
-- aplicação (crypto.randomBytes em lib/webhook-key.ts).
UPDATE "integrations"
   SET "webhookKey" = 'wh_' || REPLACE(gen_random_uuid()::text, '-', '')
 WHERE "webhookKey" IS NULL;

-- ─── 4. NOT NULL, agora que tudo está preenchido ────────────────────────────
ALTER TABLE "leads"          ALTER COLUMN "accountId"  SET NOT NULL;
ALTER TABLE "tickets"        ALTER COLUMN "accountId"  SET NOT NULL;
ALTER TABLE "webhook_events" ALTER COLUMN "accountId"  SET NOT NULL;
ALTER TABLE "integrations"   ALTER COLUMN "accountId"  SET NOT NULL;
ALTER TABLE "integrations"   ALTER COLUMN "webhookKey" SET NOT NULL;

-- ─── 5. Índices: os antigos eram globais; os novos começam pela conta ───────
DROP INDEX IF EXISTS "leads_platform_externalId_key";
DROP INDEX IF EXISTS "leads_phone_idx";
DROP INDEX IF EXISTS "leads_email_idx";
DROP INDEX IF EXISTS "leads_name_idx";
DROP INDEX IF EXISTS "tickets_status_idx";
DROP INDEX IF EXISTS "tickets_assignedToId_idx";
DROP INDEX IF EXISTS "tickets_platform_idx";
DROP INDEX IF EXISTS "tickets_createdAt_idx";
DROP INDEX IF EXISTS "integrations_platform_key";

CREATE UNIQUE INDEX "leads_accountId_platform_externalId_key" ON "leads"("accountId", "platform", "externalId");
CREATE INDEX "leads_accountId_phone_idx" ON "leads"("accountId", "phone");
CREATE INDEX "leads_accountId_email_idx" ON "leads"("accountId", "email");
CREATE INDEX "leads_accountId_name_idx"  ON "leads"("accountId", "name");

CREATE INDEX "tickets_accountId_status_idx"       ON "tickets"("accountId", "status");
CREATE INDEX "tickets_accountId_assignedToId_idx" ON "tickets"("accountId", "assignedToId");
CREATE INDEX "tickets_accountId_platform_idx"     ON "tickets"("accountId", "platform");
CREATE INDEX "tickets_accountId_createdAt_idx"    ON "tickets"("accountId", "createdAt");

CREATE INDEX "webhook_events_accountId_receivedAt_idx" ON "webhook_events"("accountId", "receivedAt");

CREATE UNIQUE INDEX "integrations_webhookKey_key"        ON "integrations"("webhookKey");
CREATE UNIQUE INDEX "integrations_accountId_platform_key" ON "integrations"("accountId", "platform");

-- ─── 6. Chaves estrangeiras (CASCADE: encerrar a conta leva o funil junto) ──
ALTER TABLE "leads"          ADD CONSTRAINT "leads_accountId_fkey"          FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tickets"        ADD CONSTRAINT "tickets_accountId_fkey"        FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "integrations"   ADD CONSTRAINT "integrations_accountId_fkey"   FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
