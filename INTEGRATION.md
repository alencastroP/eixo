# Guia de Integração para Produção — CRM Automotivo

Este documento lista **tudo que precisa ser preenchido/plugado** para o sistema sair
do modo mock/dev e ir ao ar. O código está estruturado para que cada troca seja
**localizada** (um arquivo por integração), sem tocar no resto da aplicação.

---

## ✅ Checklist rápido de go-live

- [ ] Provisionar PostgreSQL gerenciado e definir `DATABASE_URL`
- [ ] Gerar segredos fortes: `JWT_ACCESS_SECRET`, `CREDENTIALS_SECRET`
- [ ] Rodar `npm run build` + `npm run prisma:deploy` + `npm run seed` (1ª vez)
- [ ] Configurar `CORS_ORIGIN` com o domínio real do frontend
- [ ] Definir tokens/segredos de webhook por plataforma (OLX/ML/Webmotors)
- [ ] Definir `ANTHROPIC_API_KEY` (Agente de IA) — opcional
- [ ] Substituir mocks das APIs externas (seções 2 a 6) conforme necessidade
- [ ] Agendar `npm run purge` (retenção LGPD) via cron
- [ ] Servir o frontend atrás de HTTPS com CSP própria
- [ ] Publicar o Aviso de Privacidade e mapear base legal (ver `AUDITORIA.md` §5)

---

## 1. Banco de dados real

**Hoje:** desenvolvimento usa `embedded-postgres` (script `npm run db:dev`, porta 5433).
O código de produção **já usa Prisma apontando para `DATABASE_URL`** — não há mock de
banco a trocar, apenas a string de conexão.

### Passo a passo
1. Provisione um PostgreSQL 14+ gerenciado (RDS, Cloud SQL, Neon, Supabase…).
2. Defina no ambiente:
   ```env
   DATABASE_URL="postgresql://USUARIO:SENHA@HOST:5432/crm?schema=public&sslmode=require"
   ```
3. Aplique o schema (migrations versionadas em `backend/prisma/migrations/`):
   ```bash
   npm run prisma:deploy      # prisma migrate deploy (idempotente, sem prompts)
   ```
4. (1ª vez) popule dados iniciais — **ajuste as senhas do seed antes**:
   ```bash
   npm run seed
   ```
5. Suba os processos:
   ```bash
   npm run build
   npm run start           # API (porta PORT, padrão 3001)
   npm run start:webhooks  # recepção de webhooks (WEBHOOK_PORT, padrão 3002)
   npm run start:worker    # worker de leads — em produção, processo próprio
                           # (e defina WORKER_INLINE=false no webhook-server)
   ```

> **Schema final:** `backend/prisma/schema.prisma`. Entidades: `User`, `RefreshToken`,
> `Lead`, `Ticket`, `TicketInteraction`, `AuditLog`, `WebhookEvent`, `Integration`,
> `IntegrationDispatch`, `CreditQuery`, `Setting`, `Vehicle` (+ fotos/custos),
> `FinancialEntry`, `FiscalInvoice`.

---

## 2. Plataformas de anúncios (OLX, Mercado Livre, Webmotors)

Cada plataforma é um **adapter** em `backend/src/integrations/<plataforma>/`. Todos
implementam a mesma interface (`core/types.ts → LeadSourceAdapter`): `verifyRequest`,
`normalize`, `validateCredentials`, `sendReply`. **É aqui que os 3 pontos mock são trocados.**

### 2.1 Recepção de leads (INBOUND) — já funcional
- **Endpoint:** `POST /webhooks/:platform` (ex.: `/webhooks/olx`) no serviço de webhooks.
- **Autenticação:** header por plataforma. OLX: `x-olx-token` = `OLX_WEBHOOK_TOKEN`.
  Mercado Livre: HMAC do corpo bruto com `MERCADOLIVRE_WEBHOOK_SECRET`. Webmotors:
  `WEBMOTORS_WEBHOOK_TOKEN`.
- **O que fazer:** cadastrar a URL pública `https://SEU_HOST/webhooks/<plataforma>` no
  painel da plataforma e definir os segredos no `.env`. O `normalize()` já converte o
  payload real para o shape interno (ver `samples/olx-lead.json`).
- **Payload esperado / retry:** o webhook responde `202` e enfileira em `webhook_events`;
  o worker normaliza com **retry e backoff** (`WORKER_MAX_ATTEMPTS`, `WORKER_RETRY_DELAY_MS`).
  Payload malformado falha direto (não adianta repetir).

### 2.2 Validação de credenciais + envio de resposta (OUTBOUND) — **MOCK a trocar**
- **Onde:** funções `validate<Plataforma>Credentials` e `send<Plataforma>Reply` em cada
  `*.adapter.ts`. Ex.: `olx.adapter.ts:55` (validação) e `olx.adapter.ts:73` (envio).
- **Autenticação:** as credenciais do lojista são cifradas em repouso (AES-256-GCM) e
  informadas na tela de Integrações do CRM.
- **Substituição (exemplo OLX outbound):**
  ```ts
  // olx.adapter.ts → sendOlxReply(): trocar o bloco mock por:
  const resp = await fetch('https://api.olx.com.br/v1/messages', {
    method: 'POST',
    headers: { Authorization: `Bearer ${input.credentials.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ leadId: input.externalLeadId, message: input.body }),
  });
  if (!resp.ok) return { ok: false, error: `OLX ${resp.status}` };
  return { ok: true, externalRef: (await resp.json()).id };
  ```
- **Tratamento de erro:** `sendReply` **nunca lança** — devolve `{ ok, error }`; o
  resultado vira log de despacho (`integration_dispatches`, status SENT/FAILED/SKIPPED)
  e não bloqueia a resposta no CRM. Mantenha esse contrato.

| Variável | Plataforma | Onde obter |
|---|---|---|
| `OLX_WEBHOOK_TOKEN` | OLX | Painel de desenvolvedor OLX (parceria comercial) |
| `MERCADOLIVRE_WEBHOOK_SECRET` | Mercado Livre | App em developers.mercadolivre.com |
| `WEBMOTORS_WEBHOOK_TOKEN` | Webmotors | Credenciamento de lojista Webmotors |

---

## 3. Agente de Pré-Venda IA (Anthropic Claude) — **integração real, só falta a chave**

- **Onde:** `backend/src/modules/aiAgent/` (`agent.service.ts`, `tools.ts`, `prompt.ts`).
  Já usa a **SDK oficial** `@anthropic-ai/sdk` (não é mock).
- **Autenticação:** `ANTHROPIC_API_KEY`. Sem a chave, `aiEnabled()` é `false` e o bot fica
  dormente (atendimento 100% humano) — nada quebra.
- **Modelo:** `ANTHROPIC_MODEL` (padrão `claude-opus-4-8`). Para alto volume/menor
  latência e custo, use `claude-sonnet-5` ou `claude-haiku-4-5`.
- **Endpoint:** `POST https://api.anthropic.com/v1/messages` (a SDK cuida disso).
- **⚠️ LGPD:** o conteúdo das conversas é enviado à Anthropic. Declarar no Aviso de
  Privacidade e firmar DPA antes de ativar em produção (ver `AUDITORIA.md` §5.3).

```env
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-opus-4-8
```

---

## 4. Bureau de crédito (Serasa / SPC / Boa Vista) — **MOCK a trocar**

- **Onde:** `backend/src/modules/credit/bureau.mock.ts` → função `generateReport(digits, docType)`.
  Determinística (mesmo documento → mesmo resultado).
- **Contrato a preservar:** a interface `CreditReport` (score, band, restrições, limite).
  O resto do módulo (`credit.service.ts`, rotas, front) **não muda** se o shape for mantido.
- **Substituição:** trocar o corpo de `generateReport` por uma chamada autenticada ao
  bureau escolhido, mapeando a resposta para `CreditReport`:
  ```ts
  // bureau.mock.ts → generateReport(): substituir por chamada real
  const resp = await fetch('https://api.serasa.com.br/credit/v1/score', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.SERASA_API_KEY}` },
    body: JSON.stringify({ document: digits, type: docType }),
  });
  // ...mapear resp → CreditReport (score, band, restrictions, credit.limit, ...)
  ```
- **Autenticação:** token do bureau (adicionar `SERASA_API_KEY` ou equivalente ao `.env`).
- **Erro/retry:** encapsular timeout e retry; em falha, lançar erro tratável (a rota já
  responde erro amigável). **Nunca logar o documento em texto claro** (use `maskDocument`).

---

## 5. Emissão de Nota Fiscal (SEFAZ / NF-e, NFS-e) — **MOCK a trocar**

- **Onde:** `backend/src/modules/fiscal/fiscal.service.ts` → função de emissão (`fiscal.service.ts:144`)
  e geração de chave de acesso (`:71`). Hoje simula autorização (>90% autorizadas) e gera
  chave/XML fictícios.
- **Substituição:** trocar a emissão mock pela chamada ao webservice da SEFAZ (ou a um
  provedor tipo Focus NFe / eNotas / NFe.io, que abstrai a SEFAZ):
  ```ts
  // fiscal.service.ts → emit(): substituir bloco mock por
  const resp = await fetch('https://api.provedor-nfe.com/v2/nfe', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.NFE_API_KEY}` },
    body: JSON.stringify({ /* dados da nota + certificado A1 */ }),
  });
  // mapear resp → { status, accessKey, xml, rejectReason }
  ```
- **Autenticação:** `NFE_API_KEY` + **certificado digital A1** da loja (arquivo/senha).
- **Erro/retry:** emissão é assíncrona na SEFAZ (`PROCESSING` → `AUTHORIZED`/`REJECTED`);
  implementar polling/consulta de status. O schema `FiscalInvoice` já prevê esses estados.

---

## 6. Itens de infraestrutura complementares

### 6.1 Armazenamento de imagens (estoque)
- **Onde:** `backend/src/lib/storage.ts`. Hoje grava em `./uploads` (disco local).
- **Substituição:** trocar `saveImageDataUrl`/`deleteByPublicUrl` por SDK do bucket
  (S3/GCS). O resto do código só conhece a **URL pública** retornada — assinatura mantida.
- **Produção:** servir as imagens por CDN e remover o `express.static('/uploads')`.

### 6.2 Descrição de anúncio por IA (opcional)
- **Onde:** `backend/src/modules/vehicles/description.generator.ts`. Hoje é composição por
  regras (offline, determinística). Para usar IA real, substituir o corpo por uma chamada
  ao Claude com os mesmos campos — assinatura e retorno permanecem iguais.

### 6.3 Retenção de dados (LGPD)
- **Comando:** `npm run purge` (implementado em `lib/retention.ts`).
- **Agendar** (ex.: cron diário às 3h):
  ```cron
  0 3 * * * cd /app/backend && node dist/scripts/purge.js
  ```
- Janelas configuráveis: `RETENTION_WEBHOOK_EVENT_DAYS`, `RETENTION_CREDIT_QUERY_DAYS`,
  `RETENTION_AUDIT_LOG_DAYS`.

---

## 7. Variáveis de ambiente — referência

Arquivo modelo completo: **`backend/.env.example`**. Segredos que **precisam ser
preenchidos** antes do go-live:

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DATABASE_URL` | ✅ | Conexão PostgreSQL de produção (com `sslmode=require`) |
| `JWT_ACCESS_SECRET` | ✅ | Segredo forte (≥32 bytes aleatórios) — assina os access tokens |
| `CREDENTIALS_SECRET` | ✅ | Segredo forte — cifra credenciais de integração em repouso |
| `CORS_ORIGIN` | ✅ | Domínio(s) do frontend, separados por vírgula |
| `OLX_WEBHOOK_TOKEN` / `MERCADOLIVRE_WEBHOOK_SECRET` / `WEBMOTORS_WEBHOOK_TOKEN` | ⚠️ | Por plataforma que for ativar |
| `ANTHROPIC_API_KEY` | ⚠️ | Só se o Agente de IA for usado |
| `SERASA_API_KEY` / `NFE_API_KEY` | ⚠️ | Ao plugar bureau/NF-e reais (seções 4 e 5) |
| `RATE_LIMIT_*`, `RETENTION_*` | ➖ | Têm padrões sensatos; ajuste conforme política |

> **Gerar segredos:** `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

Em produção, `JWT_ACCESS_SECRET`, `CREDENTIALS_SECRET` e chaves de API **devem vir de um
cofre** (AWS Secrets Manager / GCP Secret Manager / Vault), nunca do `.env` versionado.
O boot da aplicação **falha explicitamente** (fail-fast) se um segredo obrigatório faltar
em produção.
