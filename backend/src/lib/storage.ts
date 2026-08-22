import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { env } from '../config/env';
import { badRequest } from './errors';
import { logger } from './logger';

/**
 * Armazenamento de imagens enviadas (logo/hero da vitrine, fotos de veículo).
 *
 * Dois backends atrás da MESMA interface - o resto do código só conhece a URL
 * pública devolvida:
 *
 *   - Cloudflare R2, quando há credenciais (`R2_*`). É o modo de produção.
 *   - Disco local, quando não há. Mantém o desenvolvimento sem exigir que cada
 *     pessoa tenha uma chave de bucket.
 *
 * Por que R2 em produção: o serviço roda no plano free do Render, que NÃO tem
 * disco persistente. Gravar em disco ali funciona até o próximo deploy, quando
 * o container é recriado e todo o /uploads desaparece - foi assim que os logos
 * enviados sumiram silenciosamente. Um bucket sobrevive ao deploy.
 *
 * As imagens chegam como data URL (base64) no corpo JSON - evita adicionar
 * dependência de upload multipart.
 */
export const UPLOADS_ROOT = path.resolve(process.cwd(), 'uploads');
export const UPLOADS_PUBLIC_PREFIX = '/uploads';

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};

/** Extensão -> Content-Type, para o bucket devolver o cabeçalho certo na leitura. */
const EXT_MIME: Record<string, string> = Object.fromEntries(
  Object.entries(MIME_EXT).map(([mime, ext]) => [ext, mime]),
);

const DATA_URL_RE = /^data:(image\/[a-zA-Z+]+);base64,([A-Za-z0-9+/=]+)$/;
const MAX_BYTES = 8 * 1024 * 1024;

/** Vídeos na galeria do veículo (além das fotos) - mesmo transporte (data URL), tipos e limite à parte. */
const VIDEO_MIME_EXT: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};
const MEDIA_MIME_EXT: Record<string, string> = { ...MIME_EXT, ...VIDEO_MIME_EXT };
const MEDIA_DATA_URL_RE = /^data:(image\/[a-zA-Z+]+|video\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/;
const MAX_VIDEO_BYTES = 60 * 1024 * 1024;

/** true = há bucket configurado; false = grava em disco (desenvolvimento). */
export const usingR2 = (): boolean => Boolean(env.r2.accessKeyId && env.r2.secretAccessKey && env.r2.bucket);

let client: S3Client | null = null;

function s3(): S3Client {
  // `region: 'auto'` é obrigatório: sem region o SDK da AWS recusa a chamada
  // antes mesmo de sair da máquina, e o R2 não usa regiões.
  client ??= new S3Client({
    region: 'auto',
    endpoint: env.r2.endpoint,
    credentials: { accessKeyId: env.r2.accessKeyId, secretAccessKey: env.r2.secretAccessKey },
  });
  return client;
}

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * Sanitiza por segmento, preservando o aninhamento (ex.: vehicles/<id>) e
 * impedindo path traversal - segmentos vazios e ".." são descartados.
 */
function safeSubdir(subdir: string): string {
  return subdir
    .split('/')
    .map((seg) => seg.replace(/[^a-zA-Z0-9_-]/g, ''))
    .filter(Boolean)
    .join('/');
}

/** Decodifica e valida a data URL, devolvendo o binário e a extensão. */
function decodeDataUrl(dataUrl: string): { buffer: Buffer; ext: string; mime: string } {
  const match = DATA_URL_RE.exec(dataUrl.trim());
  if (!match) throw badRequest('Formato de imagem inválido (esperado data URL base64)');
  const [, mime, base64] = match;
  const ext = MIME_EXT[mime];
  if (!ext) throw badRequest(`Tipo de imagem não suportado: ${mime}`);

  const buffer = Buffer.from(base64, 'base64');
  if (buffer.byteLength > MAX_BYTES) throw badRequest('Imagem maior que 8MB');
  return { buffer, ext, mime };
}

/**
 * Grava o binário e devolve a URL pública ABSOLUTA.
 *
 * Sempre absoluta, nos dois backends: quem EXIBE o arquivo (o front, em outro
 * domínio) não é quem o guarda, então uma URL relativa resolveria contra o
 * domínio errado e a imagem quebraria - exatamente o defeito corrigido antes
 * de migrar para o bucket.
 */
async function writeMedia(subdir: string, buffer: Buffer, ext: string, mime: string): Promise<string> {
  const safeSub = safeSubdir(subdir);
  const filename = `${randomUUID()}.${ext}`;
  const key = `${safeSub}/${filename}`;

  if (!usingR2()) {
    const dir = path.join(UPLOADS_ROOT, safeSub);
    ensureDir(dir);
    fs.writeFileSync(path.join(dir, filename), buffer);
    return `${env.apiPublicUrl}${UPLOADS_PUBLIC_PREFIX}/${key}`;
  }

  await s3().send(
    new PutObjectCommand({
      Bucket: env.r2.bucket,
      Key: key,
      Body: buffer,
      ContentType: mime,
      // O nome do arquivo é um UUID e o conteúdo nunca muda: pode ser cacheado
      // para sempre. Trocar a imagem gera outra chave, então não há invalidação.
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  );
  return `${env.r2.publicUrl}/${key}`;
}

/** Grava a imagem (logo/hero da vitrine etc.) - só os mimes de `MIME_EXT`. */
export async function saveImageDataUrl(subdir: string, dataUrl: string): Promise<string> {
  const { buffer, ext, mime } = decodeDataUrl(dataUrl);
  return writeMedia(subdir, buffer, ext, mime);
}

/** Decodifica e valida uma foto OU vídeo da galeria do veículo. */
function decodeMediaDataUrl(dataUrl: string): { buffer: Buffer; ext: string; mime: string; kind: 'PHOTO' | 'VIDEO' } {
  const match = MEDIA_DATA_URL_RE.exec(dataUrl.trim());
  if (!match) throw badRequest('Formato inválido (esperado data URL de imagem ou vídeo em base64)');
  const [, mime, base64] = match;
  const ext = MEDIA_MIME_EXT[mime];
  if (!ext) throw badRequest(`Tipo de arquivo não suportado: ${mime}`);

  const kind: 'PHOTO' | 'VIDEO' = mime.startsWith('video/') ? 'VIDEO' : 'PHOTO';
  const buffer = Buffer.from(base64, 'base64');
  const limit = kind === 'VIDEO' ? MAX_VIDEO_BYTES : MAX_BYTES;
  if (buffer.byteLength > limit) {
    throw badRequest(kind === 'VIDEO' ? 'Vídeo maior que 60MB' : 'Imagem maior que 8MB');
  }
  return { buffer, ext, mime, kind };
}

/** Grava uma foto ou vídeo da galeria do veículo; devolve a URL e o tipo detectado pelo mime. */
export async function saveVehicleMedia(
  vehicleId: string,
  dataUrl: string,
): Promise<{ url: string; kind: 'PHOTO' | 'VIDEO' }> {
  const { buffer, ext, mime, kind } = decodeMediaDataUrl(dataUrl);
  const url = await writeMedia(`vehicles/${vehicleId}`, buffer, ext, mime);
  return { url, kind };
}

/**
 * Chave do objeto a partir da URL pública, ou null se a URL não for nossa.
 *
 * Aceita as três formas que já existem em dados gravados: a URL do bucket, a
 * URL absoluta da API (backend em disco) e o caminho relativo antigo.
 */
function keyFromPublicUrl(publicUrl: string): string | null {
  if (env.r2.publicUrl && publicUrl.startsWith(`${env.r2.publicUrl}/`)) {
    return publicUrl.slice(env.r2.publicUrl.length + 1);
  }
  let urlPath: string;
  try {
    urlPath = publicUrl.startsWith('/') ? publicUrl : new URL(publicUrl).pathname;
  } catch {
    return null; // URL malformada gravada por engano: nada a remover
  }
  if (!urlPath.startsWith(`${UPLOADS_PUBLIC_PREFIX}/`)) return null;
  return urlPath.slice(UPLOADS_PUBLIC_PREFIX.length + 1);
}

/**
 * Remove um arquivo a partir da URL pública. Silencioso se já não existir -
 * apagar o que já sumiu não é erro, e o chamador está limpando registro.
 */
export async function deleteByPublicUrl(publicUrl: string): Promise<void> {
  const key = keyFromPublicUrl(publicUrl);
  if (!key) return;

  // Objetos do bucket saem pelo bucket; o resto é resquício de disco local.
  if (usingR2() && env.r2.publicUrl && publicUrl.startsWith(`${env.r2.publicUrl}/`)) {
    try {
      await s3().send(new DeleteObjectCommand({ Bucket: env.r2.bucket, Key: key }));
    } catch (err) {
      logger.warn('storage: falha ao remover objeto do bucket', { err });
    }
    return;
  }

  const abs = path.join(UPLOADS_ROOT, key);
  // proteção contra path traversal: precisa estar dentro de UPLOADS_ROOT
  if (!abs.startsWith(UPLOADS_ROOT)) return;
  try {
    fs.unlinkSync(abs);
  } catch {
    /* já removido */
  }
}

export { EXT_MIME };
