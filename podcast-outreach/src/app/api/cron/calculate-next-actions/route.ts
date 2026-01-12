import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { SENDING_RULES } from "@/lib/constants";

// GET /api/cron/calculate-next-actions - Calculate and update next actions for all open podcasts
export async function GET() {
  try {
    const podcasts = await db.podcast.findMany({
      where: {
        outcome: "OPEN",
        suppressed: false,
      },
      include: {
        touches: {
          orderBy: { sentAt: "desc" },
          take: 1,
        },
      },
    });

    let updated = 0;

    for (const podcast of podcasts) {
      const updates = calculateNextAction(podcast);
      if (updates) {
        await db.podcast.update({
          where: { id: podcast.id },
          data: updates,
        });
        updated++;
      }
    }

    return NextResponse.json({
      success: true,
      processed: podcasts.length,
      updated,
    });
  } catch (error) {
    console.error("Error calculating next actions:", error);
    return NextResponse.json(
      { error: "Failed to calculate next actions" },
      { status: 500 }
    );
  }
}

interface PodcastWithTouches {
  id: string;
  status: string;
  tier: string;
  sentAt: Date | null;
  followUpSentAt: Date | null;
  escalatedAt: Date | null;
  replyReceivedAt: Date | null;
  primaryEmail: string | null;
  backupEmail: string | null;
  touches: Array<{
    id: string;
    touchType: string;
    sentAt: Date | null;
  }>;
}

function calculateNextAction(podcast: PodcastWithTouches): {
  nextAction: string;
  nextActionDate: Date | null;
  status: string;
} | null {
  const now = new Date();

  // If replied, close out
  if (podcast.replyReceivedAt) {
    return {
      nextAction: "CLOSE",
      nextActionDate: null,
      status: "REPLIED",
    };
  }

  // Not yet sent - needs drafting or sending
  if (!podcast.sentAt) {
    if (podcast.status === "QA_APPROVED") {
      return {
        nextAction: "SEND",
        nextActionDate: now,
        status: "QA_APPROVED",
      };
    }
    if (podcast.status === "DRAFTED") {
      return {
        nextAction: "QA",
        nextActionDate: now,
        status: "DRAFTED",
      };
    }
    if (podcast.tier && podcast.tier !== "PENDING" && podcast.tier !== "TIER_3") {
      return {
        nextAction: "DRAFT",
        nextActionDate: now,
        status: "READY_TO_DRAFT",
      };
    }
    return null; // Needs tiering first
  }

  // Calculate days since last touch
  const daysSinceSent = Math.floor(
    (now.getTime() - podcast.sentAt.getTime()) / (1000 * 60 * 60 * 24)
  );

  // Check if follow-up is due
  if (!podcast.followUpSentAt && daysSinceSent >= SENDING_RULES.FOLLOW_UP_DELAY_DAYS) {
    return {
      nextAction: "FOLLOW_UP",
      nextActionDate: now,
      status: "FOLLOW_UP_DUE",
    };
  }

  // Check if escalation is due (to backup email)
  if (
    podcast.followUpSentAt &&
    podcast.backupEmail &&
    !podcast.escalatedAt
  ) {
    const daysSinceFollowUp = Math.floor(
      (now.getTime() - podcast.followUpSentAt.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSinceFollowUp >= SENDING_RULES.ESCALATION_DELAY_DAYS) {
      return {
        nextAction: "ESCALATE",
        nextActionDate: now,
        status: "ESCALATION_DUE",
      };
    }
  }

  // Check if we should close as no response
  if (podcast.followUpSentAt || podcast.escalatedAt) {
    const lastTouchDate = podcast.escalatedAt || podcast.followUpSentAt;
    if (lastTouchDate) {
      const daysSinceLastTouch = Math.floor(
        (now.getTime() - lastTouchDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      // If no backup email and follow-up sent, or escalation sent - check close threshold
      const shouldClose =
        (!podcast.backupEmail && daysSinceLastTouch >= SENDING_RULES.ESCALATION_DELAY_DAYS) ||
        (podcast.escalatedAt && daysSinceLastTouch >= SENDING_RULES.CLOSE_NO_RESPONSE_DAYS);

      if (shouldClose) {
        return {
          nextAction: "CLOSE",
          nextActionDate: null,
          status: "CLOSED",
        };
      }
    }
  }

  // Still waiting for response
  const currentStatus = podcast.escalatedAt
    ? "ESCALATED"
    : podcast.followUpSentAt
    ? "FOLLOW_UP_SENT"
    : "SENT";

  // Calculate when next action will be due
  let nextActionDate: Date | null = null;
  if (currentStatus === "SENT") {
    nextActionDate = new Date(podcast.sentAt);
    nextActionDate.setDate(nextActionDate.getDate() + SENDING_RULES.FOLLOW_UP_DELAY_DAYS);
  } else if (currentStatus === "FOLLOW_UP_SENT" && podcast.backupEmail && podcast.followUpSentAt) {
    nextActionDate = new Date(podcast.followUpSentAt);
    nextActionDate.setDate(nextActionDate.getDate() + SENDING_RULES.ESCALATION_DELAY_DAYS);
  }

  return {
    nextAction: "WAIT",
    nextActionDate,
    status: currentStatus,
  };
}
