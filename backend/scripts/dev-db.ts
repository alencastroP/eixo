/**
 * PostgreSQL embutido para desenvolvimento — alternativa quando não há Docker
 * nem Postgres instalado. Baixa/usa binários reais do Postgres (pacote
 * embedded-postgres) com dados persistidos em backend/.pgdata.
 *
 * Uso: npm run db:dev   (deixe rodando; Ctrl+C para parar)
 * Produção/preferência: use o docker-compose.yml da raiz e ajuste DATABASE_URL.
 */
import EmbeddedPostgres from 'embedded-postgres';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve(__dirname, '..', '.pgdata');
const PORT = Number(process.env.DEV_DB_PORT ?? 5433);
const DB_NAME = 'crm';

async function main() {
  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: 'postgres',
    password: 'postgres',
    port: PORT,
    persistent: true,
    // No Windows o initdb usaria WIN1252 por padrão — forçamos UTF-8 (emoji etc.)
    initdbFlags: ['--encoding=UTF8'],
  });

  if (!fs.existsSync(path.join(DATA_DIR, 'PG_VERSION'))) {
    console.log('[dev-db] inicializando cluster PostgreSQL em', DATA_DIR);
    await pg.initialise();
  }

  await pg.start();
  try {
    await pg.createDatabase(DB_NAME);
    console.log(`[dev-db] banco "${DB_NAME}" criado`);
  } catch {
    // banco já existe — ok
  }

  console.log(`[dev-db] PostgreSQL pronto em postgresql://postgres:postgres@localhost:${PORT}/${DB_NAME}`);
  console.log('[dev-db] Ctrl+C para parar.');

  const stop = async () => {
    console.log('\n[dev-db] parando PostgreSQL...');
    await pg.stop();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((err) => {
  console.error('[dev-db] falha ao iniciar PostgreSQL embutido:', err);
  process.exit(1);
});
