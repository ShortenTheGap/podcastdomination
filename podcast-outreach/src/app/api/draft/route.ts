import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { z } from "zod";

const updateDraftSchema = z.object({
  outreachId: z.string(),
  subject: z.string().optional(),
  body: z.string().optional(),
  status: z.string().optional(),
});

// GET /api/draft - Get drafts pending review
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "drafted";

    const drafts = await db.outreach.findMany({
      where: {
        status: {
          in: status.split(","),
        },
        subject: { not: null },
        body: { not: null },
      },
      include: {
        podcast: true,
        contact: true,
        angle: true,
      },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    });

    return NextResponse.json(drafts);
  } catch (error) {
    console.error("Error fetching drafts:", error);
    return NextResponse.json(
      { error: "Failed to fetch drafts" },
      { status: 500 }
    );
  }
}

// PATCH /api/draft - Update a draft
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { outreachId, ...data } = updateDraftSchema.parse(body);

    const outreach = await db.outreach.update({
      where: { id: outreachId },
      data,
      include: {
        podcast: true,
        contact: true,
        angle: true,
      },
    });

    return NextResponse.json(outreach);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Error updating draft:", error);
    return NextResponse.json(
      { error: "Failed to update draft" },
      { status: 500 }
    );
  }
}

// POST /api/draft - Create a manual draft
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { podcastId, contactId, subject, body: emailBody } = body;

    // Find or create outreach
    let outreach = await db.outreach.findFirst({
      where: {
        podcastId,
        status: { in: ["discovered", "researched"] },
      },
    });

    if (outreach) {
      outreach = await db.outreach.update({
        where: { id: outreach.id },
        data: {
          contactId,
          subject,
          body: emailBody,
          status: "drafted",
        },
        include: {
          podcast: true,
          contact: true,
        },
      });
    } else {
      outreach = await db.outreach.create({
        data: {
          podcastId,
          contactId,
          subject,
          body: emailBody,
          status: "drafted",
        },
        include: {
          podcast: true,
          contact: true,
        },
      });
    }

    return NextResponse.json(outreach, { status: 201 });
  } catch (error) {
    console.error("Error creating draft:", error);
    return NextResponse.json(
      { error: "Failed to create draft" },
      { status: 500 }
    );
  }
}
