import { PrismaClient } from '@prisma/client';
import { loadEnv } from './load-env';

loadEnv();

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function db() {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient();
  }
  return globalForPrisma.prisma;
}
