/**
 * Proteção do CPF usado no controle de unicidade do trial (LGPD).
 *
 * - `hashCpf`: SHA-256(pepper + CPF) → identificador irreversível e determinístico,
 *   usado na constraint de unicidade (`trial_cpf_registry.cpfHash`). Não guardamos
 *   o CPF em texto claro para checar "já usou trial".
 * - `sealCpf`: cifra o CPF (AES-256-GCM, reutilizando lib/crypto) para uso
 *   administrativo/antifraude, quando for estritamente necessário exibi-lo.
 *
 * O pepper vive fora do banco (env/cofre): um dump do banco sozinho não permite
 * reverter os hashes por força bruta do espaço de CPFs.
 */
import { createHmac } from 'node:crypto';
import { env } from '../config/env';
import { encryptJson, type SealedSecret } from './crypto';
import { onlyDigits } from './document';

export function hashCpf(cpf: string): string {
  const digits = onlyDigits(cpf);
  return createHmac('sha256', env.security.trialCpfPepper).update(digits).digest('hex');
}

export function sealCpf(cpf: string): SealedSecret {
  return encryptJson(onlyDigits(cpf));
}
