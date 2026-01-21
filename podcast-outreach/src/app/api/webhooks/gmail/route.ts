import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { GmailClient } from "@/lib/gmail";
import { getGmailTokens } from "@/app/api/auth/gmail/route";

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

// POST /api/webhooks/gmail - Handle Gmail push notifications
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Verify the push notification
    // Gmail sends base64-encoded data
    const data = JSON.parse(
      Buffer.from(body.message.data, "base64").toString()
    );

    const { historyId, emailAddress } = data;

    console.log("Gmail webhook received:", { historyId, emailAddress });

    // Find touches that have been sent but not yet marked as replied
    const sentTouches = await db.touch.findMany({
      where: {
        replied: false,
        bounced: false,
      },
      include: {
        podcast: true,
      },
    });

    // For each touch, we need to check if the thread has replies
    // In a full implementation, we'd store gmailThreadId on the Touch
    // For now, we'll check podcasts that are in SENT status

    const sentPodcasts = await db.podcast.findMany({
      where: {
        status: { in: ["SENT", "FOLLOW_UP_SENT", "ESCALATED"] },
      },
      include: {
        touches: {
          orderBy: { sentAt: "desc" },
          take: 1,
        },
      },
    });

    for (const podcast of sentPodcasts) {
      const latestTouch = podcast.touches[0];
      if (!latestTouch) continue;

      // In a full implementation, we'd store and check gmailThreadId
      // For now, log that we received a webhook
      console.log(`Checking podcast ${podcast.id} for replies`);
    }

    // Note: Full implementation would:
    // 1. Store gmailThreadId on Touch records
    // 2. Use Gmail History API to get changes since lastHistoryId
    // 3. Match incoming messages to our tracked threads
    // 4. Update Touch.replied and Podcast.status accordingly

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Gmail webhook error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}

// Separate endpoint to manually check for replies (for testing/debugging)
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { threadId, podcastId } = body;

    if (!threadId || !podcastId) {
      return NextResponse.json(
        { error: "threadId and podcastId required" },
        { status: 400 }
      );
    }

    const gmail = await getGmailClient();
    const thread = await gmail.getThread(threadId);
    const messageCount = thread.messages?.length || 0;

    if (messageCount > 1) {
      // Update the podcast and touch
      await db.podcast.update({
        where: { id: podcastId },
        data: {
          status: "REPLIED",
          replyReceivedAt: new Date(),
          nextAction: "CLOSE",
        },
      });

      // Update the latest touch
      const latestTouch = await db.touch.findFirst({
        where: { podcastId },
        orderBy: { sentAt: "desc" },
      });

      if (latestTouch) {
        await db.touch.update({
          where: { id: latestTouch.id },
          data: {
            replied: true,
            repliedAt: new Date(),
          },
        });
      }

      return NextResponse.json({
        success: true,
        replied: true,
        messageCount,
      });
    }

    return NextResponse.json({
      success: true,
      replied: false,
      messageCount,
    });
  } catch (error) {
    console.error("Error checking thread:", error);
    return NextResponse.json(
      { error: "Failed to check thread" },
      { status: 500 }
    );
  }
}

// Required for Gmail push - acknowledge the subscription
export async function GET() {
  return NextResponse.json({ status: "ok" });
}
