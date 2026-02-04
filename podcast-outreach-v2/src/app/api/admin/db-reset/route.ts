import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Reset database schema completely
 * POST /api/admin/db-reset - Drop all tables and recreate schema
 *
 * WARNING: This will delete ALL data!
 */
export async function POST(request: Request) {
  // Safety check - require confirmation
  const body = await request.json().catch(() => ({}));

  if (body.confirm !== "DELETE_ALL_DATA") {
    return NextResponse.json({
      error: "Safety check failed",
      message: "To reset the database, send: {\"confirm\": \"DELETE_ALL_DATA\"}",
      warning: "This will DELETE ALL DATA in the database!"
    }, { status: 400 });
  }

  try {
    console.log("Resetting database schema...");

    // Use prisma migrate reset with --force to skip confirmation
    // This drops all tables and re-applies the schema
    const { stdout, stderr } = await execAsync(
      "npx prisma db push --force-reset --accept-data-loss",
      {
        timeout: 55000,
        env: { ...process.env }
      }
    );

    console.log("Database reset stdout:", stdout);
    if (stderr) console.log("Database reset stderr:", stderr);

    return NextResponse.json({
      success: true,
      message: "Database schema reset completed",
      stdout: stdout,
      stderr: stderr || null
    });
  } catch (error) {
    console.error("Database reset failed:", error);

    const errorDetails = error instanceof Error ? {
      message: error.message,
      // @ts-expect-error - exec error has stdout/stderr
      stdout: error.stdout,
      // @ts-expect-error - exec error has stdout/stderr
      stderr: error.stderr,
    } : String(error);

    return NextResponse.json({
      success: false,
      error: "Database reset failed",
      details: errorDetails
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: "/api/admin/db-reset",
    method: "POST with body: {\"confirm\": \"DELETE_ALL_DATA\"}",
    warning: "This will DELETE ALL DATA and recreate the schema from scratch"
  });
}
