import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Allow up to 60 seconds

/**
 * Admin endpoint to manually run prisma db push
 * POST /api/admin/db-sync - Run database schema sync
 *
 * This is a temporary debugging endpoint - should be removed or secured in production
 */
export async function POST() {
  try {
    console.log("Starting prisma db push...");

    const { stdout, stderr } = await execAsync(
      "npx prisma db push --accept-data-loss",
      {
        timeout: 55000, // 55 second timeout
        env: { ...process.env }
      }
    );

    console.log("prisma db push stdout:", stdout);
    if (stderr) console.log("prisma db push stderr:", stderr);

    return NextResponse.json({
      success: true,
      message: "Database sync completed",
      stdout: stdout,
      stderr: stderr || null
    });
  } catch (error) {
    console.error("prisma db push failed:", error);

    const errorDetails = error instanceof Error ? {
      message: error.message,
      name: error.name,
      // @ts-expect-error - exec error has stdout/stderr
      stdout: error.stdout,
      // @ts-expect-error - exec error has stdout/stderr
      stderr: error.stderr,
    } : String(error);

    return NextResponse.json({
      success: false,
      error: "Database sync failed",
      details: errorDetails
    }, { status: 500 });
  }
}

/**
 * GET endpoint to check current status
 */
export async function GET() {
  return NextResponse.json({
    endpoint: "/api/admin/db-sync",
    method: "POST to run prisma db push",
    warning: "This is a temporary debugging endpoint"
  });
}
