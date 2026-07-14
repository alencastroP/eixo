/**
 * Validação e formatação de CPF/CNPJ (dígitos verificadores reais, mod 11).
 */

export type DocType = 'CPF' | 'CNPJ';

export const onlyDigits = (value: string): string => value.replace(/\D/g, '');

export function detectDocType(digits: string): DocType | null {
  if (digits.length === 11) return 'CPF';
  if (digits.length === 14) return 'CNPJ';
  return null;
}

export function isValidCpf(input: string): boolean {
  const cpf = onlyDigits(input);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return calc(9) === Number(cpf[9]) && calc(10) === Number(cpf[10]);
}

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

/** Valida e retorna o tipo, ou null se o documento for inválido. */
export function validateDocument(input: string): { docType: DocType; digits: string } | null {
  const digits = onlyDigits(input);
  const type = detectDocType(digits);
  if (type === 'CPF' && isValidCpf(digits)) return { docType: 'CPF', digits };
  if (type === 'CNPJ' && isValidCnpj(digits)) return { docType: 'CNPJ', digits };
  return null;
}

export function formatDocument(digits: string): string {
  const d = onlyDigits(digits);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return d;
}

/** Mascara o documento para logs (LGPD): mantém apenas os últimos dígitos. */
export function maskDocument(digits: string): string {
  const d = onlyDigits(digits);
  return d.length >= 4 ? `***${d.slice(-4)}` : '***';
}
