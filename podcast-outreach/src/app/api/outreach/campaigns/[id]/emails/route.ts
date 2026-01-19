import { NextRequest, NextResponse } from "next/server";
import { prisma, isPrismaAvailable } from "@/lib/db";

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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { type, subject, body, status, scheduledFor } = await request.json();

    if (!subject || !body) {
      return NextResponse.json({ error: "Subject and body required" }, { status: 400 });
    }

    if (!isPrismaAvailable()) {
      return NextResponse.json({
        success: true,
        message: "Email saved (demo mode)",
        email: { id: `demo-${Date.now()}`, type, subject, body, status },
      });
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
