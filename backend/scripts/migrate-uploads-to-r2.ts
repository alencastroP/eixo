/**
 * Migração das imagens enviadas para o Cloudflare R2 (idempotente).
 *
 *   npm run migrate:uploads          # relatório, não escreve nada
 *   npm run migrate:uploads -- --apply
 *
 * Roda uma vez após configurar as credenciais R2_*. Para cada imagem
 * referenciada no banco (logo/hero da vitrine e fotos de veículo):
 *
 *   - já está no bucket          -> não faz nada;
 *   - o arquivo ainda existe     -> envia ao bucket e reescreve a URL;
 *   - o arquivo sumiu (404)      -> limpa a referência.
 *
 * O terceiro caso é o esperado em produção, e não é um defeito deste script: o
 * serviço roda no plano free do Render, que não tem disco persistente, então
 * tudo que foi enviado antes do bucket foi descartado no deploy seguinte. Uma
 * referência apontando para um arquivo inexistente rende imagem quebrada na
 * vitrine; limpá-la faz a loja cair no monograma, que é o estado correto para
 * "sem logo". Os arquivos em si são irrecuperáveis - precisam ser reenviados.
 */
import fs from 'node:fs';
import path from 'node:path';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { prisma } from '../src/lib/prisma';
import { env } from '../src/config/env';
import { UPLOADS_PUBLIC_PREFIX, UPLOADS_ROOT, usingR2 } from '../src/lib/storage';

const APPLY = process.argv.includes('--apply');

const EXT_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
};

let client: S3Client | null = null;
function s3(): S3Client {
  client ??= new S3Client({
    region: 'auto',
    endpoint: env.r2.endpoint,
    credentials: { accessKeyId: env.r2.accessKeyId, secretAccessKey: env.r2.secretAccessKey },
  });
  return client;
}

type Outcome = 'ja-no-bucket' | 'migrada' | 'perdida' | 'ignorada';

const stats: Record<Outcome, number> = { 'ja-no-bucket': 0, migrada: 0, perdida: 0, ignorada: 0 };

/** Conteúdo da imagem, venha do disco local ou da URL antiga. Null = sumiu. */
async function fetchOriginal(url: string): Promise<Buffer | null> {
  const urlPath = url.startsWith('/') ? url : safePathname(url);
  if (urlPath?.startsWith(`${UPLOADS_PUBLIC_PREFIX}/`)) {
    const abs = path.join(UPLOADS_ROOT, urlPath.slice(UPLOADS_PUBLIC_PREFIX.length + 1));
    if (abs.startsWith(UPLOADS_ROOT) && fs.existsSync(abs)) return fs.readFileSync(abs);
  }
  // Não está no disco desta máquina: tenta buscar pela própria URL pública -
  // cobre o caso de rodar o script de fora do servidor que guarda o arquivo.
  if (url.startsWith('http')) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      if (res.ok) return Buffer.from(await res.arrayBuffer());
    } catch {
      /* rede indisponível: trata como perdida */
    }
  }
  return null;
}

function safePathname(url: string): string | null {
  try {
    return new URL(url).pathname;
  } catch {
    return null;
  }
}

/** Migra uma URL. Devolve a nova URL, null se perdida, ou a mesma se já ok. */
async function migrate(url: string | null | undefined, label: string): Promise<string | null | undefined> {
  if (!url) return url;
  if (env.r2.publicUrl && url.startsWith(`${env.r2.publicUrl}/`)) {
    stats['ja-no-bucket']++;
    return url;
  }

  const urlPath = url.startsWith('/') ? url : safePathname(url);
  if (!urlPath?.startsWith(`${UPLOADS_PUBLIC_PREFIX}/`)) {
    stats.ignorada++; // URL externa (ex.: logo hospedado em outro lugar)
    return url;
  }

  const key = urlPath.slice(UPLOADS_PUBLIC_PREFIX.length + 1);
  const buffer = await fetchOriginal(url);

  if (!buffer) {
    stats.perdida++;
    console.log(`  PERDIDA   ${label}: arquivo nao existe mais (${key})`);
    return null;
  }

  if (APPLY) {
    const ext = key.split('.').pop()?.toLowerCase() ?? '';
    await s3().send(
      new PutObjectCommand({
        Bucket: env.r2.bucket,
        Key: key,
        Body: buffer,
        ContentType: EXT_MIME[ext] ?? 'application/octet-stream',
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
  }
  stats.migrada++;
  console.log(`  MIGRADA   ${label}: ${key} (${(buffer.byteLength / 1024).toFixed(0)} KB)`);
  return `${env.r2.publicUrl}/${key}`;
}

async function main() {
  if (!usingR2()) {
    throw new Error('Credenciais R2 ausentes. Defina R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET e R2_ENDPOINT.');
  }
  console.log(APPLY ? 'Modo APLICAR - o banco e o bucket serao alterados.\n' : 'Modo RELATORIO - nada sera alterado. Use --apply para valer.\n');

  // 1) fotos de veículo
  const photos = await prisma.vehiclePhoto.findMany({ select: { id: true, url: true } });
  for (const photo of photos) {
    const next = await migrate(photo.url, `foto ${photo.id}`);
    if (next === photo.url) continue;
    if (!APPLY) continue;
    if (next) await prisma.vehiclePhoto.update({ where: { id: photo.id }, data: { url: next } });
    else await prisma.vehiclePhoto.delete({ where: { id: photo.id } }); // sem arquivo, a linha não tem uso
  }

  // 2) logo e imagem de destaque da vitrine (dentro do JSON de config)
  const storefronts = await prisma.storefront.findMany();
  for (const store of storefronts) {
    const config = store.config as { brand?: { logoUrl?: string | null }; hero?: { imageUrl?: string | null } };
    const logoUrl = await migrate(config.brand?.logoUrl, `vitrine ${store.slug} (logo)`);
    const imageUrl = await migrate(config.hero?.imageUrl, `vitrine ${store.slug} (hero)`);
    if (logoUrl === config.brand?.logoUrl && imageUrl === config.hero?.imageUrl) continue;
    if (!APPLY) continue;

    await prisma.storefront.update({
      where: { id: store.id },
      data: {
        config: {
          ...config,
          brand: { ...config.brand, logoUrl: logoUrl ?? null },
          hero: { ...config.hero, imageUrl: imageUrl ?? null },
        },
      },
    });
  }

  console.log('\n--- resumo ---');
  console.log(`  ja no bucket: ${stats['ja-no-bucket']}`);
  console.log(`  migradas:     ${stats.migrada}`);
  console.log(`  perdidas:     ${stats.perdida}  (arquivo descartado por deploy anterior - precisa reenviar)`);
  console.log(`  ignoradas:    ${stats.ignorada}  (URL externa)`);
  if (!APPLY) console.log('\nNada foi alterado. Rode com --apply para efetivar.');
}

main()
  .catch((err) => {
    console.error('Falha na migracao:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
