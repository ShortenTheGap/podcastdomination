import { NextRequest, NextResponse } from "next/server";
import { prisma, isPrismaAvailable } from "@/lib/db";

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

// In-memory storage for demo purposes when DB unavailable
let inMemoryCampaigns: OutreachCampaign[] = [];

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
      return "ready_to_send";
    case "SENT":
      return "sent_awaiting";
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
      // Return in-memory data or seed data for demo
      if (inMemoryCampaigns.length === 0) {
        // Create some demo data
        inMemoryCampaigns = [
          {
            id: "demo-1",
            showName: "The Health & Fitness Podcast",
            hostName: "Dr. Sarah Johnson",
            primaryEmail: "sarah@healthpodcast.com",
            tier: "TIER_1",
            status: "sent_awaiting",
            responseType: null,
            emailSequence: [
              {
                id: "email-1",
                type: "initial",
                subject: "Guest opportunity for The Health & Fitness Podcast",
                body: "Hi Sarah, I came across your podcast and loved your episode on nutrition myths...",
                status: "sent",
                sentAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
                scheduledFor: null,
                openedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
                repliedAt: null,
              },
            ],
            lastContactedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
            nextFollowUpAt: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
            createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
          },
          {
            id: "demo-2",
            showName: "CEO Mindset Show",
            hostName: "Mike Thompson",
            primaryEmail: "booking@ceomindset.com",
            tier: "TIER_2",
            status: "drafting",
            responseType: null,
            emailSequence: [
              {
                id: "email-2",
                type: "initial",
                subject: "Guest pitch for CEO Mindset Show",
                body: "Hi Mike, I've been following your show and think my expertise in...",
                status: "draft",
                sentAt: null,
                scheduledFor: null,
                openedAt: null,
                repliedAt: null,
              },
            ],
            lastContactedAt: null,
            nextFollowUpAt: null,
            createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          },
          {
            id: "demo-3",
            showName: "Wellness Warriors",
            hostName: "Lisa Chen",
            primaryEmail: "lisa@wellnesswarriors.com",
            tier: "TIER_1",
            status: "responded",
            responseType: "interested_not_booked",
            emailSequence: [
              {
                id: "email-3",
                type: "initial",
                subject: "Podcast guest pitch",
                body: "Hi Lisa, Your recent episode on holistic health really resonated with me...",
                status: "replied",
                sentAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
                scheduledFor: null,
                openedAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString(),
                repliedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
              },
            ],
            lastContactedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
            nextFollowUpAt: null,
            createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
          },
          {
            id: "demo-4",
            showName: "Dad Life Podcast",
            hostName: "James Miller",
            primaryEmail: "james@dadlifepod.com",
            tier: "TIER_1",
            status: "booked",
            responseType: "booked",
            emailSequence: [
              {
                id: "email-4",
                type: "initial",
                subject: "Would love to be a guest on Dad Life",
                body: "Hey James, As a fellow dad, I really connected with your episode about...",
                status: "replied",
                sentAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
                scheduledFor: null,
                openedAt: new Date(Date.now() - 19 * 24 * 60 * 60 * 1000).toISOString(),
                repliedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
              },
            ],
            lastContactedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
            nextFollowUpAt: null,
            createdAt: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString(),
          },
          {
            id: "demo-5",
            showName: "Fitness Revolution",
            hostName: "Alex Rodriguez",
            primaryEmail: "alex@fitnessrev.com",
            tier: "TIER_2",
            status: "follow_up_due",
            responseType: "no_response",
            emailSequence: [
              {
                id: "email-5",
                type: "initial",
                subject: "Guest opportunity",
                body: "Hi Alex, I've been a fan of your science-based approach to fitness...",
                status: "sent",
                sentAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
                scheduledFor: null,
                openedAt: null,
                repliedAt: null,
              },
            ],
            lastContactedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
            nextFollowUpAt: new Date().toISOString(),
            createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
          },
        ];
      }
      return NextResponse.json({ campaigns: inMemoryCampaigns });
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
    return NextResponse.json({ campaigns: inMemoryCampaigns });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { podcastId, action } = body;

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
