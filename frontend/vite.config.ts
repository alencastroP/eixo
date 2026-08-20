import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type ProxyOptions } from 'vite';

const LOCAL_API = 'http://localhost:3001';

/**
 * Em dev o front sempre chama caminhos relativos (`/api`, `/uploads`) e quem
 * decide para onde eles vão é este proxy. Isso mantém o navegador falando com
 * localhost:5173, então não há CORS no meio — o que importa porque a API do
 * Render só libera a origem do painel publicado, não a da máquina de quem
 * desenvolve.
 *
 * O destino vem de DEV_API_TARGET (ver .env.development). Sem o prefixo VITE_
 * de propósito: é uma configuração do servidor de dev e não deve vazar para o
 * bundle, ao contrário de VITE_API_URL, que é lida pelo cliente no build.
 */
function apiProxy(target: string): ProxyOptions {
  return {
    target,
    changeOrigin: true,
    // No plano free o serviço do Render hiberna: a primeira chamada depois de
    // um tempo parado leva perto de um minuto para responder.
    timeout: 120_000,
    proxyTimeout: 120_000,
    configure(proxy) {
      // Deste ponto em diante é uma chamada servidor-a-servidor. Repassar
      // "Origin: http://localhost:5173" faria o CORS da API tratar como
      // navegador de origem não autorizada; sem o cabeçalho ela libera, que é
      // o mesmo caminho do health check do próprio Render.
      proxy.on('proxyReq', (proxyReq) => proxyReq.removeHeader('origin'));
    },
  };
}

export default defineConfig(({ mode }) => {
  // prefixo vazio: carrega também as variáveis sem VITE_
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.DEV_API_TARGET?.trim() || LOCAL_API;
  const isRemote = !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(target);

  return {
    plugins: [
      react(),
      {
        name: 'eixo:dev-api-banner',
        configureServer(server) {
          // Bater na API do Render é mexer em dados reais — o aviso precisa
          // estar à vista toda vez que o servidor sobe.
          server.httpServer?.once('listening', () => {
            server.config.logger.info(
              isRemote
                ? `\n  [33m⚠  API REMOTA[0m  ${target}  [2m(dados reais)[0m\n`
                : `\n  [32mAPI local[0m  ${target}\n`,
            );
          });
        },
      },
    ],
    server: {
      port: 5173,
      proxy: {
        '/api': apiProxy(target),
        '/uploads': apiProxy(target),
      },
    },
  };
});
