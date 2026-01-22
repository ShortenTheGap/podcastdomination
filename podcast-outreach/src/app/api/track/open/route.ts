/**
 * Email Open Tracking Endpoint
 *
 * This endpoint serves a 1x1 transparent GIF pixel that is embedded in emails.
 * When the email is opened and the pixel is loaded, we record the open event.
 *
 * Query parameters:
 * - t: touchId - The ID of the Touch record
 * - p: podcastId - The ID of the Podcast
 * - k: token - A unique tracking token (for deduplication)
 */

import { NextRequest, NextResponse } from "next/server";
import { recordEmailOpen, TRACKING_PIXEL_GIF } from "@/lib/email-tracking";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const touchId = searchParams.get("t");
  const podcastId = searchParams.get("p");

  // Extract metadata for analytics
  const userAgent = request.headers.get("user-agent") || undefined;
  const forwardedFor = request.headers.get("x-forwarded-for");
  const ipAddress = forwardedFor?.split(",")[0].trim() || undefined;

  // Record the open event (don't await to respond quickly)
  if (touchId && podcastId) {
    // Fire and forget - we don't want to delay the pixel response
    recordEmailOpen(touchId, podcastId, { userAgent, ipAddress }).catch((err) => {
      console.error("[Track/Open] Failed to record:", err);
    });
  }

  // Return the tracking pixel
  return new NextResponse(TRACKING_PIXEL_GIF, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": TRACKING_PIXEL_GIF.length.toString(),
      // Prevent caching so the pixel loads each time
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
      // Allow cross-origin requests (email clients)
      "Access-Control-Allow-Origin": "*",
    },
  });
}

// Also handle HEAD requests (some email clients use these)
export async function HEAD(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": TRACKING_PIXEL_GIF.length.toString(),
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    },
  });
}
