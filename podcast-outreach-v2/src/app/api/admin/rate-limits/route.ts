/**
 * API Route for Rate Limit Administration
 * 
 * GET /api/admin/rate-limits - Get rate limit statistics
 * POST /api/admin/rate-limits/cleanup - Clean up old entries
 */

import { NextRequest, NextResponse } from "next/server";
import { getRateLimitStats, cleanupRateLimits, withRateLimit } from "@/lib/rate-limiter";

// GET /api/admin/rate-limits - Get rate limit statistics
export async function GET(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const stats = await getRateLimitStats();
    
    return NextResponse.json({
      ...stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching rate limit stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch rate limit stats" },
      { status: 500 }
    );
  }
}

// POST /api/admin/rate-limits/cleanup - Clean up old entries
export async function POST(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const deletedCount = await cleanupRateLimits();
    
    return NextResponse.json({
      success: true,
      deletedCount,
      message: `Cleaned up ${deletedCount} old rate limit entries`,
    });
  } catch (error) {
    console.error("Error cleaning up rate limits:", error);
    return NextResponse.json(
      { error: "Failed to clean up rate limits" },
      { status: 500 }
    );
  }
}

