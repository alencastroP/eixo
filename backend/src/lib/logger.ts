/**
 * Logger estruturado com redação de PII (LGPD).
 *
 * Regra do projeto: telefone, e-mail e documentos de leads NUNCA aparecem em
 * texto claro nos logs de aplicação. Todo metadado passa por redact() antes de
 * ser serializado. Os dados íntegros continuam no banco — a restrição é de log.
 */

type Level = 'debug' | 'info' | 'warn' | 'error';

const EMAIL_RE = /([A-Za-z0-9._%+-]{1,64})@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
// Sequências de 8+ dígitos (com separadores comuns) — cobre telefones BR com/sem DDI.
const PHONE_RE = /(?:\+?\d[\s().-]?){8,15}\d/g;

const SECRET_KEY_RE = /(pass(word)?|senha|secret|token|authorization|api[-_]?key|credential)/i;
const PII_KEY_RE = /^(phone|telefone|celular|whatsapp|email|e[-_]?mail|cpf|cnpj|rg|document)/i;

function maskEmail(value: string): string {
  return value.replace(EMAIL_RE, (_m, local: string, domain: string) => `${local[0]}***@${domain}`);
}

function maskPhoneDigits(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 4 ? `***${digits.slice(-4)}` : '***';
}

/** Mascara padrões de e-mail e telefone dentro de uma string livre. */
export function maskString(value: string): string {
  return maskEmail(value).replace(PHONE_RE, (m) => maskPhoneDigits(m));
}

/** Redação recursiva de objetos para logging seguro. */
export function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (depth > 6) return '[depth]';
  if (typeof value === 'string') return maskString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) return { name: value.name, message: maskString(value.message) };
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY_RE.test(key)) {
        out[key] = '[REDACTED]';
      } else if (PII_KEY_RE.test(key)) {
        if (v === null || v === undefined) out[key] = v;
        else if (typeof v === 'string' && v.includes('@')) out[key] = maskEmail(v);
        else if (typeof v === 'string' || typeof v === 'number') out[key] = maskPhoneDigits(String(v));
        else out[key] = '[PII]';
      } else {
        out[key] = redact(v, depth + 1);
      }
    }
    return out;
  }
  return String(value);
}

function write(level: Level, msg: string, meta?: Record<string, unknown>) {
  const line = {
    time: new Date().toISOString(),
    level,
    msg,
    ...(meta ? (redact(meta) as Record<string, unknown>) : {}),
  };
  const serialized = JSON.stringify(line);
  if (level === 'error') console.error(serialized);
  else if (level === 'warn') console.warn(serialized);
  else console.log(serialized);
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => write('debug', msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => write('info', msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => write('warn', msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => write('error', msg, meta),
};
