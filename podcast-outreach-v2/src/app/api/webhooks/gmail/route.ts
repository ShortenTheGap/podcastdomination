import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { GmailClient } from "@/lib/gmail";
import { getGmailTokens } from "@/app/api/auth/gmail/route";

/**
 * Gmail Webhook Handler
 * 
 * Handles Gmail push notifications for reply detection.
 * 
 * Setup Instructions:
 * 1. Create a Google Cloud Pub/Sub topic
 * 2. Configure Gmail push notifications to that topic
 * 3. Create a push subscription pointing to this endpoint
 * 4. The webhook URL should be: https://your-domain.com/api/webhooks/gmail
 * 
 * POST - Receives Gmail push notifications
 * PUT  - Manually check a specific thread for replies
 * GET  - Health check / subscription confirmation
 */

// Create Gmail client from stored OAuth tokens
async function getGmailClient(): Promise<GmailClient | null> {
  const tokens = await getGmailTokens();
  if (!tokens) {
    return null;
  }
  return new GmailClient({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
  });
}

// Store last processed historyId to avoid reprocessing
const HISTORY_ID_KEY = "gmail_last_history_id";

async function getLastHistoryId(): Promise<string | null> {
  try {
    const record = await db.keyValueStore.findUnique({
      where: { key: HISTORY_ID_KEY },
    });
    return record?.value || null;
  } catch {
    return null;
  }
}

async function setLastHistoryId(historyId: string): Promise<void> {
  await db.keyValueStore.upsert({
    where: { key: HISTORY_ID_KEY },
    update: { value: historyId },
    create: { key: HISTORY_ID_KEY, value: historyId },
  });
}

interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  payload?: {
    headers?: Array<{ name: string; value: string }>;
    body?: { data?: string };
    parts?: Array<{
      mimeType: string;
      body?: { data?: string };
    }>;
  };
}

// Extract email body from Gmail message
function extractEmailBody(message: GmailMessage): string {
  // Try to get body from payload.body.data
  if (message.payload?.body?.data) {
    return Buffer.from(message.payload.body.data, "base64").toString("utf-8");
  }

  // Try to get from parts (multipart messages)
  if (message.payload?.parts) {
    for (const part of message.payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return Buffer.from(part.body.data, "base64").toString("utf-8");
      }
    }
    // Fall back to HTML if no plain text
    for (const part of message.payload.parts) {
      if (part.mimeType === "text/html" && part.body?.data) {
        return Buffer.from(part.body.data, "base64").toString("utf-8");
      }
    }
  }

  return "";
}

// Get header value from message
function getHeader(message: GmailMessage, headerName: string): string | null {
  const header = message.payload?.headers?.find(
    h => h.name.toLowerCase() === headerName.toLowerCase()
  );
  return header?.value || null;
}

// Classify reply type based on content
function classifyReply(body: string): "POSITIVE" | "NEUTRAL" | "NEGATIVE" | "NOT_NOW" | "NEEDS_TOPICS" | "NEEDS_MEDIA_KIT" | "PAID_ONLY" {
  const lowerBody = body.toLowerCase();

  // Positive signals
  if (
    lowerBody.includes("love to have you") ||
    lowerBody.includes("would be great") ||
    lowerBody.includes("let's schedule") ||
    lowerBody.includes("book a time") ||
    lowerBody.includes("yes") ||
    lowerBody.includes("interested")
  ) {
    return "POSITIVE";
  }

  // Negative signals
  if (
    lowerBody.includes("not interested") ||
    lowerBody.includes("no thank") ||
    lowerBody.includes("not a fit") ||
    lowerBody.includes("unsubscribe") ||
    lowerBody.includes("remove me") ||
    lowerBody.includes("don't contact")
  ) {
    return "NEGATIVE";
  }

  // Not now
  if (
    lowerBody.includes("not right now") ||
    lowerBody.includes("maybe later") ||
    lowerBody.includes("reach out again") ||
    lowerBody.includes("booked up") ||
    lowerBody.includes("full schedule")
  ) {
    return "NOT_NOW";
  }

  // Needs more info
  if (
    lowerBody.includes("what topics") ||
    lowerBody.includes("topic ideas") ||
    lowerBody.includes("what would you") ||
    lowerBody.includes("tell me more")
  ) {
    return "NEEDS_TOPICS";
  }

  if (
    lowerBody.includes("media kit") ||
    lowerBody.includes("one sheet") ||
    lowerBody.includes("speaker bio")
  ) {
    return "NEEDS_MEDIA_KIT";
  }

  if (
    lowerBody.includes("paid guest") ||
    lowerBody.includes("sponsor") ||
    lowerBody.includes("fee")
  ) {
    return "PAID_ONLY";
  }

  return "NEUTRAL";
}

// POST /api/webhooks/gmail - Handle Gmail push notifications
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const body = await request.json();

    // Verify this is a valid Pub/Sub message
    if (!body.message?.data) {
      console.log("[Gmail Webhook] Invalid message format, missing data");
      return NextResponse.json({ success: true }); // Return 200 to acknowledge
    }

    // Decode the Pub/Sub message
    const data = JSON.parse(
      Buffer.from(body.message.data, "base64").toString()
    );

    const { historyId, emailAddress } = data;
    console.log("[Gmail Webhook] Received notification:", { historyId, emailAddress });

    // Get Gmail client
    const gmail = await getGmailClient();
    if (!gmail) {
      console.log("[Gmail Webhook] Gmail not connected");
      return NextResponse.json({ success: true }); // Acknowledge but skip
    }

    // Get last processed history ID
    const lastHistoryId = await getLastHistoryId();
    
    if (!lastHistoryId) {
      // First run - just store the current historyId
      await setLastHistoryId(historyId);
      console.log("[Gmail Webhook] First run, stored historyId:", historyId);
      return NextResponse.json({ success: true, message: "Initialized" });
    }

    // Find all touches with gmailThreadId that haven't been marked as replied
    const pendingTouches = await db.touch.findMany({
      where: {
        gmailThreadId: { not: null },
        replied: false,
        bounced: false,
      },
      include: {
        podcast: {
          select: {
            id: true,
            showName: true,
            status: true,
          },
        },
      },
    });

    console.log(`[Gmail Webhook] Checking ${pendingTouches.length} pending threads`);

    let repliesFound = 0;
    let bouncesFound = 0;

    // Check each thread for new messages
    for (const touch of pendingTouches) {
      if (!touch.gmailThreadId) continue;

      try {
        const threadData = await gmail.getThread(touch.gmailThreadId);
        const messages = threadData.messages || [];

        if (messages.length <= 1) {
          // Only our sent message, no reply yet
          continue;
        }

        // Check for replies (messages after our original)
        const ourMessageIndex = messages.findIndex(m => m.id === touch.gmailMessageId);
        const newMessages = messages.slice(ourMessageIndex + 1);

        for (const message of newMessages) {
          const from = getHeader(message as GmailMessage, "From") || "";
          const labelIds = message.labelIds || [];

          // Check if this is a bounce
          if (
            labelIds.includes("CATEGORY_UPDATES") ||
            from.includes("mailer-daemon") ||
            from.includes("postmaster")
          ) {
            console.log(`[Gmail Webhook] Bounce detected for ${touch.podcast.showName}`);
            
            await db.touch.update({
              where: { id: touch.id },
              data: {
                bounced: true,
                bouncedAt: new Date(),
                bounceReason: "Email bounced",
              },
            });

            await db.podcast.update({
              where: { id: touch.podcastId },
              data: {
                outcome: "BOUNCED",
                stopRule: "BOUNCE",
                suppressed: true,
                suppressedAt: new Date(),
                suppressionEvidence: "Email bounced",
              },
            });

            bouncesFound++;
            break;
          }

          // It's a real reply!
          const replyBody = extractEmailBody(message as GmailMessage);
          const replyType = classifyReply(replyBody);

          console.log(`[Gmail Webhook] Reply found for ${touch.podcast.showName}: ${replyType}`);

          // Update touch
          await db.touch.update({
            where: { id: touch.id },
            data: {
              replied: true,
              repliedAt: new Date(),
            },
          });

          // Update podcast
          const podcastUpdate: {
            status: "REPLIED";
            replyReceivedAt: Date;
            replyType: typeof replyType;
            outcome?: "BOOKED" | "DECLINED" | "OPT_OUT";
            nextAction: "CLOSE";
            stopRule?: "OPT_OUT";
            suppressed?: boolean;
            suppressedAt?: Date;
          } = {
            status: "REPLIED",
            replyReceivedAt: new Date(),
            replyType,
            nextAction: "CLOSE",
          };

          // Handle special cases
          if (replyType === "POSITIVE") {
            podcastUpdate.outcome = "BOOKED";
          } else if (replyType === "NEGATIVE") {
            podcastUpdate.outcome = "DECLINED";
            podcastUpdate.stopRule = "OPT_OUT";
            podcastUpdate.suppressed = true;
            podcastUpdate.suppressedAt = new Date();
          }

          await db.podcast.update({
            where: { id: touch.podcastId },
            data: podcastUpdate,
          });

          repliesFound++;
          break; // Only process first reply per thread
        }
      } catch (threadError) {
        console.error(`[Gmail Webhook] Error checking thread ${touch.gmailThreadId}:`, threadError);
      }
    }

    // Update last history ID
    await setLastHistoryId(historyId);

    const duration = Date.now() - startTime;
    console.log(`[Gmail Webhook] Processed in ${duration}ms. Replies: ${repliesFound}, Bounces: ${bouncesFound}`);

    return NextResponse.json({
      success: true,
      repliesFound,
      bouncesFound,
      duration: `${duration}ms`,
    });

  } catch (error) {
    console.error("[Gmail Webhook] Error:", error);
    // Return 200 to acknowledge receipt (prevents retries)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

// PUT /api/webhooks/gmail - Manually check a specific thread for replies
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
    if (!gmail) {
      return NextResponse.json({
        error: "Gmail not connected. Please connect Gmail in Settings first."
      }, { status: 400 });
    }

    // Get the thread
    const thread = await gmail.getThread(threadId);
    const messages = thread.messages || [];
    const messageCount = messages.length;

    if (messageCount <= 1) {
      return NextResponse.json({
        success: true,
        replied: false,
        messageCount,
        message: "No reply yet",
      });
    }

    // Check for replies
    const lastMessage = messages[messages.length - 1];
    const from = getHeader(lastMessage as GmailMessage, "From") || "";
    const labelIds = lastMessage.labelIds || [];

    // Check for bounce
    if (
      labelIds.includes("CATEGORY_UPDATES") ||
      from.includes("mailer-daemon") ||
      from.includes("postmaster")
    ) {
      await db.podcast.update({
        where: { id: podcastId },
        data: {
          outcome: "BOUNCED",
          stopRule: "BOUNCE",
        },
      });

      // Update touch
      await db.touch.updateMany({
        where: { podcastId, gmailThreadId: threadId },
        data: {
          bounced: true,
          bouncedAt: new Date(),
        },
      });

      return NextResponse.json({
        success: true,
        bounced: true,
        messageCount,
      });
    }

    // It's a reply
    const replyBody = extractEmailBody(lastMessage as GmailMessage);
    const replyType = classifyReply(replyBody);

    // Update podcast
    await db.podcast.update({
      where: { id: podcastId },
      data: {
        status: "REPLIED",
        replyReceivedAt: new Date(),
        replyType,
        nextAction: "CLOSE",
      },
    });

    // Update touch
    await db.touch.updateMany({
      where: { podcastId, gmailThreadId: threadId },
      data: {
        replied: true,
        repliedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      replied: true,
      replyType,
      messageCount,
      replyPreview: replyBody.substring(0, 200),
    });

  } catch (error) {
    console.error("[Gmail Webhook] Manual check error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to check thread" },
      { status: 500 }
    );
  }
}

// GET /api/webhooks/gmail - Health check / subscription confirmation
export async function GET() {
  return NextResponse.json({
    status: "ok",
    message: "Gmail webhook endpoint ready",
    timestamp: new Date().toISOString(),
  });
}
