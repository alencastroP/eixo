/**
 * Versões vigentes dos documentos jurídicos aceitos pelo usuário. Fonte única
 * para não espalhar strings mágicas entre o cadastro do trial e o módulo de
 * crédito. Ver legal/07-CONTROLE-DE-VERSOES-E-REGISTRO-DE-ACEITE.md.
 *
 * Bump aqui (e apenas aqui) quando uma alteração MATERIAL exigir re-aceite -
 * ver a regra MAJOR/MINOR no documento acima.
 */

/** Bloco único aceito no cadastro: Termos de Uso + DPA + AUP + SLA. */
export const TERMS_DOCUMENT_CODE = 'terms';
export const TERMS_VERSION = '1.0';

/** Termo de Consentimento para Consulta de Crédito (legal/09). */
export const CREDIT_CONSENT_VERSION = '1.0';
