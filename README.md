# CRM Automotivo — Módulo de Atendimento (Tickets)

CRM web para venda/revenda de carros e motos. Este repositório entrega o primeiro módulo funcional — **Atendimento (Tickets)** — com a arquitetura de dados e de código preparada para os módulos futuros (Estoque, Relatórios) sem retrabalho estrutural.

Leads recebidos de plataformas de anúncio (OLX, Mercado Livre, Webmotors) viram **tickets rastreáveis**, com histórico, status, responsável, SLA e auditoria.

## Arquitetura

```
 OLX ─┐
 ML  ─┼─ POST /webhooks/:platform ──► webhook-server (:3002)      ◄─ processo independente,
 WM  ─┘        (adapter autentica)         │                          escala horizontalmente
                                           ▼ persiste payload BRUTO
                                    ┌──────────────┐
                                    │ webhook_events│  fila persistente em banco
                                    └──────┬───────┘  (pico/instabilidade nunca perde lead)
                                           ▼
                                    worker lead-processor          ◄─ inline em dev,
                                    adapter.normalize() → ingest      processo próprio em prod
                                    (dedup + ticket + timeline)
                                           │
                 PostgreSQL ◄──────────────┘
                     ▲
                     │ Prisma
              API CRM (:3001) ── JWT + papéis (ADMIN / AGENT)
                     ▲
                     │ /api (proxy em dev)
              React + Vite (:5173) ── lista, kanban, detalhe do ticket
```

**Pontos-chave**

- **Recepção desacoplada do processamento:** o webhook-server só autentica e enfileira (responde `202` em ~1 ms). Quem transforma payload em ticket é o worker, com retry + backoff. Payload inválido vira evento `FAILED` reprocessável via API admin — o dado bruto nunca se perde.
- **Padrão adapter por plataforma:** todo conhecimento sobre payload/autenticação de cada plataforma vive em `backend/src/integrations/<slug>/`. O core (fila, worker, tickets) só conhece o formato interno `NormalizedLead`.
- **Deduplicação:** mesmo lead + mesma plataforma com ticket aberto dentro da janela (`DEDUP_WINDOW_HOURS`, padrão 72 h) → a mensagem é anexada ao ticket existente em vez de criar outro.
- **`platform` é string (slug), não enum de banco:** adicionar plataforma nova não exige migration.

## Stack

| Camada | Tecnologia |
| --- | --- |
| Front-end | React 18 + TypeScript + Vite |
| Back-end | Node.js + Express 4 + TypeScript |
| Banco | PostgreSQL (16+ via Docker, ou 18 embutido para dev) |
| ORM | Prisma 6 |
| Auth | JWT (access 15 min) + refresh token com rotação e revogação |
| Fila | Tabela `webhook_events` + worker com claim atômico (multi-instância safe) |

## Como rodar

### 1. Banco de dados (escolha UMA opção)

**Opção A — Docker (recomendada):**
```bash
docker compose up -d        # Postgres em localhost:5432 (crm/crm)
```
Ajuste `backend/.env`: `DATABASE_URL="postgresql://crm:crm@localhost:5432/crm?schema=public"`

**Opção B — Postgres embutido (sem Docker, sem instalar nada):**
```bash
cd backend
npm run db:dev              # baixa/roda binários reais do Postgres em localhost:5433
```
Deixe o terminal aberto. O `.env.example` já aponta para esta opção.

### 2. Backend
```bash
cd backend
npm install
copy .env.example .env      # revise os valores
npx prisma migrate deploy   # aplica as migrations
npm run seed                # usuários + 8 tickets de demonstração
npm run dev                 # API em http://localhost:3001
```
Em outro terminal:
```bash
cd backend
npm run dev:webhooks        # serviço de webhooks em http://localhost:3002 (worker embutido)
```

### 3. Frontend
```bash
cd frontend
npm install
npm run dev                 # http://localhost:5173 (proxy /api → :3001)
```

### Credenciais de demonstração

| Usuário | Senha | Papel |
| --- | --- | --- |
| `admin@crm.local` | `Admin@123` | Administrador — vê tudo, reatribui, anonimiza |
| `carlos@crm.local` | `Vendedor@123` | Atendente — vê os próprios tickets + não atribuídos |
| `ana@crm.local` | `Vendedor@123` | Atendente |

### Simulando um lead chegando

```bash
curl -X POST http://localhost:3002/webhooks/olx ^
  -H "Content-Type: application/json" ^
  -H "x-olx-token: dev-olx-token" ^
  -d @backend/samples/olx-lead.json
```
Em ~2 s o worker processa e o ticket aparece no CRM. Envie duas vezes e veja a deduplicação (mesmo ticket, duas mensagens). Há exemplos prontos para as três plataformas em `backend/samples/` e um `backend/requests.http` para a extensão REST Client do VS Code (o webhook do Mercado Livre exige assinatura HMAC — instruções no próprio arquivo).

### Scripts úteis (backend)

| Script | O que faz |
| --- | --- |
| `npm run dev` / `dev:webhooks` / `dev:worker` | API / webhooks / worker standalone em watch |
| `npm run db:dev` | Postgres embutido de desenvolvimento (porta 5433) |
| `npm run db:reset-data` | Esvazia os dados (mantém schema) — combine com `npm run seed` |
| `npm run prisma:migrate` | Cria/aplica migrations em dev |
| `npm run build` / `start` / `start:webhooks` / `start:worker` | Build e execução de produção |

## Estrutura de pastas

```
backend/
├── prisma/
│   ├── schema.prisma          # modelos + placeholders comentados dos módulos futuros
│   └── seed.ts                # demo data criada pelos MESMOS serviços da aplicação
├── samples/                   # payloads de exemplo por plataforma
└── src/
    ├── server.ts              # entrada: API principal (:3001)
    ├── webhook-server.ts      # entrada: recepção de webhooks (:3002) — processo independente
    ├── app.ts                 # express app da API
    ├── config/env.ts          # variáveis de ambiente validadas (fail fast em prod)
    ├── lib/                   # prisma, erros, logger com redação de PII
    ├── middleware/            # auth JWT, papéis, error handler, access log
    ├── integrations/          # ★ camada isolada de plataformas (padrão adapter)
    │   ├── core/              #   contrato LeadSourceAdapter + registry + helpers
    │   ├── olx/  mercadolivre/  webmotors/
    │   └── index.ts           #   registro único dos adapters
    ├── modules/
    │   ├── auth/              # login, refresh com rotação, logout
    │   ├── users/             # CRUD de usuários (admin)
    │   ├── tickets/           # serviço de tickets + ingestão normalizada + rotas
    │   ├── leads/             # anonimização LGPD
    │   └── audit/             # trilha de auditoria
    ├── webhooks/              # rota genérica /webhooks/:platform + admin da fila
    └── workers/lead-processor.ts  # consumidor da fila (retry, backoff, claim atômico)

frontend/
└── src/
    ├── api/                   # client fetch com refresh automático + endpoints tipados
    ├── auth/AuthContext.tsx
    ├── components/            # layout, badges, modal de ticket manual
    └── pages/                 # Login · Lista (filtros/busca/SLA) · Kanban (drag-and-drop) · Detalhe (timeline)
```

## Como adicionar uma nova plataforma de integração

Exemplo: Facebook Marketplace (`slug: facebook`). **Nenhum código do core muda.**

1. **Crie o adapter** em `backend/src/integrations/facebook/facebook.adapter.ts`:

```ts
import type { Request } from 'express';
import { z } from 'zod';
import { AdapterPayloadError, type LeadSourceAdapter, type NormalizedLead, type VerifyResult } from '../core/types';
import { normalizePhone, safeEqual } from '../core/verify';

const payloadSchema = z.object({ /* shape do payload da plataforma */ }).passthrough();

export const facebookAdapter: LeadSourceAdapter = {
  platform: 'facebook',
  displayName: 'Facebook Marketplace',

  // autenticação específica da plataforma (token, HMAC, mTLS…)
  verifyRequest(req: Request): VerifyResult {
    const secret = process.env.FACEBOOK_WEBHOOK_TOKEN;
    if (!secret) return { ok: false, configured: false, reason: 'FACEBOOK_WEBHOOK_TOKEN não configurado' };
    const token = req.header('x-fb-token');
    return token && safeEqual(token, secret)
      ? { ok: true }
      : { ok: false, configured: true, reason: 'token inválido' };
  },

  // payload bruto → formato interno único
  normalize(payload: unknown): NormalizedLead {
    const parsed = payloadSchema.safeParse(payload);
    if (!parsed.success) throw new AdapterPayloadError('facebook', 'payload inesperado', parsed.error.issues);
    return {
      externalLeadId: /* id do lead na plataforma (chave de dedup) */,
      name: /* … */,
      phone: normalizePhone(/* … */),
      message: /* … */,
      vehicle: { externalId: /* id do anúncio */, title: /* … */ },
    };
  },
};
```

2. **Registre** em `backend/src/integrations/index.ts`:
```ts
import { facebookAdapter } from './facebook/facebook.adapter';
registerAdapter(facebookAdapter);
```

3. **Configure a credencial** no `.env` (`FACEBOOK_WEBHOOK_TOKEN=...`) — nunca hardcoded.

Pronto: `POST /webhooks/facebook` já aceita, enfileira e processa leads; o slug aparece em tickets, filtros e relatórios futuros. Se a plataforma enviar notificações "magras" (id para buscar via API, como o Mercado Livre real), esse fetch também fica dentro do adapter.

## Segurança & LGPD

- **PII nunca em logs:** o logger (`lib/logger.ts`) redige recursivamente chaves sensíveis (telefone, e-mail, CPF, senha, token) e mascara padrões de e-mail/telefone em strings livres. Os access logs registram só método/rota/status/ids.
- **Senhas** com bcrypt (custo 10). **Refresh tokens** guardados apenas como SHA-256, com rotação a cada uso e revogação em logout.
- **Credenciais de plataforma** exclusivamente via variáveis de ambiente; sem segredo configurado, o webhook é rejeitado em produção (em dev aceita com aviso, para facilitar testes).
- **Direito ao esquecimento (art. 18):** `POST /api/leads/:id/anonymize` (admin) remove nome/telefone/e-mail do lead, apaga o conteúdo das mensagens recebidas e os payloads brutos de webhook associados — preservando métricas (status, tempos, contagens) para relatórios.
- **Autorização por papel:** atendente enxerga/edita apenas tickets próprios ou livres (pode assumir); admin vê tudo e reatribui. Regras aplicadas no serviço (não só na UI).

## API (resumo)

| Método/Rota | Descrição | Acesso |
| --- | --- | --- |
| `POST /api/auth/login` · `/refresh` · `/logout` | Sessão JWT + refresh com rotação | público |
| `GET /api/auth/me` | Usuário atual | autenticado |
| `GET/POST /api/users` · `PATCH /api/users/:id` | Gestão de usuários | GET: todos · resto: admin |
| `GET /api/tickets` | Lista com filtros (`status`, `platform`, `assignedTo=me\|unassigned\|id`, `search`, `dateFrom/To`, paginação) | escopo por papel |
| `GET /api/tickets/stats` | Contadores por status | escopo por papel |
| `POST /api/tickets` | Ticket manual (lead balcão/telefone) | autenticado |
| `GET/PATCH /api/tickets/:id` | Detalhe · status/prioridade/atribuição (auditados) | escopo por papel |
| `POST /api/tickets/:id/interactions` | Resposta ao cliente (marca 1ª resposta/SLA) ou nota interna | escopo por papel |
| `POST /api/leads/:id/anonymize` | Anonimização LGPD | admin |
| `GET /api/webhook-events` · `POST /api/webhook-events/:id/retry` | Observabilidade/reprocesso da fila | admin |
| `POST /webhooks/:platform` (porta 3002) | Recepção de leads | autenticação por adapter |

Comportamentos automáticos auditados: responder um ticket livre **atribui ao atendente**; primeira resposta move `NEW → IN_PROGRESS` e grava `firstResponseAt` (SLA); mensagem nova do cliente move `WAITING_CUSTOMER → IN_PROGRESS`; status de fechamento define `closedAt`.

## Módulos futuros (como esta base os recebe)

- **Estoque de veículos:** hoje o ticket guarda `vehicle_ref_external` (JSON com id/título/preço/URL do anúncio). Quando o módulo existir: (1) migration adiciona `vehicleId` FK em `tickets`; (2) backfill casando `vehicle_ref_external.externalId` com as referências externas do veículo; (3) o JSON permanece como registro da origem. Modelos `Vehicle`/`VehiclePhoto`/`SaleRecord` já esboçados como comentários no `schema.prisma`.
- **Relatórios/dashboards:** `audit_logs` registra toda transição (status, atribuição, prioridade) com ator e timestamp — base para funil de conversão, tempo médio por etapa, performance por vendedor e origem por plataforma. `ticket_interactions` dá tempo de resposta; `webhook_events` dá volume por plataforma.
- **Notificações (e-mail/WhatsApp) de SLA:** o SLA já é calculado por ticket (`sla.pending/breached`); um job periódico pode consultar tickets estourados e disparar alertas.

## Verificação

Suíte E2E executada contra os serviços reais (48 asserts, 100% verde): autenticação e rotação de refresh token, escopo por papel (agente × admin), webhooks autenticados das 3 plataformas (token e HMAC), fila → worker → ticket, deduplicação (novo ticket × mensagem anexada), payload inválido → `FAILED` reprocessável, SLA, criação manual, timeline/auditoria, anonimização LGPD e validações de entrada. Builds de produção do backend (`tsc`) e do frontend (`vite build`) passando.
