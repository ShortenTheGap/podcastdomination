import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Database health check endpoint
 * GET /api/health/db - Check database connection and table status
 */
export async function GET() {
  const results: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    databaseUrl: process.env.DATABASE_URL ? "SET (hidden)" : "NOT SET",
  };

  // Test 1: Can we connect at all?
  try {
    // Try a raw query to test connection
    await db.$queryRaw`SELECT 1 as test`;
    results.connection = "OK";
  } catch (error) {
    results.connection = "FAILED";
    results.connectionError = error instanceof Error ? error.message : String(error);

    // If we can't connect, return early
    return NextResponse.json(results, { status: 500 });
  }

  // Test 2: Do the tables exist?
  try {
    // Try to count podcasts - this will fail if table doesn't exist
    const count = await db.podcast.count();
    results.podcastTable = "OK";
    results.podcastCount = count;
  } catch (error) {
    results.podcastTable = "MISSING or ERROR";
    results.podcastTableError = error instanceof Error ? error.message : String(error);
  }

  // Test 3: Check other tables
  try {
    await db.touch.count();
    results.touchTable = "OK";
  } catch (error) {
    results.touchTable = "MISSING or ERROR";
  }

  try {
    await db.note.count();
    results.noteTable = "OK";
  } catch (error) {
    results.noteTable = "MISSING or ERROR";
  }

  const allTablesOk = results.podcastTable === "OK" &&
                      results.touchTable === "OK" &&
                      results.noteTable === "OK";

  results.status = allTablesOk ? "healthy" : "tables_missing";
  results.hint = allTablesOk
    ? "Database is fully operational"
    : "Tables are missing. You may need to run 'prisma db push' manually or redeploy.";

  return NextResponse.json(results, {
    status: allTablesOk ? 200 : 503
  });
}
