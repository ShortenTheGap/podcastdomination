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
  keyValueStore = {
    findUnique: async () => null,
    upsert: async () => null,
    create: async () => null,
    update: async () => null,
  };
}

function createPrismaClient(): any {
  // Check if DATABASE_URL is set
  if (!process.env.DATABASE_URL) {
    console.warn("DATABASE_URL not set - database operations will fail");
  }

  // ALWAYS use mock during build - database is not available during Railway build
  // Railway's internal network (postgres.railway.internal) only works at runtime
  if (process.env.NEXT_PHASE === "phase-production-build") {
    console.log("Build phase detected - using mock Prisma client");
    return new MockPrismaClient();
  }

  // Runtime: use real Prisma client with error handling
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaClient } = require("@prisma/client");
    const client = new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
    });
    return client;
  } catch (e) {
    // If Prisma fails to initialize (e.g., not generated or no database),
    // fall back to mock client so app can still function
    console.warn("Failed to create Prisma client, using mock client:", e instanceof Error ? e.message : e);
    return new MockPrismaClient();
  }
}

const globalForPrisma = globalThis as unknown as {
  prisma: any | undefined;
};

export const db: any = globalForPrisma.prisma ?? createPrismaClient();
export const prisma = db; // Alias for compatibility

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

// Helper to check if Prisma is available (not in build phase)
export function isPrismaAvailable(): boolean {
  return process.env.NEXT_PHASE !== "phase-production-build";
}
