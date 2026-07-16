# Imagem base compartilhada — Debian slim (não alpine) porque o engine do
# Prisma precisa de OpenSSL com glibc; evita o ajuste de binaryTargets do musl.
FROM node:20-slim AS base
RUN apt-get update -y && apt-get install -y --no-install-scripts openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ─── Build: instala todas as deps, gera o Prisma Client e compila TS → dist ──
FROM base AS builder
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run prisma:generate
RUN npm run build

# ─── Runtime: imagem final, só o necessário para rodar ───────────────────────
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json

# server.ts escuta 3001, webhook-server.ts escuta 3002 — o comando real
# (qual dos dois processos sobe) é definido por serviço no render.yaml.
EXPOSE 3001 3002
CMD ["node", "dist/server.js"]
