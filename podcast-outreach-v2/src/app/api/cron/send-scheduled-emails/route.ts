import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { GmailClient } from "@/lib/gmail";
import { getGmailTokens } from "@/app/api/auth/gmail/route";
import { SENDING_RULES } from "@/lib/constants";

/**
 * CRON JOB: Send Scheduled Emails
 * 
 * This cron job ACTUALLY sends emails via Gmail API.
 * It handles:
 * 1. Follow-ups that are due (podcasts in FOLLOW_UP_DUE status)
 * 2. Escalations to backup emails (podcasts in ESCALATION_DUE status)
 * 
 * Schedule: Run daily (or multiple times per day)
 * Recommended: Set up in Railway/Vercel cron to run every hour during business hours
 */

interface SendResult {
  podcastId: string;
  showName: string;
  email: string;
  type: "follow_up" | "escalation";
  success: boolean;
  gmailMessageId?: string;
  gmailThreadId?: string;
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

// Generate follow-up email subject (Re: original subject)
function generateFollowUpSubject(originalSubject: string): string {
  if (originalSubject.toLowerCase().startsWith("re:")) {
    return originalSubject;
  }
  return `Re: ${originalSubject}`;
}

// Generate follow-up email body
function generateFollowUpBody(
  hostName: string | null,
  originalBody: string,
): string {
  const greeting = hostName ? `Hi ${hostName}` : "Hi there";
  
  return `${greeting},

Just wanted to follow up on my previous email. I know things get busy, so I wanted to bump this to the top of your inbox.

Would love to chat if you're still looking for guests. Let me know if there's a better time or if you have any questions.

Thanks!

---

On my previous email, I wrote:

${originalBody}`;
}

// Generate escalation email body (for backup contact)
function generateEscalationBody(
  showName: string,
  hostName: string | null,
): string {
  const hostRef = hostName ? `${hostName}'s` : "the";
  
  return `Hi there,

I've been trying to reach out to ${hostRef} show "${showName}" about a potential guest appearance.

I'm a PhD researcher specializing in evidence-based fat loss and body recomposition. I've helped countless clients transform their bodies using sustainable, science-backed methods.

I'd love to share actionable insights with your audience. Would you be open to connecting me with the right person to discuss this?

Thanks for your time!`;
}

// GET /api/cron/send-scheduled-emails - Run scheduled email sends
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const results: SendResult[] = [];
  
  try {
    // Verify cron secret (optional but recommended)
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      console.log("[Cron] Unauthorized cron request");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get Gmail client
    const gmail = await getGmailClient();
    if (!gmail) {
      return NextResponse.json({
        success: false,
        error: "Gmail not connected. Please connect Gmail in Settings first.",
        results: [],
      }, { status: 400 });
    }

    // Check how many emails we've already sent today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const sentToday = await db.touch.count({
      where: {
        sentAt: { gte: today },
      },
    });

    const remainingCap = SENDING_RULES.DAILY_CAP - sentToday;
    console.log(`[Cron] Daily cap: ${SENDING_RULES.DAILY_CAP}, sent today: ${sentToday}, remaining: ${remainingCap}`);

    if (remainingCap <= 0) {
      return NextResponse.json({
        success: true,
        message: "Daily send cap reached",
        sentToday,
        cap: SENDING_RULES.DAILY_CAP,
        results: [],
      });
    }

    // ==========================================
    // PART 1: Send Follow-Up Emails
    // ==========================================
    
    const followUpDuePodcasts = await db.podcast.findMany({
      where: {
        status: "FOLLOW_UP_DUE",
        primaryEmail: { not: null },
        suppressed: false,
        replyReceivedAt: null,
      },
      include: {
        touches: {
          where: { type: "PRIMARY" },
          orderBy: { sentAt: "desc" },
          take: 1,
        },
      },
      take: Math.min(remainingCap, 5), // Send max 5 follow-ups per run
    });

    console.log(`[Cron] Found ${followUpDuePodcasts.length} podcasts due for follow-up`);

    for (const podcast of followUpDuePodcasts) {
      const originalTouch = podcast.touches[0];
      if (!originalTouch || !podcast.primaryEmail) {
        continue;
      }

      try {
        // Generate follow-up content
        const subject = generateFollowUpSubject(originalTouch.emailSubject);
        const body = generateFollowUpBody(podcast.hostName, originalTouch.emailBody);

        // Send via Gmail
        const gmailResult = await gmail.sendEmail({
          to: podcast.primaryEmail,
          subject,
          body,
          replyTo: originalTouch.gmailMessageId || undefined,
        });

        console.log(`[Cron] Sent follow-up to ${podcast.primaryEmail} for "${podcast.showName}"`);

        // Create touch record
        await db.touch.create({
          data: {
            podcastId: podcast.id,
            type: "FOLLOW_UP",
            contactUsed: podcast.primaryEmail,
            sentAt: new Date(),
            emailSubject: subject,
            emailBody: body,
            gmailMessageId: gmailResult.id,
            gmailThreadId: gmailResult.threadId,
          },
        });

        // Update podcast status
        await db.podcast.update({
          where: { id: podcast.id },
          data: {
            status: "FOLLOW_UP_SENT",
            followUpSentAt: new Date(),
            nextAction: "ESCALATE",
            nextActionDate: new Date(Date.now() + SENDING_RULES.ESCALATION_DELAY_DAYS * 24 * 60 * 60 * 1000),
          },
        });

        results.push({
          podcastId: podcast.id,
          showName: podcast.showName,
          email: podcast.primaryEmail,
          type: "follow_up",
          success: true,
          gmailMessageId: gmailResult.id,
          gmailThreadId: gmailResult.threadId,
        });

      } catch (error) {
        console.error(`[Cron] Failed to send follow-up to ${podcast.primaryEmail}:`, error);
        
        results.push({
          podcastId: podcast.id,
          showName: podcast.showName,
          email: podcast.primaryEmail || "unknown",
          type: "follow_up",
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    // ==========================================
    // PART 2: Send Escalation Emails (Backup)
    // ==========================================
    
    const remainingAfterFollowups = remainingCap - results.filter(r => r.success).length;
    
    if (remainingAfterFollowups > 0) {
      const escalationDuePodcasts = await db.podcast.findMany({
        where: {
          status: "ESCALATION_DUE",
          backupEmail: { not: null },
          suppressed: false,
          replyReceivedAt: null,
        },
        take: Math.min(remainingAfterFollowups, 3), // Send max 3 escalations per run
      });

      console.log(`[Cron] Found ${escalationDuePodcasts.length} podcasts due for escalation`);

      for (const podcast of escalationDuePodcasts) {
        if (!podcast.backupEmail) {
          continue;
        }

        try {
          // Generate escalation content
          const subject = `Guest Inquiry: ${podcast.showName}`;
          const body = generateEscalationBody(podcast.showName, podcast.hostName);

          // Send via Gmail
          const gmailResult = await gmail.sendEmail({
            to: podcast.backupEmail,
            subject,
            body,
          });

          console.log(`[Cron] Sent escalation to ${podcast.backupEmail} for "${podcast.showName}"`);

          // Create touch record
          await db.touch.create({
            data: {
              podcastId: podcast.id,
              type: "BACKUP",
              contactUsed: podcast.backupEmail,
              sentAt: new Date(),
              emailSubject: subject,
              emailBody: body,
              gmailMessageId: gmailResult.id,
              gmailThreadId: gmailResult.threadId,
            },
          });

          // Update podcast status
          await db.podcast.update({
            where: { id: podcast.id },
            data: {
              status: "ESCALATED",
              sentBackupAt: new Date(),
              nextAction: "CLOSE",
              nextActionDate: new Date(Date.now() + SENDING_RULES.CLOSE_NO_RESPONSE_DAYS * 24 * 60 * 60 * 1000),
            },
          });

          results.push({
            podcastId: podcast.id,
            showName: podcast.showName,
            email: podcast.backupEmail,
            type: "escalation",
            success: true,
            gmailMessageId: gmailResult.id,
            gmailThreadId: gmailResult.threadId,
          });

        } catch (error) {
          console.error(`[Cron] Failed to send escalation to ${podcast.backupEmail}:`, error);
          
          results.push({
            podcastId: podcast.id,
            showName: podcast.showName,
            email: podcast.backupEmail || "unknown",
            type: "escalation",
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }
    }

    const duration = Date.now() - startTime;
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    return NextResponse.json({
      success: true,
      message: `Sent ${successCount} emails (${failCount} failed)`,
      duration: `${duration}ms`,
      sentToday: sentToday + successCount,
      cap: SENDING_RULES.DAILY_CAP,
      results,
    });

  } catch (error) {
    console.error("[Cron] Send scheduled emails error:", error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      results,
    }, { status: 500 });
  }
}

// POST /api/cron/send-scheduled-emails - Manually trigger for specific podcast
export async function POST(request: NextRequest) {
  try {
    const { podcastId, type } = await request.json();

    if (!podcastId) {
      return NextResponse.json({ error: "podcastId required" }, { status: 400 });
    }

    const podcast = await db.podcast.findUnique({
      where: { id: podcastId },
      include: {
        touches: {
          orderBy: { sentAt: "desc" },
          take: 1,
        },
      },
    });

    if (!podcast) {
      return NextResponse.json({ error: "Podcast not found" }, { status: 404 });
    }

    const gmail = await getGmailClient();
    if (!gmail) {
      return NextResponse.json({
        error: "Gmail not connected. Please connect Gmail in Settings first."
      }, { status: 400 });
    }

    const email = type === "escalation" ? podcast.backupEmail : podcast.primaryEmail;
    if (!email) {
      return NextResponse.json({ error: "No email address available" }, { status: 400 });
    }

    let subject: string;
    let body: string;
    let touchType: "FOLLOW_UP" | "BACKUP";

    if (type === "escalation") {
      subject = `Guest Inquiry: ${podcast.showName}`;
      body = generateEscalationBody(podcast.showName, podcast.hostName);
      touchType = "BACKUP";
    } else {
      const originalTouch = podcast.touches[0];
      if (!originalTouch) {
        return NextResponse.json({ error: "No previous email found for follow-up" }, { status: 400 });
      }
      subject = generateFollowUpSubject(originalTouch.emailSubject);
      body = generateFollowUpBody(podcast.hostName, originalTouch.emailBody);
      touchType = "FOLLOW_UP";
    }

    // Send via Gmail
    const gmailResult = await gmail.sendEmail({
      to: email,
      subject,
      body,
    });

    // Create touch record
    const touch = await db.touch.create({
      data: {
        podcastId: podcast.id,
        type: touchType,
        contactUsed: email,
        sentAt: new Date(),
        emailSubject: subject,
        emailBody: body,
        gmailMessageId: gmailResult.id,
        gmailThreadId: gmailResult.threadId,
      },
    });

    // Update podcast status
    const statusUpdate = type === "escalation" 
      ? { status: "ESCALATED" as const, sentBackupAt: new Date() }
      : { status: "FOLLOW_UP_SENT" as const, followUpSentAt: new Date() };

    await db.podcast.update({
      where: { id: podcast.id },
      data: statusUpdate,
    });

    return NextResponse.json({
      success: true,
      message: `Email sent to ${email}`,
      touch: {
        id: touch.id,
        gmailMessageId: gmailResult.id,
        gmailThreadId: gmailResult.threadId,
      },
    });

  } catch (error) {
    console.error("[Cron] Manual send error:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Failed to send email"
    }, { status: 500 });
  }
}


