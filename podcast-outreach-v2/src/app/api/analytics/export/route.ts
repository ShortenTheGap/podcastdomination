import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCampaigns } from "@/lib/campaigns-storage";
import { withRateLimit } from "@/lib/rate-limiter";

/**
 * Analytics Export API
 * 
 * GET /api/analytics/export - Export analytics data as CSV
 * 
 * Query params:
 *   format: "csv" | "json" (default: csv)
 *   type: "full" | "summary" | "touches" | "campaigns" (default: full)
 *   dateFrom: ISO date string (optional)
 *   dateTo: ISO date string (optional)
 */

interface PodcastExportRow {
  id: string;
  showName: string;
  hostName: string | null;
  primaryEmail: string | null;
  tier: string;
  status: string;
  outcome: string;
  discoverySource: string | null;
  sentPrimaryAt: Date | null;
  followUpSentAt: Date | null;
  replyReceivedAt: Date | null;
  replyType: string | null;
  touchCount: number;
  createdAt: Date;
}

interface TouchExportRow {
  id: string;
  podcastId: string;
  showName: string;
  type: string;
  contactUsed: string;
  sentAt: Date;
  opened: boolean;
  openedAt: Date | null;
  replied: boolean;
  repliedAt: Date | null;
  bounced: boolean;
}

interface CampaignExportRow {
  id: string;
  showName: string;
  hostName: string | null;
  primaryEmail: string | null;
  tier: string;
  status: string;
  responseType: string | null;
  emailCount: number;
  lastContactedAt: string | null;
  nextFollowUpAt: string | null;
  createdAt: string;
}

function escapeCSV(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  const str = String(value);
  // Escape quotes and wrap in quotes if contains comma, quote, or newline
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCSV<T extends Record<string, unknown>>(data: T[], headers: (keyof T)[]): string {
  const headerRow = headers.map(h => escapeCSV(String(h))).join(",");
  const dataRows = data.map(row => 
    headers.map(h => escapeCSV(row[h])).join(",")
  );
  return [headerRow, ...dataRows].join("\n");
}

function formatDate(date: Date | null | undefined): string {
  if (!date) return "";
  return new Date(date).toISOString().split("T")[0];
}

export async function GET(request: NextRequest) {
  // Apply rate limiting
  const rateLimitResponse = await withRateLimit(request);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const searchParams = request.nextUrl.searchParams;
    const format = searchParams.get("format") || "csv";
    const type = searchParams.get("type") || "full";
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");

    // Build date filter if provided
    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (dateFrom) {
      dateFilter.gte = new Date(dateFrom);
    }
    if (dateTo) {
      dateFilter.lte = new Date(dateTo);
    }

    let data: unknown;
    let filename: string;
    let csvContent: string;

    switch (type) {
      case "summary": {
        // Summary statistics
        const [
          totalPodcasts,
          totalSent,
          totalReplied,
          totalBooked,
          touchesByType,
          statusBreakdown,
        ] = await Promise.all([
          db.podcast.count(),
          db.podcast.count({ where: { status: { in: ["SENT", "FOLLOW_UP_SENT", "ESCALATED", "REPLIED", "CLOSED"] } } }),
          db.podcast.count({ where: { replyReceivedAt: { not: null } } }),
          db.podcast.count({ where: { outcome: "BOOKED" } }),
          db.touch.groupBy({
            by: ["type"],
            _count: { id: true },
          }),
          db.podcast.groupBy({
            by: ["status"],
            _count: { id: true },
          }),
        ]);

        const summary = {
          generatedAt: new Date().toISOString(),
          totalPodcasts,
          totalEmailsSent: totalSent,
          totalReplies: totalReplied,
          totalBookings: totalBooked,
          replyRate: totalSent > 0 ? ((totalReplied / totalSent) * 100).toFixed(1) + "%" : "0%",
          bookingRate: totalReplied > 0 ? ((totalBooked / totalReplied) * 100).toFixed(1) + "%" : "0%",
          touchesByType: Object.fromEntries(touchesByType.map(t => [t.type, t._count.id])),
          statusBreakdown: Object.fromEntries(statusBreakdown.map(s => [s.status, s._count.id])),
        };

        if (format === "json") {
          return NextResponse.json(summary);
        }

        // Convert to simple CSV for summary
        const summaryRows = [
          { metric: "Total Podcasts", value: totalPodcasts },
          { metric: "Emails Sent", value: totalSent },
          { metric: "Replies Received", value: totalReplied },
          { metric: "Bookings", value: totalBooked },
          { metric: "Reply Rate", value: summary.replyRate },
          { metric: "Booking Rate", value: summary.bookingRate },
        ];

        csvContent = toCSV(summaryRows, ["metric", "value"]);
        filename = `outreach-summary-${formatDate(new Date())}.csv`;
        break;
      }

      case "touches": {
        // All touch/email records
        const touches = await db.touch.findMany({
          where: dateFilter.gte || dateFilter.lte ? { sentAt: dateFilter } : undefined,
          include: {
            podcast: {
              select: { showName: true },
            },
          },
          orderBy: { sentAt: "desc" },
        });

        const touchRows: TouchExportRow[] = touches.map(t => ({
          id: t.id,
          podcastId: t.podcastId,
          showName: t.podcast.showName,
          type: t.type,
          contactUsed: t.contactUsed,
          sentAt: t.sentAt,
          opened: t.opened,
          openedAt: t.openedAt,
          replied: t.replied,
          repliedAt: t.repliedAt,
          bounced: t.bounced,
        }));

        if (format === "json") {
          return NextResponse.json({ touches: touchRows });
        }

        csvContent = toCSV(touchRows.map(t => ({
          ...t,
          sentAt: formatDate(t.sentAt),
          openedAt: formatDate(t.openedAt),
          repliedAt: formatDate(t.repliedAt),
        })), ["id", "podcastId", "showName", "type", "contactUsed", "sentAt", "opened", "openedAt", "replied", "repliedAt", "bounced"]);
        filename = `outreach-touches-${formatDate(new Date())}.csv`;
        break;
      }

      case "campaigns": {
        // Export from campaigns storage (KeyValueStore)
        const campaigns = await getCampaigns();
        
        const campaignRows: CampaignExportRow[] = campaigns.map(c => ({
          id: c.id,
          showName: c.showName,
          hostName: c.hostName,
          primaryEmail: c.primaryEmail,
          tier: c.tier,
          status: c.status,
          responseType: c.responseType,
          emailCount: c.emailSequence?.length || 0,
          lastContactedAt: c.lastContactedAt,
          nextFollowUpAt: c.nextFollowUpAt,
          createdAt: c.createdAt,
        }));

        if (format === "json") {
          return NextResponse.json({ campaigns: campaignRows });
        }

        csvContent = toCSV(campaignRows, ["id", "showName", "hostName", "primaryEmail", "tier", "status", "responseType", "emailCount", "lastContactedAt", "nextFollowUpAt", "createdAt"]);
        filename = `outreach-campaigns-${formatDate(new Date())}.csv`;
        break;
      }

      case "full":
      default: {
        // Full podcast export with touch count
        const podcasts = await db.podcast.findMany({
          where: dateFilter.gte || dateFilter.lte ? { createdAt: dateFilter } : undefined,
          include: {
            _count: {
              select: { touches: true },
            },
          },
          orderBy: { createdAt: "desc" },
        });

        const podcastRows: PodcastExportRow[] = podcasts.map(p => ({
          id: p.id,
          showName: p.showName,
          hostName: p.hostName,
          primaryEmail: p.primaryEmail,
          tier: p.tier,
          status: p.status,
          outcome: p.outcome,
          discoverySource: p.discoverySource,
          sentPrimaryAt: p.sentPrimaryAt,
          followUpSentAt: p.followUpSentAt,
          replyReceivedAt: p.replyReceivedAt,
          replyType: p.replyType,
          touchCount: p._count.touches,
          createdAt: p.createdAt,
        }));

        if (format === "json") {
          return NextResponse.json({ podcasts: podcastRows });
        }

        csvContent = toCSV(podcastRows.map(p => ({
          ...p,
          sentPrimaryAt: formatDate(p.sentPrimaryAt),
          followUpSentAt: formatDate(p.followUpSentAt),
          replyReceivedAt: formatDate(p.replyReceivedAt),
          createdAt: formatDate(p.createdAt),
        })), ["id", "showName", "hostName", "primaryEmail", "tier", "status", "outcome", "discoverySource", "sentPrimaryAt", "followUpSentAt", "replyReceivedAt", "replyType", "touchCount", "createdAt"]);
        filename = `outreach-full-${formatDate(new Date())}.csv`;
        break;
      }
    }

    // Return CSV with proper headers for download
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-cache",
      },
    });

  } catch (error) {
    console.error("[Analytics Export] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Export failed" },
      { status: 500 }
    );
  }
}


