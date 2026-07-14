-- Agente de Pré-Venda IA: flag por conversa que liga o atendimento automático.
ALTER TABLE "tickets" ADD COLUMN "bot_enabled" BOOLEAN NOT NULL DEFAULT false;
