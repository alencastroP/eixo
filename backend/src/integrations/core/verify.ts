import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/** Comparação em tempo constante entre strings de tamanhos possivelmente diferentes. */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function hmacSha256Hex(secret: string, payload: Buffer | string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/** Normaliza telefone para somente dígitos (padrão de armazenamento do CRM). */
export function normalizePhone(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  const digits = String(value).replace(/\D/g, '');
  return digits.length >= 8 ? digits : undefined;
}
