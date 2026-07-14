# Auditoria Técnica — CRM Automotivo

**Escopo:** LGPD · Arquitetura/Código · Pentest estático (revisão sem ataques reais)
**Data:** 2026-07-04
**Stack:** Node.js + TypeScript + Express + Prisma (PostgreSQL) · React + Vite (frontend)

---

## 1. Resumo Executivo

O projeto está **arquiteturalmente maduro e acima da média** em segurança para um MVP: camadas bem separadas (routes → service → prisma), validação de entrada com **Zod em 100% dos endpoints**, ORM parametrizado (sem SQL cru), **redação automática de PII nos logs**, criptografia AES-256-GCM das credenciais de integração em repouso, e **anonimização LGPD (direito ao esquecimento) já implementada**.

A auditoria encontrou **0 vulnerabilidades críticas** e **0 dependências com CVE** (`npm audit` limpo em back e front). As lacunas relevantes eram de **hardening operacional** (rate limiting, cabeçalhos de segurança) e de **completude LGPD** (direito de acesso/portabilidade e política de retenção) — **todas corrigidas nesta auditoria** e verificadas end-to-end.

| Frente | Situação antes | Situação depois |
|---|---|---|
| **Segurança** | Sem rate limit, sem headers de segurança, JWT sem pin de algoritmo | ✅ Corrigido (helmet, express-rate-limit, HS256 fixo) |
| **LGPD** | Anonimização OK; faltava acesso/portabilidade e retenção | ✅ Endpoint de exportação + serviço de expurgo |
| **Código** | Tipagem/validação sólidas; sem testes automatizados | ⚠️ Débito de testes documentado |

**Veredito:** pronto para produção após preencher segredos reais, plugar o banco gerenciado e as APIs externas (ver `INTEGRATION.md`) e endereçar os itens de decisão de negócio da seção 5.

---

## 2. Correções aplicadas no código

| # | Severidade | Achado | Correção | Arquivo |
|---|---|---|---|---|
| S1 | **Alta** | Ausência de rate limiting em `login`/`refresh` (força-bruta de credenciais) | `express-rate-limit`: 20 tentativas/15 min por IP, contando só falhas | `middleware/security.ts`, `modules/auth/auth.routes.ts` |
| S2 | **Média** | Cabeçalhos de segurança ausentes (HSTS, X-Frame-Options, CSP, nosniff) | `helmet` na API e no webhook-server, com CSP restritiva e CORP cross-origin p/ imagens | `middleware/security.ts`, `app.ts`, `webhook-server.ts` |
| S3 | **Média** | JWT verificado sem fixar algoritmo (risco de confusão de algoritmo) | `jwt.verify(..., { algorithms: ['HS256'] })` | `middleware/auth.ts` |
| S4 | **Média** | Recepção de webhooks sem rate limit (inundação da fila) | Limiter dedicado: 120 req/min | `middleware/security.ts`, `webhook-server.ts` |
| S5 | **Baixa** | Login com `bcrypt.compareSync` (bloqueia event loop) + timing revela existência de conta | `bcrypt.compare` assíncrono + hash "isca" (constant-time anti-enumeração) | `modules/auth/auth.service.ts` |
| S6 | **Baixa** | Limite global de requisições ausente | Limiter global brando: 300 req/min por IP | `app.ts` |
| L1 | **Alta (LGPD)** | Sem direito de acesso/portabilidade (art. 18 II/V) | `GET /api/leads/:id/export` — JSON portável com todos os dados do titular | `modules/leads/leads.routes.ts` |
| L2 | **Média (LGPD)** | Sem política de retenção/expurgo (art. 15/16) | `lib/retention.ts` + `npm run purge` (webhook payloads, tokens, consultas de crédito, auditoria) | `lib/retention.ts`, `scripts/purge.ts` |

**Verificação executada (não apenas typecheck):**
- Headers confirmados via `curl -D-` na API e no webhook (`Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Cross-Origin-Resource-Policy: cross-origin`, `x-powered-by` removido).
- Rate limit: 20×`401` seguidos de `429` no 21º login. Login legítimo volta a `200` após reset.
- Export LGPD: `200` + `Content-Disposition: attachment` + JSON `{subject, tickets, creditQueries}`.
- Expurgo: `npm run purge` removeu 16 refresh tokens expirados/revogados no banco de dev.

---

## 3. LGPD — Análise detalhada

### 3.1 Inventário de dados pessoais tratados

| Entidade | Dados pessoais | Sensível? | Base legal sugerida |
|---|---|---|---|
| `Lead` | nome, telefone, e-mail, **CPF/CNPJ**, campos extras | CPF/CNPJ = dado que exige cuidado | Legítimo interesse (pré-venda) / execução de contrato |
| `CreditQuery` | **CPF/CNPJ, score, restrições financeiras** | **Sim (financeiro)** | Consentimento / procedimentos preliminares de contrato |
| `TicketInteraction.body` | conteúdo livre de conversas (pode conter PII) | Depende | Legítimo interesse (atendimento) |
| `User` | nome, e-mail (colaboradores) | Não | Execução de contrato de trabalho |
| `WebhookEvent.payload` | payload bruto da plataforma (PII em texto claro) | Depende | Legítimo interesse (transitório) |

### 3.2 Direitos do titular (art. 18)

| Direito | Status |
|---|---|
| Acesso / Portabilidade | ✅ **Implementado** — `GET /api/leads/:id/export` (JSON estruturado) |
| Eliminação / Esquecimento | ✅ **Já existia** — `POST /api/leads/:id/anonymize` (anonimiza lead, mensagens e payloads brutos; preserva métricas) |
| Confirmação de tratamento | ✅ Coberto pela exportação |
| Retenção / término do tratamento | ✅ **Implementado** — `lib/retention.ts` + `npm run purge` |

### 3.3 Boas práticas já presentes
- **Minimização em logs**: `lib/logger.ts` mascara e-mail, telefone, CPF/CNPJ e segredos recursivamente antes de serializar.
- **Minimização em respostas**: `select` explícito em listagens de usuários/leads (nunca devolve `passwordHash`).
- **Criptografia em repouso** das credenciais de integração (`lib/crypto.ts`, AES-256-GCM).
- **Criptografia em trânsito**: garantida por TLS no proxy/LB de produção (HSTS já emitido pela API).

### 3.4 Lacunas que dependem de decisão de negócio → seção 5.

---

## 4. Pentest estático — checklist OWASP

| Categoria | Resultado |
|---|---|
| **Injeção SQL/NoSQL/Comando** | ✅ Sem risco — Prisma parametriza tudo; nenhum `$queryRaw`/`exec`/`eval` no código |
| **XSS** (stored/reflected/DOM) | ✅ Sem risco — React escapa por padrão; **nenhum** `dangerouslySetInnerHTML`/`innerHTML`/`eval` |
| **CSRF** | ✅ Mitigado por design — autenticação via **Bearer token** (sem cookies de sessão ambientes) |
| **Autenticação / sessão** | ✅ JWT 15 min + refresh rotativo com hash SHA-256, revogação e expiração; algoritmo fixado (S3) |
| **Autorização quebrada / IDOR** | ✅ Tickets têm escopo por papel (`scopeFor`); admin-only nos módulos sensíveis. ⚠️ Ver N1 (crédito) |
| **Exposição de dados sensíveis** | ✅ Erros genéricos ao cliente (stack só em log); PII redigida em log |
| **Rate limiting** | ✅ Corrigido (S1, S4, S6) |
| **CORS** | ✅ Restrito a origens configuradas (`CORS_ORIGIN`); sem `credentials` |
| **Dependências (CVE)** | ✅ `npm audit` = 0 vulnerabilidades (back e front) |
| **Upload de arquivos** | ✅ Valida MIME (jpeg/png/webp/gif), 8 MB/imagem, máx. 20, anti-path-traversal. ⚠️ Ver N2 |
| **Cabeçalhos de segurança** | ✅ Corrigido (S2) via helmet |

**Observações de menor severidade (débito técnico, não bloqueiam produção):**
- **N1 (crédito):** `GET /api/credit/queries/:id` e `/recent` são acessíveis a qualquer usuário autenticado, sem escopo por dono. Como o módulo é compartilhado entre vendedores por design, o risco é baixo (IDs são cuid não-sequenciais). *Recomendação:* se o negócio exigir, escopar por `actorId` ou restringir `/recent` a admin.
- **N2 (upload):** validação por prefixo de data URL, sem checagem de "magic bytes". *Recomendação:* validar assinatura binária real antes de gravar (produção com bucket).
- **Tokens no `localStorage`** (frontend): padrão comum, mas vulnerável a roubo via XSS. Como não há XSS e a CSP endurece o front, o risco é aceitável; migrar para cookie `HttpOnly+SameSite` é o próximo nível de maturidade.

---

## 5. Itens que exigem decisão de negócio

1. **Base legal e Aviso de Privacidade**: definir e publicar o Aviso de Privacidade e o mapeamento de base legal por tratamento (tabela 3.1). Vincular o aceite ao fluxo de captação de leads.
2. **Consentimento para consulta de crédito**: a consulta de CPF/CNPJ (humana ou via Agente de IA) deve registrar consentimento explícito do titular. *Sugestão de implementação:* campo `consentAt`/`consentSource` em `Lead` (migration) e checagem antes da tool `consultar_credito_cliente`.
3. **Transferência a terceiros (Agente de IA)**: o conteúdo das conversas é enviado à **Anthropic** para gerar respostas. Isso precisa constar no Aviso de Privacidade e em um DPA (Data Processing Agreement). Decidir se o bot fica ativo por padrão.
4. **Janelas de retenção**: os padrões (webhook 90d, crédito 365d, auditoria 730d) são pontos de partida — validar com o jurídico/DPO e ajustar via `.env`.
5. **Criptografia do CPF/CNPJ em repouso**: `CreditQuery.document` e `Lead.document` ficam em texto claro (dígitos) porque são usados em busca por igualdade e deduplicação. Criptografar exige **cifra determinística/tokenização** para preservar a busca — decisão de arquitetura + custo.
6. **DPO e canal do titular**: designar encarregado (DPO) e expor um canal para requisições de titular (hoje as operações são feitas por admin via API).

---

## 6. Débitos técnicos (pré-produção, não bloqueantes)

- **Testes automatizados ausentes** nos fluxos críticos (auth, autorização por papel, ingestão de leads, consulta de crédito). *Recomendação:* suíte de integração (Vitest + supertest) cobrindo login/refresh, IDOR de tickets, e o pipeline webhook→ticket antes do go-live.
- **Limpeza de refresh tokens** agora existe (`purge`), mas convém agendá-la (cron/Task Scheduler) — documentado em `INTEGRATION.md`.
- **Observabilidade**: logs estruturados existem; falta métricas/tracing (OpenTelemetry) para produção.
- **`trust proxy`** já é ativado em produção para IP real no rate limit — confirmar a topologia do proxy/LB.

---

## 7. Arquitetura — avaliação

**Pontos fortes:** separação clara de responsabilidades; serviço de webhooks isolado e escalável horizontalmente (fila em banco com retry/backoff); worker idempotente com claim condicional; adapters de plataforma plugáveis; sem segredos hardcoded (fallbacks de dev explícitos, `required()` derruba o boot em produção se faltar segredo). Paginação presente nas listagens principais; sem N+1 evidente (includes com `take` controlado).

**Conclusão:** base sólida. Concluídas as correções desta auditoria, o caminho para produção é operacional (segredos + banco + APIs externas), detalhado em `INTEGRATION.md`.
