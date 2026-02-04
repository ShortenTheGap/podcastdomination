import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { GmailClient } from "@/lib/gmail";
import { getGmailTokens } from "@/app/api/auth/gmail/route";

/**
 * CRON JOB: Check for Replies
 * 
 * Polls Gmail threads for replies as a backup to webhooks.
 * Run this every few hours to catch any missed replies.
 * 
 * Schedule: Every 4 hours (or more frequently if needed)
 */

interface CheckResult {
  podcastId: string;
  showName: string;
  threadId: string;
  status: "replied" | "bounced" | "no_reply" | "error";
  replyType?: string;
  error?: string;
}

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

// Classify reply type based on content
function classifyReply(body: string): "POSITIVE" | "NEUTRAL" | "NEGATIVE" | "NOT_NOW" | "NEEDS_TOPICS" | "NEEDS_MEDIA_KIT" | "PAID_ONLY" {
  const lowerBody = body.toLowerCase();

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

  if (
    lowerBody.includes("not interested") ||
    lowerBody.includes("no thank") ||
    lowerBody.includes("not a fit") ||
    lowerBody.includes("unsubscribe") ||
    lowerBody.includes("remove me")
  ) {
    return "NEGATIVE";
  }

  if (
    lowerBody.includes("not right now") ||
    lowerBody.includes("maybe later") ||
    lowerBody.includes("reach out again")
  ) {
    return "NOT_NOW";
  }

  if (lowerBody.includes("what topics") || lowerBody.includes("tell me more")) {
    return "NEEDS_TOPICS";
  }

  if (lowerBody.includes("media kit") || lowerBody.includes("one sheet")) {
    return "NEEDS_MEDIA_KIT";
  }

  if (lowerBody.includes("paid guest") || lowerBody.includes("fee")) {
    return "PAID_ONLY";
  }

  return "NEUTRAL";
}

// GET /api/cron/check-replies - Check all pending threads for replies
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const results: CheckResult[] = [];

  try {
    // Verify cron secret
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get Gmail client
    const gmail = await getGmailClient();
    if (!gmail) {
      return NextResponse.json({
        success: false,
        error: "Gmail not connected",
        results: [],
      }, { status: 400 });
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
      orderBy: { sentAt: "desc" },
      take: 50, // Process in batches
    });

    console.log(`[Check Replies] Checking ${pendingTouches.length} pending threads`);

    for (const touch of pendingTouches) {
      if (!touch.gmailThreadId) continue;

      try {
        const { hasReply, replyText } = await gmail.checkForReplies(touch.gmailThreadId);

        if (hasReply && replyText) {
          const replyType = classifyReply(replyText);

          // Update touch
          await db.touch.update({
            where: { id: touch.id },
            data: {
              replied: true,
              repliedAt: new Date(),
            },
          });

          // Update podcast
          await db.podcast.update({
            where: { id: touch.podcastId },
            data: {
              status: "REPLIED",
              replyReceivedAt: new Date(),
              replyType,
              nextAction: "CLOSE",
              outcome: replyType === "POSITIVE" ? "BOOKED" : replyType === "NEGATIVE" ? "DECLINED" : undefined,
            },
          });

          results.push({
            podcastId: touch.podcastId,
            showName: touch.podcast.showName,
            threadId: touch.gmailThreadId,
            status: "replied",
            replyType,
          });

          console.log(`[Check Replies] Reply found for ${touch.podcast.showName}: ${replyType}`);
        } else {
          // Check for bounce
          const { bounced, reason } = await gmail.getBounceStatus(touch.gmailMessageId || "");
          
          if (bounced) {
            await db.touch.update({
              where: { id: touch.id },
              data: {
                bounced: true,
                bouncedAt: new Date(),
                bounceReason: reason,
              },
            });

            await db.podcast.update({
              where: { id: touch.podcastId },
              data: {
                outcome: "BOUNCED",
                stopRule: "BOUNCE",
                suppressed: true,
                suppressedAt: new Date(),
              },
            });

            results.push({
              podcastId: touch.podcastId,
              showName: touch.podcast.showName,
              threadId: touch.gmailThreadId,
              status: "bounced",
            });

            console.log(`[Check Replies] Bounce for ${touch.podcast.showName}`);
          } else {
            results.push({
              podcastId: touch.podcastId,
              showName: touch.podcast.showName,
              threadId: touch.gmailThreadId,
              status: "no_reply",
            });
          }
        }

        // Rate limit: wait 200ms between API calls
        await new Promise(resolve => setTimeout(resolve, 200));

      } catch (error) {
        console.error(`[Check Replies] Error checking ${touch.gmailThreadId}:`, error);
        results.push({
          podcastId: touch.podcastId,
          showName: touch.podcast.showName,
          threadId: touch.gmailThreadId || "unknown",
          status: "error",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    const duration = Date.now() - startTime;
    const repliesFound = results.filter(r => r.status === "replied").length;
    const bouncesFound = results.filter(r => r.status === "bounced").length;

    return NextResponse.json({
      success: true,
      message: `Checked ${results.length} threads. Found ${repliesFound} replies, ${bouncesFound} bounces.`,
      duration: `${duration}ms`,
      repliesFound,
      bouncesFound,
      results,
    });

  } catch (error) {
    console.error("[Check Replies] Error:", error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      results,
    }, { status: 500 });
  }
}


