/**
 * Tracking Analytics API Endpoint
 *
 * Returns detailed tracking statistics from the database including:
 * - Email open/reply/bounce rates
 * - Tracking by week
 * - Email source breakdown
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    // Get date range from query params
    const searchParams = request.nextUrl.searchParams;
    const daysBack = parseInt(searchParams.get("days") || "90", 10);

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    // Get all touches in the date range
    const touches = await prisma.touch.findMany({
      where: {
        sentAt: { gte: startDate },
      },
      select: {
        id: true,
        sentAt: true,
        opened: true,
        openedAt: true,
        replied: true,
        repliedAt: true,
        bounced: true,
        bouncedAt: true,
        type: true,
        podcast: {
          select: {
            id: true,
            showName: true,
            primaryEmailSourceUrl: true,
            outcome: true,
          },
        },
      },
      orderBy: { sentAt: "desc" },
    });

    // Get all podcasts with email source info
    const podcasts = await prisma.podcast.findMany({
      where: {
        primaryEmail: { not: null },
      },
      select: {
        id: true,
        primaryEmail: true,
        primaryEmailSourceUrl: true,
        status: true,
        outcome: true,
        createdAt: true,
      },
    });

    // Calculate aggregate stats
    const totalSent = touches.length;
    const totalOpened = touches.filter((t) => t.opened).length;
    const totalReplied = touches.filter((t) => t.replied).length;
    const totalBounced = touches.filter((t) => t.bounced).length;

    // Calculate rates
    const openRate = totalSent > 0 ? (totalOpened / totalSent) * 100 : 0;
    const replyRate = totalSent > 0 ? (totalReplied / totalSent) * 100 : 0;
    const bounceRate = totalSent > 0 ? (totalBounced / totalSent) * 100 : 0;

    // Group by week
    const byWeek = new Map<string, { sent: number; opened: number; replied: number; bounced: number }>();

    for (const touch of touches) {
      const weekStart = getWeekStart(touch.sentAt);
      const weekKey = weekStart.toISOString().split("T")[0];

      const existing = byWeek.get(weekKey) || { sent: 0, opened: 0, replied: 0, bounced: 0 };
      existing.sent++;
      if (touch.opened) existing.opened++;
      if (touch.replied) existing.replied++;
      if (touch.bounced) existing.bounced++;
      byWeek.set(weekKey, existing);
    }

    const weeklyData = Array.from(byWeek.entries())
      .map(([week, stats]) => ({
        week,
        ...stats,
        openRate: stats.sent > 0 ? Math.round((stats.opened / stats.sent) * 1000) / 10 : 0,
        replyRate: stats.sent > 0 ? Math.round((stats.replied / stats.sent) * 1000) / 10 : 0,
      }))
      .sort((a, b) => a.week.localeCompare(b.week));

    // Analyze email source distribution
    const sourceAnalysis = analyzeEmailSources(podcasts);

    // Recent tracking events (last 10)
    const recentEvents = touches
      .filter((t) => t.opened || t.replied || t.bounced)
      .map((t) => ({
        podcastId: t.podcast?.id,
        podcastName: t.podcast?.showName || "Unknown",
        type: t.replied ? "replied" : t.bounced ? "bounced" : "opened",
        eventAt: t.replied ? t.repliedAt : t.bounced ? t.bouncedAt : t.openedAt,
      }))
      .slice(0, 10);

    return NextResponse.json({
      summary: {
        totalSent,
        totalOpened,
        totalReplied,
        totalBounced,
        openRate: Math.round(openRate * 10) / 10,
        replyRate: Math.round(replyRate * 10) / 10,
        bounceRate: Math.round(bounceRate * 10) / 10,
      },
      weeklyData,
      sourceAnalysis,
      recentEvents,
    });
  } catch (error) {
    console.error("[Analytics/Tracking] Error:", error);
    return NextResponse.json({ error: "Failed to fetch tracking data" }, { status: 500 });
  }
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day;
  return new Date(d.setDate(diff));
}

interface PodcastWithSource {
  id: string;
  primaryEmail: string | null;
  primaryEmailSourceUrl: string | null;
  status: string;
  outcome: string;
  createdAt: Date;
}

function analyzeEmailSources(podcasts: PodcastWithSource[]): {
  bySource: Array<{ source: string; count: number; percentage: number }>;
  totalWithEmail: number;
  totalWithoutEmail: number;
} {
  const sourceMap = new Map<string, number>();
  let totalWithEmail = 0;
  let totalWithoutEmail = 0;

  for (const podcast of podcasts) {
    if (podcast.primaryEmail) {
      totalWithEmail++;

      // Determine source from sourceUrl or pattern
      const source = categorizeEmailSource(podcast.primaryEmailSourceUrl, podcast.primaryEmail);
      sourceMap.set(source, (sourceMap.get(source) || 0) + 1);
    } else {
      totalWithoutEmail++;
    }
  }

  const bySource = Array.from(sourceMap.entries())
    .map(([source, count]) => ({
      source,
      count,
      percentage: totalWithEmail > 0 ? Math.round((count / totalWithEmail) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    bySource,
    totalWithEmail,
    totalWithoutEmail,
  };
}

function categorizeEmailSource(sourceUrl: string | null, email: string): string {
  if (!sourceUrl) {
    // Try to infer from email pattern
    if (email.includes("@gmail.") || email.includes("@yahoo.") || email.includes("@outlook.")) {
      return "Personal Email";
    }
    return "Manual Entry";
  }

  const lowerUrl = sourceUrl.toLowerCase();

  if (lowerUrl.includes("hunter.io")) {
    return "Hunter.io";
  }
  if (lowerUrl.includes("feed") || lowerUrl.includes("rss") || lowerUrl.includes("xml")) {
    return "RSS Feed";
  }
  if (lowerUrl.includes("apple") || lowerUrl.includes("itunes")) {
    return "Apple Podcasts";
  }
  if (lowerUrl.includes("contact") || lowerUrl.includes("about") || lowerUrl.includes("guest")) {
    return "Website Contact Page";
  }

  return "Website Scrape";
}
