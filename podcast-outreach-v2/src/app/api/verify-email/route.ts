import { NextRequest, NextResponse } from "next/server";
import { verifyEmail, verifyEmailBatch } from "@/lib/email-verifier";
import { db } from "@/lib/db";
import { withRateLimit } from "@/lib/rate-limiter";

/**
 * Email Verification API
 * 
 * POST /api/verify-email - Verify a single email
 * POST /api/verify-email?batch=true - Verify multiple emails
 */

export async function POST(request: NextRequest) {
  // Apply rate limiting
  const rateLimitResponse = await withRateLimit(request);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = await request.json();
    const isBatch = request.nextUrl.searchParams.get("batch") === "true";

    if (isBatch) {
      // Batch verification
      const { emails } = body;
      
      if (!emails || !Array.isArray(emails)) {
        return NextResponse.json(
          { error: "emails array required for batch verification" },
          { status: 400 }
        );
      }

      if (emails.length > 50) {
        return NextResponse.json(
          { error: "Maximum 50 emails per batch" },
          { status: 400 }
        );
      }

      const results = await verifyEmailBatch(emails, 500);
      
      // Convert Map to object for JSON response
      const resultsObject: Record<string, unknown> = {};
      results.forEach((value, key) => {
        resultsObject[key] = value;
      });

      return NextResponse.json({
        success: true,
        count: emails.length,
        results: resultsObject,
      });
    }

    // Single email verification
    const { email, podcastId, updatePodcast } = body;

    if (!email) {
      return NextResponse.json(
        { error: "email required" },
        { status: 400 }
      );
    }

    const result = await verifyEmail(email);

    // Optionally update podcast record with verification result
    if (podcastId && updatePodcast) {
      try {
        const podcast = await db.podcast.findUnique({
          where: { id: podcastId },
          select: { emailFinderResult: true },
        });

        if (podcast) {
          const existingResult = (podcast.emailFinderResult as Record<string, unknown>) || {};
          
          await db.podcast.update({
            where: { id: podcastId },
            data: {
              emailFinderResult: {
                ...existingResult,
                verification: {
                  email: result.email,
                  isValid: result.isValid,
                  isDeliverable: result.isDeliverable,
                  confidence: result.confidence,
                  status: result.status,
                  reason: result.reason,
                  provider: result.provider,
                  verifiedAt: new Date().toISOString(),
                },
              },
            },
          });
        }
      } catch (dbError) {
        console.error("[VerifyEmail] Failed to update podcast:", dbError);
        // Don't fail the whole request if DB update fails
      }
    }

    return NextResponse.json({
      success: true,
      ...result,
    });

  } catch (error) {
    console.error("[VerifyEmail] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Verification failed" },
      { status: 500 }
    );
  }
}

// GET /api/verify-email?email=test@example.com - Quick verification check
export async function GET(request: NextRequest) {
  // Apply rate limiting
  const rateLimitResponse = await withRateLimit(request);
  if (rateLimitResponse) return rateLimitResponse;

  const email = request.nextUrl.searchParams.get("email");

  if (!email) {
    return NextResponse.json(
      { error: "email query parameter required" },
      { status: 400 }
    );
  }

  try {
    const result = await verifyEmail(email);
    
    return NextResponse.json({
      email: result.email,
      isValid: result.isValid,
      confidence: result.confidence,
      status: result.status,
      reason: result.reason,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Verification failed" },
      { status: 500 }
    );
  }
}


