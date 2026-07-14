/**
 * Validação e máscara de CPF no cliente — feedback rápido ao usuário.
 * A validação AUTORITATIVA é sempre a do back-end (nunca confiar só no client).
 * Algoritmo idêntico ao do backend (lib/document.ts, mod 11).
 */
export const onlyDigits = (v: string) => v.replace(/\D/g, '');

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

/** Aplica a máscara 000.000.000-00 progressivamente enquanto o usuário digita. */
export function maskCpf(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}
