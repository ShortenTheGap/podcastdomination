// Prisma client - generated after `prisma generate`
// This module handles both initialized and uninitialized Prisma states

/* eslint-disable @typescript-eslint/no-explicit-any */

// Mock client for when Prisma isn't generated
class MockPrismaClient {
  podcast = {
    findMany: async () => [],
    findUnique: async () => null,
    update: async () => null,
    create: async () => null,
    count: async () => 0,
  };
  touch = {
    findMany: async () => [],
    findFirst: async () => null,
    update: async () => null,
    create: async () => null,
  };
  note = {
    findMany: async () => [],
    create: async () => null,
  };
  seedGuest = { findMany: async () => [] };
  leadMagnet = { findMany: async () => [] };
  joeyProfile = { findFirst: async () => null };
  systemConfig = { findFirst: async () => null };
}

function createPrismaClient(): any {
  // Check if we're in a build environment without Prisma
  if (process.env.NEXT_PHASE === "phase-production-build") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { PrismaClient } = require("@prisma/client");
      return new PrismaClient({
        log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
      });
    } catch {
      // Return mock during build if Prisma isn't ready
      console.warn("Prisma client not available during build, using mock");
      return new MockPrismaClient();
    }
  }

  // Runtime: use real Prisma client
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PrismaClient } = require("@prisma/client");
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });
}

const globalForPrisma = globalThis as unknown as {
  prisma: any | undefined;
};

export const db: any = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
