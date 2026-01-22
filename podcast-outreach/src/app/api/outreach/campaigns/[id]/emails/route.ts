import { NextRequest, NextResponse } from "next/server";
import { prisma, isPrismaAvailable } from "@/lib/db";
import { getDemoCampaignAsync, updateDemoCampaignAsync } from "@/lib/demo-campaigns";
import { GmailClient } from "@/lib/gmail";
import { getGmailTokens } from "@/app/api/auth/gmail/route";

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

// Map email type to touch type
function mapEmailTypeToTouchType(emailType: string) {
  switch (emailType) {
    case "initial":
      return "PRIMARY" as const;
    case "follow_up_1":
    case "follow_up_2":
    case "follow_up_3":
    case "nurture":
      return "FOLLOW_UP" as const;
    case "closing":
      return "BACKUP" as const;
    default:
      return "PRIMARY" as const;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!isPrismaAvailable()) {
      // Return emails from file-persisted demo campaign
      const campaign = await getDemoCampaignAsync(id);
      if (campaign) {
        return NextResponse.json({ emails: campaign.emailSequence || [] });
      }
      return NextResponse.json({ emails: [] });
    }

    const podcast = await prisma.podcast.findUnique({
      where: { id },
      include: {
        touches: {
          orderBy: { sentAt: "asc" },
        },
      },
    });

    if (!podcast) {
      return NextResponse.json({ error: "Podcast not found" }, { status: 404 });
    }

    // Convert to email format
    const emails = (podcast.touches as Array<{
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
    }>).map((touch, index) => ({
      id: touch.id,
      type: touch.type === "PRIMARY"
        ? "initial"
        : touch.type === "FOLLOW_UP"
          ? `follow_up_${index}`
          : "closing",
      subject: touch.emailSubject,
      body: touch.emailBody,
      status: touch.replied
        ? "replied"
        : touch.opened
          ? "opened"
          : touch.bounced
            ? "bounced"
            : "sent",
      sentAt: touch.sentAt?.toISOString() || null,
      openedAt: touch.openedAt?.toISOString() || null,
      repliedAt: touch.repliedAt?.toISOString() || null,
    }));

    // Add draft if exists
    if (podcast.emailDraft && !podcast.sentPrimaryAt) {
      emails.unshift({
        id: `draft-${podcast.id}`,
        type: "initial",
        subject: podcast.emailSubject || "",
        body: podcast.emailDraft,
        status: "draft",
        sentAt: null,
        openedAt: null,
        repliedAt: null,
      });
    }

    return NextResponse.json({ emails });
  } catch (error) {
    console.error("Error fetching emails:", error);
    return NextResponse.json({ error: "Failed to fetch emails" }, { status: 500 });
  }
}

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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { type, subject, body, status, scheduledFor, emailSequence, action, senderName, signature } = await request.json();

    // Handle bulk email sequence update
    if (emailSequence && Array.isArray(emailSequence)) {
      if (!isPrismaAvailable()) {
        // Update the entire email sequence in file storage
        await updateDemoCampaignAsync(id, { emailSequence });
        return NextResponse.json({
          success: true,
          message: "Email sequence saved to persistent storage",
        });
      }
    }

    if (!subject || !body) {
      return NextResponse.json({ error: "Subject and body required" }, { status: 400 });
    }

    if (!isPrismaAvailable()) {
      // Update email in file-persisted demo campaign
      const campaign = await getDemoCampaignAsync(id);
      if (campaign) {
        // If action is "send", actually send the email via Gmail
        let gmailMessageId: string | null = null;
        let gmailThreadId: string | null = null;

        if (action === "send" && status === "sent") {
          // Get recipient email from campaign
          const recipientEmail = campaign.primaryEmail;
          if (!recipientEmail) {
            return NextResponse.json({
              error: "No recipient email address found for this podcast"
            }, { status: 400 });
          }

          // Get Gmail client
          const gmail = await getGmailClient();
          if (!gmail) {
            return NextResponse.json({
              error: "Gmail not connected. Please connect your Gmail account in Settings."
            }, { status: 400 });
          }

          // Build the full email body with optional signature
          let fullBody = body;
          if (signature) {
            fullBody = `${body}\n\n${signature}`;
          }

          // Send the email
          try {
            const result = await gmail.sendEmail({
              to: recipientEmail,
              subject: subject,
              body: fullBody,
            });
            gmailMessageId = result.id;
            gmailThreadId = result.threadId;
            console.log(`Email sent successfully to ${recipientEmail}. Message ID: ${result.id}`);
          } catch (sendError) {
            console.error("Failed to send email via Gmail:", sendError);
            return NextResponse.json({
              error: sendError instanceof Error ? sendError.message : "Failed to send email via Gmail"
            }, { status: 500 });
          }
        }

        const existingSequence = campaign.emailSequence || [];
        const emailIndex = existingSequence.findIndex(e => e.type === type);

        const newEmail: EmailInSequence = {
          id: `email-${type}-${Date.now()}`,
          type: type as EmailInSequence["type"],
          subject,
          body,
          status: status || "draft",
          sentAt: status === "sent" ? new Date().toISOString() : null,
          scheduledFor: scheduledFor || null,
          openedAt: null,
          repliedAt: null,
        };

        let updatedSequence: EmailInSequence[];
        if (emailIndex >= 0) {
          updatedSequence = [...existingSequence];
          updatedSequence[emailIndex] = { ...existingSequence[emailIndex], ...newEmail, id: existingSequence[emailIndex].id };
        } else {
          updatedSequence = [...existingSequence, newEmail];
        }

        const updates: { emailSequence: EmailInSequence[]; status?: string; lastContactedAt?: string } = {
          emailSequence: updatedSequence,
        };

        // Update campaign status if email was sent
        if (status === "sent") {
          updates.status = "ready_to_send";
          updates.lastContactedAt = new Date().toISOString();
        }

        await updateDemoCampaignAsync(id, updates);

        return NextResponse.json({
          success: true,
          message: action === "send" ? "Email sent successfully" : "Email saved to persistent storage",
          email: newEmail,
          gmailMessageId,
          gmailThreadId,
        });
      }

      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    // For initial emails, update the draft on the podcast
    if (type === "initial" && status === "draft") {
      await prisma.podcast.update({
        where: { id },
        data: {
          emailDraft: body,
          emailSubject: subject,
          status: "DRAFTED",
        },
      });

      return NextResponse.json({
        success: true,
        message: "Draft saved",
      });
    }

    // For sent emails, create a touch record
    if (status === "sent") {
      const podcast = await prisma.podcast.findUnique({
        where: { id },
        select: { primaryEmail: true },
      });

      if (!podcast?.primaryEmail) {
        return NextResponse.json({ error: "No email address" }, { status: 400 });
      }

      // If action is "send", actually send the email via Gmail
      let gmailMessageId: string | null = null;
      let gmailThreadId: string | null = null;

      if (action === "send") {
        // Get Gmail client
        const gmail = await getGmailClient();
        if (!gmail) {
          return NextResponse.json({
            error: "Gmail not connected. Please connect your Gmail account in Settings."
          }, { status: 400 });
        }

        // Build the full email body with optional signature
        let fullBody = body;
        if (signature) {
          fullBody = `${body}\n\n${signature}`;
        }

        // Send the email
        try {
          const result = await gmail.sendEmail({
            to: podcast.primaryEmail,
            subject: subject,
            body: fullBody,
          });
          gmailMessageId = result.id;
          gmailThreadId = result.threadId;
          console.log(`Email sent successfully to ${podcast.primaryEmail}. Message ID: ${result.id}`);
        } catch (sendError) {
          console.error("Failed to send email via Gmail:", sendError);
          return NextResponse.json({
            error: sendError instanceof Error ? sendError.message : "Failed to send email via Gmail"
          }, { status: 500 });
        }
      }

      const touch = await prisma.touch.create({
        data: {
          podcastId: id,
          type: mapEmailTypeToTouchType(type),
          contactUsed: podcast.primaryEmail,
          sentAt: new Date(),
          emailSubject: subject,
          emailBody: body,
        },
      });

      // Update podcast status
      await prisma.podcast.update({
        where: { id },
        data: {
          status: type === "initial" ? "SENT" : "FOLLOW_UP_SENT",
          sentPrimaryAt: type === "initial" ? new Date() : undefined,
          followUpSentAt: type !== "initial" ? new Date() : undefined,
        },
      });

      return NextResponse.json({
        success: true,
        email: touch,
        gmailMessageId,
        gmailThreadId,
      });
    }

    // For scheduled emails, we'd need a scheduling system
    // For now, just save as draft
    await prisma.podcast.update({
      where: { id },
      data: {
        emailDraft: body,
        emailSubject: subject,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Email saved",
    });
  } catch (error) {
    console.error("Error saving email:", error);
    return NextResponse.json({ error: "Failed to save email" }, { status: 500 });
  }
}
