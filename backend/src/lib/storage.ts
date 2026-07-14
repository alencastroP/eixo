import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { badRequest } from './errors';

/**
 * Armazenamento de imagens em disco (dev). Em produção, trocar por um bucket
 * (S3/GCS) mantendo a mesma interface: o resto do código só conhece a URL pública.
 *
 * As fotos chegam como data URL (base64) no corpo JSON — evita adicionar
 * dependência de upload multipart. São decodificadas e gravadas em /uploads.
 */
export const UPLOADS_ROOT = path.resolve(process.cwd(), 'uploads');
export const UPLOADS_PUBLIC_PREFIX = '/uploads';

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const DATA_URL_RE = /^data:(image\/[a-zA-Z+]+);base64,([A-Za-z0-9+/=]+)$/;

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

/** Grava uma data URL de imagem e devolve a URL pública (/uploads/...). */
export function saveImageDataUrl(subdir: string, dataUrl: string): string {
  const match = DATA_URL_RE.exec(dataUrl.trim());
  if (!match) throw badRequest('Formato de imagem inválido (esperado data URL base64)');
  const [, mime, base64] = match;
  const ext = MIME_EXT[mime];
  if (!ext) throw badRequest(`Tipo de imagem não suportado: ${mime}`);

  const buffer = Buffer.from(base64, 'base64');
  if (buffer.byteLength > 8 * 1024 * 1024) throw badRequest('Imagem maior que 8MB');

  // sanitiza por segmento, preservando o aninhamento (ex.: vehicles/<id>)
  // e impedindo path traversal (segmentos vazios/".." são descartados)
  const safeSub = subdir
    .split('/')
    .map((seg) => seg.replace(/[^a-zA-Z0-9_-]/g, ''))
    .filter(Boolean)
    .join('/');
  const dir = path.join(UPLOADS_ROOT, safeSub);
  ensureDir(dir);
  const filename = `${randomUUID()}.${ext}`;
  fs.writeFileSync(path.join(dir, filename), buffer);
  return `${UPLOADS_PUBLIC_PREFIX}/${safeSub}/${filename}`;
}

/** Remove um arquivo a partir da URL pública. Silencioso se já não existir. */
export function deleteByPublicUrl(publicUrl: string): void {
  if (!publicUrl.startsWith(`${UPLOADS_PUBLIC_PREFIX}/`)) return;
  const rel = publicUrl.slice(UPLOADS_PUBLIC_PREFIX.length + 1);
  const abs = path.join(UPLOADS_ROOT, rel);
  // proteção contra path traversal: precisa estar dentro de UPLOADS_ROOT
  if (!abs.startsWith(UPLOADS_ROOT)) return;
  try {
    fs.unlinkSync(abs);
  } catch {
    /* já removido */
  }
}
