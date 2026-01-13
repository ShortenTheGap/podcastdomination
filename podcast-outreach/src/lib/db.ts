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
  // Check if DATABASE_URL is set
  if (!process.env.DATABASE_URL) {
    console.warn("DATABASE_URL not set - database operations will fail");
  }

  // Check if we're in a build environment without Prisma
  if (process.env.NEXT_PHASE === "phase-production-build") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { PrismaClient } = require("@prisma/client");
      return new PrismaClient({
        log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
      });
    } catch (e) {
      // Return mock during build if Prisma isn't ready
      console.warn("Prisma client not available during build, using mock:", e);
      return new MockPrismaClient();
    }
  }

  // Runtime: use real Prisma client with error handling
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaClient } = require("@prisma/client");
    return new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
    });
  } catch (e) {
    console.error("Failed to create Prisma client at runtime:", e);
    // Throw a more helpful error
    throw new Error(
      `Database initialization failed. Make sure DATABASE_URL is set and prisma generate has been run. Original error: ${e instanceof Error ? e.message : e}`
    );
  }
}

const globalForPrisma = globalThis as unknown as {
  prisma: any | undefined;
};

export const db: any = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
