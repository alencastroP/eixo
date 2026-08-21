/**
 * Backfill de URLs de upload (idempotente). Roda uma vez após o deploy do fix
 * que passou a gravar `saveImageDataUrl` com URL ABSOLUTA (`API_PUBLIC_URL` +
 * /uploads/...) em vez de relativa:
 *   npm run backfill:upload-urls
 *
 * Antes do fix, toda imagem enviada (logo/hero da vitrine, fotos de veículo)
 * era salva como "/uploads/...". Essa URL relativa resolve contra o domínio
 * de quem EXIBE a página — em produção o front (Cloudflare Workers) e a API
 * (Render) são domínios diferentes, então a imagem sempre quebrava depois de
 * publicada. Este script reescreve os registros antigos para a URL absoluta,
 * sem tocar nos que já estão corretos.
 */
import { prisma } from '../src/lib/prisma';
import { env } from '../src/config/env';
import { UPLOADS_PUBLIC_PREFIX } from '../src/lib/storage';

function absolutize(url: string | null | undefined): string | null | undefined {
  if (!url || !url.startsWith(`${UPLOADS_PUBLIC_PREFIX}/`)) return url;
  return `${env.apiPublicUrl}${url}`;
}

async function main() {
  // 1) fotos de veículo
  const photos = await prisma.vehiclePhoto.findMany({ where: { url: { startsWith: `${UPLOADS_PUBLIC_PREFIX}/` } } });
  for (const photo of photos) {
    await prisma.vehiclePhoto.update({ where: { id: photo.id }, data: { url: absolutize(photo.url)! } });
  }

  // 2) logo/hero da vitrine (dentro do JSON de config)
  const storefronts = await prisma.storefront.findMany();
  let storefrontsFixed = 0;
  for (const store of storefronts) {
    const config = store.config as { brand?: { logoUrl?: string | null }; hero?: { imageUrl?: string | null } };
    const logoUrl = absolutize(config.brand?.logoUrl);
    const imageUrl = absolutize(config.hero?.imageUrl);
    if (logoUrl === config.brand?.logoUrl && imageUrl === config.hero?.imageUrl) continue;

    await prisma.storefront.update({
      where: { id: store.id },
      data: {
        config: {
          ...config,
          brand: { ...config.brand, logoUrl },
          hero: { ...config.hero, imageUrl },
        },
      },
    });
    storefrontsFixed++;
  }

  // eslint-disable-next-line no-console
  console.log(`Fotos de veículo corrigidas: ${photos.length}. Vitrines corrigidas: ${storefrontsFixed}.`);
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Falha no backfill de URLs de upload:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
