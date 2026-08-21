-- Agente ajustável por loja (persona + base de conhecimento) e motor de fluxo.
--
-- Três capacidades novas, todas por conta:
--   1. agent_profiles  - persona, regras comerciais e quais ferramentas o agente tem;
--   2. knowledge_docs  - base de conhecimento da loja (garantia, financiamento, troca);
--   3. flow_policies   - tempos de follow-up, janela de silêncio e encerramento.
--
-- Aditiva: nada é reescrito e nenhuma linha existente muda de significado. Os
-- tickets nascem com nextActionAt NULL, ou seja, fora do motor de fluxo até que
-- a loja ligue a política - que também nasce desligada (ver DEFAULT false).

-- ─── 1. Persona do agente ───────────────────────────────────────────────────
CREATE TABLE "agent_profiles" (
    "accountId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "storeName" TEXT,
    "persona" TEXT,
    "rules" TEXT,
    "canSearchInventory" BOOLEAN NOT NULL DEFAULT true,
    "canQuoteCredit" BOOLEAN NOT NULL DEFAULT true,
    "canScheduleVisit" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_profiles_pkey" PRIMARY KEY ("accountId")
);

-- ─── 2. Base de conhecimento ────────────────────────────────────────────────
CREATE TABLE "knowledge_docs" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "embedding" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_docs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "knowledge_docs_accountId_enabled_idx" ON "knowledge_docs"("accountId", "enabled");

-- Recuperação lexical em português para a ferramenta `consultar_conhecimento`,
-- usada quando o corpus fica grande demais para caber no prefixo do prompt.
-- Índice GIN sobre título+conteúdo; a configuração 'portuguese' já acompanha o
-- Postgres e aplica stemming e stopwords do idioma.
CREATE INDEX "knowledge_docs_fts_idx" ON "knowledge_docs"
  USING GIN (to_tsvector('portuguese', "title" || ' ' || "content"));

-- ─── 3. Política de fluxo ───────────────────────────────────────────────────
-- `enabled` DEFAULT false é deliberado: follow-up é mensagem para o cliente, uma
-- ação externa e irreversível. Uma migration não deve fazer o sistema começar a
-- falar com clientes de todas as lojas sem ninguém ter pedido.
CREATE TABLE "flow_policies" (
    "accountId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "followUpDelaysMin" JSONB NOT NULL DEFAULT '[30, 240, 1440]',
    "autoCloseAfterMin" INTEGER NOT NULL DEFAULT 4320,
    "quietHoursStart" INTEGER NOT NULL DEFAULT 20,
    "quietHoursEnd" INTEGER NOT NULL DEFAULT 8,
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "businessDaysOnly" BOOLEAN NOT NULL DEFAULT false,
    "slaFirstResponseMin" INTEGER NOT NULL DEFAULT 30,
    "followUpMode" TEXT NOT NULL DEFAULT 'ai',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "flow_policies_pkey" PRIMARY KEY ("accountId")
);

-- ─── 4. Relógio do fluxo no ticket + perfil coletado no lead ────────────────
ALTER TABLE "tickets" ADD COLUMN "nextActionAt" TIMESTAMP(3);
ALTER TABLE "tickets" ADD COLUMN "followUpCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "tickets" ADD COLUMN "lastFollowUpAt" TIMESTAMP(3);
ALTER TABLE "tickets" ADD COLUMN "closeReason" TEXT;

CREATE INDEX "tickets_nextActionAt_idx" ON "tickets"("nextActionAt");

ALTER TABLE "leads" ADD COLUMN "profile" JSONB;

-- ─── 5. Chaves estrangeiras ─────────────────────────────────────────────────
ALTER TABLE "agent_profiles" ADD CONSTRAINT "agent_profiles_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "knowledge_docs" ADD CONSTRAINT "knowledge_docs_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "flow_policies"  ADD CONSTRAINT "flow_policies_accountId_fkey"  FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
