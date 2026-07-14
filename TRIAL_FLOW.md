# Fluxo do Teste Gratuito (Trial) — Eixo SaaS

Referência do fluxo de teste de 15 dias, da validação/proteção do CPF e do
modelo multi-tenant que o sustenta.

---

## 1. Arquitetura multi-tenant (resumo)

**Estratégia adotada:** *shared schema* + coluna `account_id` (isolamento por linha).
Escolhida por ser a mais barata de operar e escalar para muitas revendas pequenas.

- **`Account`** = tenant (empresa contratante). É a raiz de isolamento.
- **`User.accountId`** liga cada usuário à sua conta. O `accountId` viaja no **JWT** e
  é relido do banco pelo guard a cada requisição.
- **Guard `requireActiveAccount`** ([middleware/tenant.ts](backend/src/middleware/tenant.ts))
  roda em todas as rotas de negócio: injeta `req.account` e **bloqueia** contas
  não-ativas (403 `ACCOUNT_BLOCKED`).
- **Isolamento já ativo** no módulo de usuários (`User` tem `accountId`): listar/criar/
  editar é escopado à conta — tentativa de acessar usuário de outra conta por ID na URL
  retorna 404 (anti-IDOR cross-tenant).

> **Retrofit pendente (faseado):** as tabelas de dado de cliente pré-existentes
> (`Vehicle`, `Ticket`, `Lead`, `CreditQuery`, `FinancialEntry`, `FiscalInvoice`, …)
> ainda **não** têm `account_id` — hoje compartilham a "Conta Demonstração". O caminho
> de conclusão está em **§5**. O mecanismo (guard + `req.account.id`) já está pronto para
> plugar a extensão de escopo do Prisma.

---

## 2. Modelo de dados (contas, planos, assinaturas, trial)

| Tabela | Papel |
|---|---|
| `plans` | Catálogo de planos (`trial`, `pro`, `business`). Fonte: [billing/plans.ts](backend/src/modules/billing/plans.ts) |
| `accounts` | Tenant. `status` (TRIAL/ACTIVE/PAST_DUE/SUSPENDED/EXPIRED/CANCELED), `trialStartedAt`, `trialEndsAt` |
| `subscriptions` | Assinatura 1:1 da conta + **hooks de billing** (`externalCustomerId`, `externalSubscriptionId`) |
| `trial_cpf_registry` | Registro anti-fraude de CPFs que já usaram trial. `cpfHash` **UNIQUE** |
| `users` | Ganhou `accountId` (FK) |

Status que **liberam** acesso: `TRIAL`, `ACTIVE`. Todos os demais bloqueiam login e rotas.

---

## 3. Fluxo do trial (passo a passo)

1. **Login** → botão **"🚀 Teste grátis de 15 dias"** leva a `/trial`
   ([LoginPage](frontend/src/pages/LoginPage.tsx) → [TrialSignupPage](frontend/src/pages/TrialSignupPage.tsx)).
2. **Formulário:** nome, e-mail, **CPF (máscara + validação ao vivo)**, senha, nome da empresa.
   O CPF é validado no cliente ([utils/cpf.ts](frontend/src/utils/cpf.ts)) só para feedback.
3. **`POST /api/trial/signup`** (público, rate-limited). O back-end
   ([trial.service.ts](backend/src/modules/trial/trial.service.ts)):
   a. **Valida o CPF** pelo algoritmo oficial (mod 11) — nunca só regex/formato.
   b. **Hash do CPF** (`SHA-256 + pepper`) e consulta em `trial_cpf_registry` **antes** de
      criar a conta. Se já existe → `409 CPF_ALREADY_USED` + **log anti-fraude** (CPF mascarado, IP).
   c. E-mail único (controle secundário — não substitui a regra do CPF).
   d. Em transação: cria `Account` (status **TRIAL**, `trialStartedAt=agora`,
      `trialEndsAt=agora+15d`), `User` **ADMIN** da conta, `Subscription` (TRIALING) e a
      linha em `trial_cpf_registry` (hash + CPF cifrado).
   e. **Auto-login:** devolve a sessão (tokens). O front chama `/me`, recebe a conta e
      mostra o **banner de trial** com os dias restantes.
4. **Expiração:** o cron `npm run expire-trials`
   ([expiry.service.ts](backend/src/modules/billing/expiry.service.ts)):
   - Contas TRIAL vencidas → **EXPIRED** (dados preservados; acesso bloqueado).
   - Aviso 1–2 dias antes (stub de e-mail via log — plugar SMTP, ver INTEGRATION.md).
   Agende de hora em hora: `0 * * * * node dist/scripts/expire-trials.js`.
5. **Acesso bloqueado:** login de conta expirada → `403 ACCOUNT_BLOCKED`; usuário já logado
   cai na tela **"Acesso pausado"** ([TrialBanner.tsx](frontend/src/components/TrialBanner.tsx)).

---

## 4. Como o CPF é validado e protegido (LGPD)

- **Validação real** (dígitos verificadores, mod 11) em [lib/document.ts](backend/src/lib/document.ts)
  — no **back-end** (autoritativo) e espelhada no front (feedback).
- **Nunca em texto claro.** [lib/cpf-token.ts](backend/src/lib/cpf-token.ts):
  - `cpfHash = HMAC-SHA256(pepper, cpf)` → unicidade **irreversível**. O **pepper** vive
    fora do banco (`TRIAL_CPF_PEPPER`, cofre em produção) — um dump do banco sozinho não
    permite reverter por força-bruta o espaço de CPFs.
  - `cpfSealed` = **AES-256-GCM** do CPF (reusa [lib/crypto.ts](backend/src/lib/crypto.ts)),
    só para uso administrativo/antifraude.
- **Unicidade no banco**, não só na aplicação: `@@unique` em `trial_cpf_registry.cpfHash`
  (mesmo numa corrida de dois cadastros simultâneos, a constraint vence → `P2002` → 409).
- **Persistência anti-fraude:** a linha do CPF **sobrevive** à remoção da conta
  (`accountId` vira NULL) — o bloqueio do CPF é permanente.
- **Anti-abuso:** o bloqueio é **pelo CPF** (troca de e-mail não burla). Controle secundário:
  e-mail único + **rate limit** de 5 cadastros/hora por IP (`RATE_LIMIT_TRIAL_PER_HOUR`).
- **Log de reuso** de CPF registrado para auditoria (sem PII em claro).

> **⚠️ Pendência LGPD (rodar o prompt de adequação focado neste dado):** definir a
> **base legal** ("controle de unicidade de trial / prevenção à fraude" = legítimo interesse)
> e a **retenção** do `trial_cpf_registry`. Como o objetivo é impedir reuso do gratuito, o
> `cpfHash` tende a ser retido por longo prazo; já o `cpfSealed` pode ter expurgo mais curto
> (ex.: após conversão/encerramento). Incluir o tratamento no Aviso de Privacidade.

---

## 5. Concluir o isolamento multi-tenant (retrofit faseado)

Para isolar as tabelas de negócio restantes:

1. **Migration:** adicionar `account_id String` (FK → `accounts`) em `Vehicle`, `Ticket`,
   `Lead`, `CreditQuery`, `FinancialEntry`, `FiscalInvoice`, `Integration`, `WebhookEvent`,
   `Setting` (por-conta), com índice composto `@@index([accountId, <chave de busca>])`.
2. **Backfill:** `UPDATE ... SET account_id = <Conta Demonstração>` para os dados atuais;
   depois `SET NOT NULL`.
3. **Escopo automático:** aplicar uma **extensão do Prisma Client** que injeta
   `where: { accountId: ctx.accountId }` em `findMany/findUnique/update/delete` e preenche
   `accountId` no `create`, usando `req.account.id` propagado por AsyncLocalStorage. Assim
   nenhuma query precisa lembrar de filtrar — defesa em profundidade contra IDOR cross-tenant.
4. **Filas/jobs:** o worker de leads e o Agente de IA passam a carregar `accountId` no
   contexto do job (o `WebhookEvent` ganha `account_id` no enfileiramento).

---

## Comandos úteis

```bash
npm run backfill:accounts   # semeia planos + conta default e vincula usuários (idempotente)
npm run expire-trials       # expira trials vencidos + avisa pré-expiração (agendar via cron)
npm run purge               # expurgo de retenção LGPD (inclui limpeza geral)
```

**Contas de teste após o backfill:** os usuários demo (`admin@crm.local` etc.) pertencem à
"Conta Demonstração" (ACTIVE). Novos trials criam contas próprias e isoladas.
