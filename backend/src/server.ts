import { createApiApp } from './app';
import { env } from './config/env';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';

const server = createApiApp().listen(env.apiPort, () => {
  logger.info('API do CRM no ar', { port: env.apiPort, env: env.nodeEnv });
});

const shutdown = () => {
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
