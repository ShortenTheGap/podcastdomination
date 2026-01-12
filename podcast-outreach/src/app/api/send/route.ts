import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/gmail";
import { z } from "zod";

const sendSchema = z.object({
  outreachId: z.string(),
  scheduledAt: z.string().datetime().optional(),
});

// POST /api/send - Send an email
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { outreachId, scheduledAt } = sendSchema.parse(body);

    // Get outreach with contact
    const outreach = await db.outreach.findUnique({
      where: { id: outreachId },
      include: {
        contact: true,
        podcast: true,
      },
    });

    if (!outreach) {
      return NextResponse.json(
        { error: "Outreach not found" },
        { status: 404 }
      );
    }

    if (!outreach.contact?.email) {
      return NextResponse.json(
        { error: "No contact email found" },
        { status: 400 }
      );
    }

    if (!outreach.subject || !outreach.body) {
      return NextResponse.json(
        { error: "Draft not complete - missing subject or body" },
        { status: 400 }
      );
    }

    // TODO: Handle scheduled sending
    if (scheduledAt) {
      // Queue for later sending
      return NextResponse.json({
        message: "Email scheduled",
        scheduledAt,
      });
    }

    // Send immediately
    const result = await sendEmail({
      to: outreach.contact.email,
      subject: outreach.subject,
      body: outreach.body,
    });

    // Update outreach status
    await db.outreach.update({
      where: { id: outreachId },
      data: {
        status: "sent",
        sentAt: new Date(),
        gmailMessageId: result.messageId,
        gmailThreadId: result.threadId,
      },
    });

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      threadId: result.threadId,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.errors },
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
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    const where: Record<string, unknown> = {
      sentAt: { not: null },
    };

    if (status) {
      where.status = status;
    }

    const sent = await db.outreach.findMany({
      where,
      include: {
        podcast: true,
        contact: true,
      },
      orderBy: { sentAt: "desc" },
      take: 50,
    });

    return NextResponse.json(sent);
  } catch (error) {
    console.error("Error fetching sent emails:", error);
    return NextResponse.json(
      { error: "Failed to fetch sent emails" },
      { status: 500 }
    );
  }
}
