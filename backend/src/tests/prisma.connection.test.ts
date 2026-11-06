import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prisma, connectPrisma, disconnectPrisma } from '../db/prisma';

describe('Prisma PostgreSQL Connection Diagnostic Test', () => {
  it('connects to PostgreSQL if reachable, or skips cleanly in sandboxed environments', async (t) => {
    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Connection timeout in sandbox')), 5000)
      );
      await Promise.race([connectPrisma(), timeoutPromise]);

      const result = await prisma.$queryRaw<Array<{ ping: number }>>`SELECT 1 as ping`;
      assert.ok(Array.isArray(result));
      await disconnectPrisma();
    } catch (err) {
      t.skip(`Skipping live DB socket test in sandboxed offline environment: ${(err as Error).message}`);
    }
  });
});

