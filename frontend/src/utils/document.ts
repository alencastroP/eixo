/**
 * Validação de CPF/CNPJ no cliente - o operador descobre o erro de digitação
 * antes de gastar uma consulta de bureau (que é tarifada por unidade).
 * A validação AUTORITATIVA continua sendo a do back-end (lib/document.ts):
 * os algoritmos aqui são os mesmos, mod 11.
 */
import { isValidCpf, onlyDigits } from './cpf';

export type DocType = 'CPF' | 'CNPJ';

export { isValidCpf, onlyDigits };

export function isValidCnpj(input: string): boolean {
  const cnpj = onlyDigits(input);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const calc = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cnpj[i]) * weights[i];
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return calc(12) === Number(cnpj[12]) && calc(13) === Number(cnpj[13]);
}

/** CPF em 11 dígitos, CNPJ em 14 - abaixo disso ainda está sendo digitado. */
export function detectDocType(input: string): DocType | null {
  const d = onlyDigits(input);
  if (d.length === 11) return 'CPF';
  if (d.length === 14) return 'CNPJ';
  return null;
}

export type DocState =
  | { status: 'empty' }
  /** Comprimento ainda não fecha CPF nem CNPJ: não é erro, é meio caminho. */
  | { status: 'incomplete'; digits: string }
  | { status: 'invalid'; digits: string; docType: DocType }
  | { status: 'valid'; digits: string; docType: DocType };

/**
 * Estado do campo enquanto se digita. Só acusa erro quando o comprimento já
 * fecha um CPF ou um CNPJ - reclamar de dígito verificador no meio da digitação
 * seria ruído.
 */
export function documentState(input: string): DocState {
  const digits = onlyDigits(input);
  if (!digits) return { status: 'empty' };
  const docType = detectDocType(digits);
  if (!docType) return { status: 'incomplete', digits };
  const ok = docType === 'CPF' ? isValidCpf(digits) : isValidCnpj(digits);
  return { status: ok ? 'valid' : 'invalid', digits, docType };
}
