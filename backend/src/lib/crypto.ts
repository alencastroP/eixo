import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { env } from '../config/env';

/**
 * Criptografia simétrica das credenciais de integração em repouso (AES-256-GCM).
 *
 * A chave deriva de CREDENTIALS_SECRET via scrypt. O objetivo é que um dump do
 * banco não exponha as chaves de API das plataformas em texto claro. Em produção,
 * CREDENTIALS_SECRET deve vir de um cofre (KMS/Secrets Manager), nunca do código.
 */
const KEY = scryptSync(env.security.credentialsSecret, 'crm-integration-creds', 32);

export interface SealedSecret {
  iv: string;
  tag: string;
  data: string;
}

export function encryptJson(value: unknown): SealedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', KEY, iv);
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
  const data = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { iv: iv.toString('base64'), tag: tag.toString('base64'), data: data.toString('base64') };
}

export function decryptJson<T = Record<string, string>>(sealed: SealedSecret): T {
  const decipher = createDecipheriv('aes-256-gcm', KEY, Buffer.from(sealed.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(sealed.data, 'base64')), decipher.final()]);
  return JSON.parse(plaintext.toString('utf8')) as T;
}

export function isSealedSecret(value: unknown): value is SealedSecret {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as SealedSecret).iv === 'string' &&
    typeof (value as SealedSecret).tag === 'string' &&
    typeof (value as SealedSecret).data === 'string'
  );
}

/** Máscara para exibição: mantém os últimos 4 caracteres. */
export function maskSecret(value: string): string {
  if (value.length <= 4) return '••••';
  return `••••••${value.slice(-4)}`;
}
