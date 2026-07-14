/**
 * Ponto único de registro dos adapters de plataforma.
 *
 * Para adicionar uma nova plataforma (ex.: Facebook Marketplace):
 *   1. criar src/integrations/<slug>/<slug>.adapter.ts implementando LeadSourceAdapter;
 *   2. importar e registrar aqui;
 *   3. definir a credencial do webhook em .env.
 * Nada mais muda — rota de webhook, worker e tickets já funcionam com o novo slug.
 */
import { registerAdapter } from './core/registry';
import { olxAdapter } from './olx/olx.adapter';
import { mercadoLivreAdapter } from './mercadolivre/mercadolivre.adapter';
import { webmotorsAdapter } from './webmotors/webmotors.adapter';

registerAdapter(olxAdapter);
registerAdapter(mercadoLivreAdapter);
registerAdapter(webmotorsAdapter);

export { findAdapter, getAdapter, listAdapters } from './core/registry';
export * from './core/types';
