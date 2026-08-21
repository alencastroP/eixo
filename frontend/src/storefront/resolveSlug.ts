/**
 * Descobre qual vitrine a URL atual representa.
 *
 * Em produção cada loja mora no próprio subdomínio
 * (`washington-veiculos.eixo.com.br`), então o slug vem do hostname. Em
 * desenvolvimento e nas pré-visualizações não há DNS curinga, e o caminho
 * `/loja/:slug` cumpre o mesmo papel - por isso as duas formas convivem.
 */

/** Rótulos que pertencem à plataforma, não a uma loja. */
const PLATFORM_HOSTS = new Set(['www', 'app', 'api', 'admin', 'eixo', 'crm', 'painel', 'localhost']);

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/** Slug da loja embutido no hostname, ou null se o host for da plataforma. */
export function slugFromHostname(hostname = window.location.hostname): string | null {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || IPV4.test(host) || host.includes(':')) return null;

  const labels = host.split('.');
  // precisa sobrar algo além do domínio + TLD (loja.eixo.com.br → 4 rótulos)
  if (labels.length < 3) return null;

  const [first] = labels;
  if (!first || PLATFORM_HOSTS.has(first)) return null;
  // *.pages.dev / *.workers.dev são hosts da plataforma, não de lojas
  if (labels.slice(1).join('.').match(/^(pages|workers)\.dev$/)) return null;
  return first;
}

/** true quando o host atual é o de uma loja - a raiz "/" deve abrir a vitrine. */
export const isStorefrontHost = () => slugFromHostname() !== null;

/**
 * Endereço público da vitrine, para exibir/copiar na tela de configuração.
 * No host da plataforma (ou em dev) o caminho `/loja/:slug` é o endereço válido.
 */
export function storefrontUrl(slug: string): string {
  const { protocol, host, hostname, port } = window.location;
  const labels = hostname.split('.');
  const isPlatformDomain = labels.length >= 3 && !IPV4.test(hostname);
  if (isPlatformDomain && !/(pages|workers)\.dev$/.test(labels.slice(-2).join('.'))) {
    const root = labels.slice(slugFromHostname() ? 1 : 0).join('.');
    return `${protocol}//${slug}.${root}${port ? `:${port}` : ''}`;
  }
  return `${protocol}//${host}/loja/${slug}`;
}
