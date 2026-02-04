/**
 * Link Click Tracking Endpoint
 *
 * This endpoint handles tracked links in emails. When a link is clicked,
 * we record the click event and redirect to the original URL.
 *
 * Query parameters:
 * - t: touchId - The ID of the Touch record
 * - p: podcastId - The ID of the Podcast
 * - k: token - A unique tracking token
 * - url: The original URL to redirect to
 */

import { NextRequest, NextResponse } from "next/server";
import { recordLinkClick } from "@/lib/email-tracking";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const touchId = searchParams.get("t");
  const podcastId = searchParams.get("p");
  const originalUrl = searchParams.get("url");

  // Extract metadata for analytics
  const userAgent = request.headers.get("user-agent") || undefined;
  const forwardedFor = request.headers.get("x-forwarded-for");
  const ipAddress = forwardedFor?.split(",")[0].trim() || undefined;

  // Validate URL parameter
  if (!originalUrl) {
    return new NextResponse("Missing URL parameter", { status: 400 });
  }

  // Validate the URL is safe to redirect to
  let validatedUrl: URL;
  try {
    validatedUrl = new URL(originalUrl);
    // Only allow http and https protocols
    if (!["http:", "https:"].includes(validatedUrl.protocol)) {
      throw new Error("Invalid protocol");
    }
  } catch {
    return new NextResponse("Invalid URL", { status: 400 });
  }

  // Record the click event (don't await to respond quickly)
  if (touchId && podcastId) {
    recordLinkClick(touchId, podcastId, originalUrl, { userAgent, ipAddress }).catch(
      (err) => {
        console.error("[Track/Click] Failed to record:", err);
      }
    );
  }

  // Redirect to the original URL
  return NextResponse.redirect(validatedUrl.toString(), {
    status: 302, // Temporary redirect
    headers: {
      // Prevent caching of the redirect
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
