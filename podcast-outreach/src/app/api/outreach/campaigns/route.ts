import { NextRequest, NextResponse } from "next/server";
import { prisma, isPrismaAvailable } from "@/lib/db";
import {
  getDemoCampaignsAsync,
  updateDemoCampaignAsync,
  syncDemoCampaigns,
  DemoCampaign,
} from "@/lib/demo-campaigns";

// Re-export for backwards compatibility
export { getDemoCampaignsAsync as getInMemoryCampaigns, updateDemoCampaignAsync as updateInMemoryCampaign };

// Types for outreach campaigns
interface EmailInSequence {
  id: string;
  type: "initial" | "follow_up_1" | "follow_up_2" | "follow_up_3" | "nurture" | "closing";
  subject: string;
  body: string;
  status: "draft" | "scheduled" | "sent" | "opened" | "replied";
  sentAt: string | null;
  scheduledFor: string | null;
  openedAt: string | null;
  repliedAt: string | null;
}

interface OutreachCampaign {
  id: string;
  showName: string;
  hostName: string | null;
  primaryEmail: string | null;
  tier: string;
  status: string;
  responseType: string | null;
  emailSequence: EmailInSequence[];
  lastContactedAt: string | null;
  nextFollowUpAt: string | null;
  createdAt: string;
}

// Map database status to outreach stage
function mapStatusToStage(status: string, replyType: string | null, outcome: string): string {
  if (outcome === "BOOKED") return "booked";
  if (outcome === "DECLINED" || outcome === "OPT_OUT") return "closed";
  if (replyType) return "responded";

  switch (status) {
    case "NOT_CONTACTED":
      return "not_started";
    case "READY":
    case "DRAFTED":
      return "drafting";
    case "QA_APPROVED":
    case "SENT":
      return "ready_to_send";
    case "FOLLOW_UP_DUE":
    case "FOLLOW_UP_SENT":
      return "follow_up_due";
    case "REPLIED":
      return "responded";
    case "CLOSED":
      return "closed";
    default:
      return "not_started";
  }
}

// Map reply type to response type
function mapReplyTypeToResponse(replyType: string | null, outcome: string): string | null {
  if (outcome === "BOOKED") return "booked";
  if (outcome === "OPT_OUT") return "opted_out";
  if (outcome === "DECLINED") return "not_interested";

  if (!replyType) return null;

  switch (replyType) {
    case "POSITIVE":
      return "interested_not_booked";
    case "NEGATIVE":
    case "NOT_NOW":
    case "PAID_ONLY":
      return "not_interested";
    case "NEEDS_TOPICS":
    case "NEEDS_MEDIA_KIT":
    case "NEUTRAL":
      return "interested_not_booked";
    default:
      return null;
  }
}

export async function GET() {
  try {
    if (!isPrismaAvailable()) {
      // Return file-persisted data for demo
      const campaigns = await getDemoCampaignsAsync();
      return NextResponse.json({ campaigns });
    }

    // Fetch from database
    const podcasts = await prisma.podcast.findMany({
      where: {
        status: {
          notIn: ["NOT_CONTACTED", "SKIPPED"],
        },
      },
      include: {
        touches: {
          orderBy: { sentAt: "asc" },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    // Transform to campaign format
    const campaigns: OutreachCampaign[] = (podcasts as Array<{
      id: string;
      showName: string;
      hostName: string | null;
      primaryEmail: string | null;
      tier: string;
      status: string;
      replyType: string | null;
      outcome: string;
      emailDraft: string | null;
      emailSubject: string | null;
      sentPrimaryAt: Date | null;
      nextActionDate: Date | null;
      createdAt: Date;
      touches: Array<{
        id: string;
        type: string;
        emailSubject: string;
        emailBody: string;
        replied: boolean;
        opened: boolean;
        bounced: boolean;
        sentAt: Date | null;
        openedAt: Date | null;
        repliedAt: Date | null;
      }>;
    }>).map((podcast) => {
      // Convert touches to email sequence
      const emailSequence: EmailInSequence[] = podcast.touches.map((touch, index) => ({
        id: touch.id,
        type: touch.type === "PRIMARY"
          ? "initial"
          : touch.type === "FOLLOW_UP"
            ? `follow_up_${index}` as EmailInSequence["type"]
            : "closing",
        subject: touch.emailSubject,
        body: touch.emailBody,
        status: touch.replied
          ? "replied"
          : touch.opened
            ? "opened"
            : touch.bounced
              ? "draft"
              : "sent",
        sentAt: touch.sentAt?.toISOString() || null,
        scheduledFor: null,
        openedAt: touch.openedAt?.toISOString() || null,
        repliedAt: touch.repliedAt?.toISOString() || null,
      }));

      // Add draft if exists but not sent
      if (podcast.emailDraft && !podcast.sentPrimaryAt) {
        emailSequence.unshift({
          id: `draft-${podcast.id}`,
          type: "initial",
          subject: podcast.emailSubject || "",
          body: podcast.emailDraft,
          status: "draft",
          sentAt: null,
          scheduledFor: null,
          openedAt: null,
          repliedAt: null,
        });
      }

      return {
        id: podcast.id,
        showName: podcast.showName,
        hostName: podcast.hostName,
        primaryEmail: podcast.primaryEmail,
        tier: podcast.tier,
        status: mapStatusToStage(podcast.status, podcast.replyType, podcast.outcome),
        responseType: mapReplyTypeToResponse(podcast.replyType, podcast.outcome),
        emailSequence,
        lastContactedAt: podcast.sentPrimaryAt?.toISOString() || null,
        nextFollowUpAt: podcast.nextActionDate?.toISOString() || null,
        createdAt: podcast.createdAt.toISOString(),
      };
    });

    return NextResponse.json({ campaigns });
  } catch (error) {
    console.error("Error fetching campaigns:", error);
    // Fall back to file-persisted demo data
    const campaigns = await getDemoCampaignsAsync();
    return NextResponse.json({ campaigns });
  }
}

export async function POST(request: NextRequest) {
  try {
    // Handle both JSON and text/plain (from sendBeacon)
    const contentType = request.headers.get("content-type") || "";
    let body;

    if (contentType.includes("application/json")) {
      body = await request.json();
    } else {
      // sendBeacon sends as text/plain
      const text = await request.text();
      try {
        body = JSON.parse(text);
      } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
      }
    }

    const { podcastId, action, campaigns } = body;

    // Handle bulk sync action (from sendBeacon or regular POST)
    // sendBeacon will send { campaigns: [...] } directly
    if (campaigns && Array.isArray(campaigns)) {
      await syncDemoCampaigns(campaigns as DemoCampaign[]);
      return NextResponse.json({
        success: true,
        message: `Synced ${campaigns.length} campaigns`,
      });
    }

    // Legacy sync action
    if (action === "sync" && campaigns) {
      await syncDemoCampaigns(campaigns as DemoCampaign[]);
      return NextResponse.json({
        success: true,
        message: `Synced ${campaigns.length} campaigns`,
      });
    }

    if (!isPrismaAvailable()) {
      // Handle in-memory
      return NextResponse.json({ success: true, message: "Campaign updated (demo mode)" });
    }

    // Handle different actions
    switch (action) {
      case "create":
        // Create a new campaign from a podcast
        await prisma.podcast.update({
          where: { id: podcastId },
          data: { status: "READY" },
        });
        break;

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating campaign:", error);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}

// PUT endpoint for syncing full campaign data
// Also handles POST from sendBeacon (which can't use PUT)
export async function PUT(request: NextRequest) {
  try {
    // Handle both JSON and text/plain (from sendBeacon)
    const contentType = request.headers.get("content-type") || "";
    let data;

    if (contentType.includes("application/json")) {
      data = await request.json();
    } else {
      // sendBeacon sends as text/plain
      const text = await request.text();
      try {
        data = JSON.parse(text);
      } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
      }
    }

    const { campaigns } = data;

    if (!campaigns || !Array.isArray(campaigns)) {
      return NextResponse.json({ error: "Campaigns array required" }, { status: 400 });
    }

    // Sync all campaigns to file storage
    await syncDemoCampaigns(campaigns as DemoCampaign[]);

    return NextResponse.json({
      success: true,
      message: `Synced ${campaigns.length} campaigns to persistent storage`,
    });
  } catch (error) {
    console.error("Error syncing campaigns:", error);
    return NextResponse.json({ error: "Failed to sync campaigns" }, { status: 500 });
  }
}
