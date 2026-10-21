import { createApp } from './app';
import { env } from './config/env';
import { prisma } from './lib/prisma';
import { logger } from './middleware/logging';

const server = createApp().listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'API listening');
});

function shutdown(signal: string): void {
  logger.info({ signal }, 'shutting down');
  server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => {
  shutdown('SIGTERM');
});
process.on('SIGINT', () => {
  shutdown('SIGINT');
});
