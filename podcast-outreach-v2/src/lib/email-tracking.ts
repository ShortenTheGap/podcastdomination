/**
 * Email Tracking Service
 *
 * Provides tracking capabilities for email campaigns:
 * - Open tracking via 1x1 pixel images
 * - Click tracking via redirect links
 * - Tracking data storage and retrieval
 *
 * Privacy considerations:
 * - Tracking is used to measure campaign effectiveness
 * - Recipients may block tracking pixels
 * - Use tracking data responsibly
 */

import { prisma } from "./db";
import { randomBytes } from "crypto";

// Base URL for tracking endpoints (set via environment variable or default)
const TRACKING_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

/**
 * Tracking token stored in the database
 */
export interface TrackingToken {
  id: string;
  touchId: string;
  podcastId: string;
  type: "open" | "click";
  linkUrl?: string; // Original URL for click tracking
  createdAt: Date;
  trackedAt?: Date;
  userAgent?: string;
  ipAddress?: string;
}

/**
 * Generate a unique tracking token
 */
export function generateTrackingToken(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Create a tracking pixel URL for email opens
 *
 * The pixel is a 1x1 transparent GIF that, when loaded,
 * records that the email was opened.
 */
export function createTrackingPixelUrl(touchId: string, podcastId: string): string {
  const token = generateTrackingToken();

  // Store the token association (we'll do this when the email is sent)
  // For now, encode the info in the URL
  const params = new URLSearchParams({
    t: touchId,
    p: podcastId,
    k: token,
  });

  return `${TRACKING_BASE_URL}/api/track/open?${params.toString()}`;
}

/**
 * Create an HTML tracking pixel tag to embed in emails
 */
export function createTrackingPixelHtml(touchId: string, podcastId: string): string {
  const pixelUrl = createTrackingPixelUrl(touchId, podcastId);
  return `<img src="${pixelUrl}" width="1" height="1" style="display:none;visibility:hidden;width:1px;height:1px;opacity:0;" alt="" />`;
}

/**
 * Create a tracked link URL for click tracking
 *
 * This wraps the original URL in a tracking redirect
 */
export function createTrackedLinkUrl(
  originalUrl: string,
  touchId: string,
  podcastId: string
): string {
  const token = generateTrackingToken();

  const params = new URLSearchParams({
    t: touchId,
    p: podcastId,
    k: token,
    url: originalUrl,
  });

  return `${TRACKING_BASE_URL}/api/track/click?${params.toString()}`;
}

/**
 * Replace all links in HTML content with tracked versions
 */
export function addLinkTracking(
  htmlContent: string,
  touchId: string,
  podcastId: string
): string {
  // Match href attributes in anchor tags
  const linkRegex = /href=["']([^"']+)["']/gi;

  return htmlContent.replace(linkRegex, (match, url) => {
    // Don't track mailto links, tel links, or anchor links
    if (
      url.startsWith("mailto:") ||
      url.startsWith("tel:") ||
      url.startsWith("#") ||
      url.startsWith("javascript:")
    ) {
      return match;
    }

    // Don't track the tracking pixel URL itself
    if (url.includes("/api/track/")) {
      return match;
    }

    const trackedUrl = createTrackedLinkUrl(url, touchId, podcastId);
    return `href="${trackedUrl}"`;
  });
}

/**
 * Add tracking to an email body
 *
 * - Adds a tracking pixel at the end
 * - Wraps all links with click tracking
 */
export function addEmailTracking(
  emailBody: string,
  touchId: string,
  podcastId: string,
  options: {
    trackOpens?: boolean;
    trackClicks?: boolean;
  } = {}
): string {
  const { trackOpens = true, trackClicks = true } = options;

  let trackedBody = emailBody;

  // Add click tracking to all links
  if (trackClicks) {
    trackedBody = addLinkTracking(trackedBody, touchId, podcastId);
  }

  // Add tracking pixel at the end (before closing body tag if present)
  if (trackOpens) {
    const trackingPixel = createTrackingPixelHtml(touchId, podcastId);

    if (trackedBody.includes("</body>")) {
      trackedBody = trackedBody.replace("</body>", `${trackingPixel}</body>`);
    } else if (trackedBody.includes("</html>")) {
      trackedBody = trackedBody.replace("</html>", `${trackingPixel}</html>`);
    } else {
      // Plain text or partial HTML - add at end
      trackedBody = `${trackedBody}\n${trackingPixel}`;
    }
  }

  return trackedBody;
}

/**
 * Record an email open event
 */
export async function recordEmailOpen(
  touchId: string,
  podcastId: string,
  metadata?: {
    userAgent?: string;
    ipAddress?: string;
  }
): Promise<boolean> {
  try {
    console.log(`[Tracking] Recording email open for touch: ${touchId}`);

    // Update the Touch record
    await prisma.touch.update({
      where: { id: touchId },
      data: {
        opened: true,
        openedAt: new Date(),
      },
    });

    // Also update the podcast status if this is the first open
    const touch = await prisma.touch.findUnique({
      where: { id: touchId },
      include: { podcast: true },
    });

    if (touch?.podcast) {
      console.log(`[Tracking] Email opened for podcast: ${touch.podcast.showName}`);
    }

    return true;
  } catch (error) {
    console.error("[Tracking] Failed to record email open:", error);
    return false;
  }
}

/**
 * Record a link click event
 */
export async function recordLinkClick(
  touchId: string,
  podcastId: string,
  clickedUrl: string,
  metadata?: {
    userAgent?: string;
    ipAddress?: string;
  }
): Promise<boolean> {
  try {
    console.log(`[Tracking] Recording link click for touch: ${touchId}, URL: ${clickedUrl}`);

    // Create a note on the podcast about the click
    await prisma.note.create({
      data: {
        podcastId,
        content: `Link clicked: ${clickedUrl}`,
        author: "system",
      },
    });

    // The email is definitely opened if a link was clicked
    await prisma.touch.update({
      where: { id: touchId },
      data: {
        opened: true,
        openedAt: new Date(),
      },
    });

    return true;
  } catch (error) {
    console.error("[Tracking] Failed to record link click:", error);
    return false;
  }
}

/**
 * Get tracking statistics for a campaign/podcast
 */
export async function getTrackingStats(podcastId: string): Promise<{
  totalSent: number;
  totalOpened: number;
  totalReplied: number;
  openRate: number;
  replyRate: number;
  touches: Array<{
    id: string;
    type: string;
    sentAt: Date;
    opened: boolean;
    openedAt: Date | null;
    replied: boolean;
    repliedAt: Date | null;
    bounced: boolean;
  }>;
}> {
  const touches = await prisma.touch.findMany({
    where: { podcastId },
    orderBy: { sentAt: "desc" },
    select: {
      id: true,
      type: true,
      sentAt: true,
      opened: true,
      openedAt: true,
      replied: true,
      repliedAt: true,
      bounced: true,
    },
  });

  const totalSent = touches.length;
  const totalOpened = touches.filter((t: { opened: boolean }) => t.opened).length;
  const totalReplied = touches.filter((t: { replied: boolean }) => t.replied).length;

  return {
    totalSent,
    totalOpened,
    totalReplied,
    openRate: totalSent > 0 ? (totalOpened / totalSent) * 100 : 0,
    replyRate: totalSent > 0 ? (totalReplied / totalSent) * 100 : 0,
    touches,
  };
}

/**
 * Get aggregate tracking statistics across all campaigns
 */
export async function getAggregateTrackingStats(
  dateRange?: { start: Date; end: Date }
): Promise<{
  totalSent: number;
  totalOpened: number;
  totalReplied: number;
  totalBounced: number;
  openRate: number;
  replyRate: number;
  bounceRate: number;
  byWeek: Array<{
    week: string;
    sent: number;
    opened: number;
    replied: number;
    openRate: number;
    replyRate: number;
  }>;
}> {
  const where = dateRange
    ? {
        sentAt: {
          gte: dateRange.start,
          lte: dateRange.end,
        },
      }
    : {};

  const touches = await prisma.touch.findMany({
    where,
    orderBy: { sentAt: "desc" },
    select: {
      id: true,
      sentAt: true,
      opened: true,
      replied: true,
      bounced: true,
    },
  });

  const totalSent = touches.length;
  const totalOpened = touches.filter((t: { opened: boolean }) => t.opened).length;
  const totalReplied = touches.filter((t: { replied: boolean }) => t.replied).length;
  const totalBounced = touches.filter((t: { bounced: boolean }) => t.bounced).length;

  // Group by week
  const byWeekMap = new Map<
    string,
    { sent: number; opened: number; replied: number }
  >();

  for (const touch of touches) {
    const weekStart = getWeekStart(touch.sentAt);
    const weekKey = weekStart.toISOString().split("T")[0];

    const existing = byWeekMap.get(weekKey) || { sent: 0, opened: 0, replied: 0 };
    existing.sent++;
    if (touch.opened) existing.opened++;
    if (touch.replied) existing.replied++;
    byWeekMap.set(weekKey, existing);
  }

  const byWeek = Array.from(byWeekMap.entries())
    .map(([week, stats]) => ({
      week,
      ...stats,
      openRate: stats.sent > 0 ? (stats.opened / stats.sent) * 100 : 0,
      replyRate: stats.sent > 0 ? (stats.replied / stats.sent) * 100 : 0,
    }))
    .sort((a, b) => a.week.localeCompare(b.week));

  return {
    totalSent,
    totalOpened,
    totalReplied,
    totalBounced,
    openRate: totalSent > 0 ? (totalOpened / totalSent) * 100 : 0,
    replyRate: totalSent > 0 ? (totalReplied / totalSent) * 100 : 0,
    bounceRate: totalSent > 0 ? (totalBounced / totalSent) * 100 : 0,
    byWeek,
  };
}

/**
 * Helper to get the start of the week for a date
 */
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day;
  return new Date(d.setDate(diff));
}

/**
 * 1x1 transparent GIF pixel (base64 encoded)
 */
export const TRACKING_PIXEL_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);
