import { createApp } from './app';
import { config } from './config/env';
import { connectPrisma, disconnectPrisma } from './db/prisma';

async function bootstrap() {
  // If PostgreSQL storage is configured, strictly verify database connection before starting HTTP server.
  // Connection failures MUST fail startup; never silently fall back to memory.
  if (config.storageDriver === 'postgres') {
    try {
      console.log('🔄 Connecting to PostgreSQL database via Prisma...');
      await connectPrisma();
      console.log('✅ PostgreSQL connection established and verified.');
    } catch (error) {
      console.error('❌ FATAL: Could not connect to PostgreSQL database on startup:');
      console.error(error);
      process.exit(1);
    }
  }

  const app = createApp();

  const server = app.listen(config.port, () => {
    console.log('----------------------------------------------------');
    console.log(`🛡️  PayGuard AI Backend Service running`);
    console.log(`🌐 Environment : ${config.nodeEnv}`);
    console.log(`🚀 Port        : ${config.port}`);
    console.log(`💾 Storage     : ${config.storageDriver.toUpperCase()}`);
    console.log(`💓 Health URL  : http://localhost:${config.port}/api/health`);
    console.log('----------------------------------------------------');
  });

  // Graceful shutdown handling
  const shutdown = (signal: string) => {
    console.log(`\nReceived ${signal}. Shutting down gracefully...`);
    server.close(async () => {
      console.log('HTTP server closed.');
      if (config.storageDriver === 'postgres') {
        try {
          await disconnectPrisma();
          console.log('Prisma disconnected successfully.');
        } catch (err) {
          console.error('Error disconnecting Prisma during shutdown:', err);
        }
      }
      process.exit(0);
    });

    setTimeout(() => {
      console.error('Forced shutdown after timeout.');
      process.exit(1);
    }, 5000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  console.error('Fatal bootstrapping error:', err);
  process.exit(1);
});
