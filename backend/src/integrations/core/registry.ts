import type { LeadSourceAdapter } from './types';

const adapters = new Map<string, LeadSourceAdapter>();

export function registerAdapter(adapter: LeadSourceAdapter): void {
  if (adapters.has(adapter.platform)) {
    throw new Error(`Adapter duplicado para a plataforma: ${adapter.platform}`);
  }
  adapters.set(adapter.platform, adapter);
}

/** Retorna o adapter ou null (rota de webhook responde 404 para slug desconhecido). */
export function findAdapter(platform: string): LeadSourceAdapter | null {
  return adapters.get(platform.toLowerCase()) ?? null;
}

/** Versão estrita — usada pelo worker, onde plataforma desconhecida é erro de processamento. */
export function getAdapter(platform: string): LeadSourceAdapter {
  const adapter = findAdapter(platform);
  if (!adapter) throw new Error(`Nenhum adapter registrado para a plataforma: ${platform}`);
  return adapter;
}

export function listAdapters(): LeadSourceAdapter[] {
  return [...adapters.values()];
}
