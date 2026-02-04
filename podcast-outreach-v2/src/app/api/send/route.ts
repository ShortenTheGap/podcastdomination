import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { GmailClient } from "@/lib/gmail";
import { z } from "zod";
import { SENDING_RULES } from "@/lib/constants";
import { getGmailTokens } from "@/app/api/auth/gmail/route";
import { withRateLimit } from "@/lib/rate-limiter";

// Create Gmail client from stored OAuth tokens
async function getGmailClient() {
  const tokens = await getGmailTokens();
  if (!tokens) {
    throw new Error("Gmail not connected. Please connect Gmail in Settings first.");
  }
  return new GmailClient({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
  });
}

const sendSchema = z.object({
  podcastId: z.string(),
  useBackupEmail: z.boolean().default(false),
  scheduledAt: z.string().datetime().optional(),
});

// POST /api/send - Send an email
export async function POST(request: NextRequest) {
  // Apply rate limiting
  const rateLimitResponse = await withRateLimit(request);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = await request.json();
    const { podcastId, useBackupEmail, scheduledAt } = sendSchema.parse(body);

    // Get podcast
    const podcast = await db.podcast.findUnique({
      where: { id: podcastId },
      include: {
        touches: {
          orderBy: { sentAt: "desc" },
          take: 5,
        },
      },
    });

    if (!podcast) {
      return NextResponse.json(
        { error: "Podcast not found" },
        { status: 404 }
      );
    }

    // Determine which email to use
    const emailToUse = useBackupEmail ? podcast.backupEmail : podcast.primaryEmail;

    if (!emailToUse) {
      return NextResponse.json(
        { error: useBackupEmail ? "No backup email found" : "No primary email found" },
        { status: 400 }
      );
    }

    if (!podcast.emailSubject || !podcast.emailDraft) {
      return NextResponse.json(
        { error: "Draft not complete - missing subject or body" },
        { status: 400 }
      );
    }

    // Check QA status
    if (podcast.qaStatus !== "PASS") {
      return NextResponse.json(
        { error: "Draft has not passed QA review" },
        { status: 400 }
      );
    }

    // Check sending limits
    const todaySentCount = await db.touch.count({
      where: {
        sentAt: {
          gte: new Date(new Date().setHours(0, 0, 0, 0)),
        },
      },
    });

    if (todaySentCount >= SENDING_RULES.DAILY_CAP) {
      return NextResponse.json(
        { error: `Daily send limit reached (${SENDING_RULES.DAILY_CAP})` },
        { status: 429 }
      );
    }

    // Determine touch type
    const existingTouches = podcast.touches.length;
    let touchType: "PRIMARY" | "FOLLOW_UP" | "BACKUP" = "PRIMARY";

    if (useBackupEmail) {
      touchType = "BACKUP";
    } else if (existingTouches > 0) {
      touchType = "FOLLOW_UP";
    }

    // Check follow-up limits
    if (touchType === "FOLLOW_UP") {
      const followUpCount = podcast.touches.filter((t: { type: string }) => t.type === "FOLLOW_UP").length;
      if (followUpCount >= SENDING_RULES.MAX_FOLLOW_UPS) {
        return NextResponse.json(
          { error: `Maximum follow-ups reached (${SENDING_RULES.MAX_FOLLOW_UPS})` },
          { status: 400 }
        );
      }
    }

    // TODO: Handle scheduled sending
    if (scheduledAt) {
      return NextResponse.json({
        message: "Email scheduled",
        scheduledAt,
      });
    }

    // Send immediately
    const gmail = await getGmailClient();
    const result = await gmail.sendEmail({
      to: emailToUse,
      subject: podcast.emailSubject,
      body: podcast.emailDraft,
    });

    // Create touch record
    const touch = await db.touch.create({
      data: {
        podcastId: podcast.id,
        type: touchType,
        contactUsed: emailToUse,
        sentAt: new Date(),
        emailBody: podcast.emailDraft,
        emailSubject: podcast.emailSubject,
      },
    });

    // Update podcast status
    const newStatus = touchType === "PRIMARY" ? "SENT" :
                      touchType === "FOLLOW_UP" ? "FOLLOW_UP_SENT" :
                      "ESCALATED";

    await db.podcast.update({
      where: { id: podcastId },
      data: {
        status: newStatus,
        ...(touchType === "PRIMARY" && { sentPrimaryAt: new Date() }),
        ...(touchType === "FOLLOW_UP" && { followUpSentAt: new Date() }),
        ...(touchType === "BACKUP" && { sentBackupAt: new Date() }),
        nextAction: touchType === "PRIMARY" ? "FOLLOW_UP" : "CLOSE",
        nextActionDate: new Date(Date.now() + SENDING_RULES.FOLLOW_UP_DELAY_DAYS * 24 * 60 * 60 * 1000),
      },
    });

    return NextResponse.json({
      success: true,
      touchId: touch.id,
      messageId: result.id,
      threadId: result.threadId,
      type: touchType,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Error sending email:", error);
    return NextResponse.json(
      { error: "Failed to send email" },
      { status: 500 }
    );
  }
}

// GET /api/send - Get send queue / history
export async function GET(request: NextRequest) {
  // Apply rate limiting
  const rateLimitResponse = await withRateLimit(request);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    const where: Record<string, unknown> = {};

    if (status) {
      where.status = { in: status.split(",") };
    } else {
      // Default: show sent emails
      where.status = { in: ["SENT", "FOLLOW_UP_SENT", "ESCALATED", "REPLIED"] };
    }

    const podcasts = await db.podcast.findMany({
      where,
      include: {
        touches: {
          orderBy: { sentAt: "desc" },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });

    return NextResponse.json(podcasts);
  } catch (error) {
    console.error("Error fetching sent emails:", error);
    return NextResponse.json(
      { error: "Failed to fetch sent emails" },
      { status: 500 }
    );
  }
}
