import { PrismaClient } from '@prisma/client';
import { config } from '../config/env';

const globalForPrisma = global as unknown as { prisma: PrismaClient | undefined };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    datasources: config.databaseUrl
      ? {
          db: {
            url: config.databaseUrl,
          },
        }
      : undefined,
    log: config.nodeEnv === 'development' ? ['warn', 'error'] : ['error'],
  });

if (config.nodeEnv !== 'production') {
  globalForPrisma.prisma = prisma;
}

/**
 * Explicitly connects to PostgreSQL and verifies connectivity.
 * Fails fast if connection cannot be established.
 */
export async function connectPrisma(): Promise<void> {
  await prisma.$connect();
  // Lightweight health ping query to verify database is answering queries
  await prisma.$queryRaw`SELECT 1`;

  // Ensure partial unique index exists for settled payments
  await ensureSettledPaymentPartialIndex();
}

/**
 * Ensures the partial unique index for settled payments per decision exists.
 * This guarantees at most one settled record ('COMPLETED' | 'RECONCILIATION_REQUIRED')
 * can ever exist for any single authorization decision.
 */
export async function ensureSettledPaymentPartialIndex(): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "payment_records_decision_settled_idx"
      ON "payment_records"("decisionId")
      WHERE "status" IN ('COMPLETED', 'RECONCILIATION_REQUIRED');
    `);
  } catch (err) {
    // If table doesn't exist yet or permission error, log warning without crashing
    console.warn('Note: Could not ensure partial unique index on payment_records:', err);
  }
}

/**
 * Disconnects Prisma client cleanly.
 */
export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}

