import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { z } from "zod";

const updateDraftSchema = z.object({
  podcastId: z.string(),
  emailSubject: z.string().optional(),
  emailDraft: z.string().optional(),
  status: z.enum([
    "NOT_CONTACTED",
    "READY_TO_DRAFT",
    "DRAFTED",
    "QA_APPROVED",
    "SENT",
    "FOLLOW_UP_DUE",
    "FOLLOW_UP_SENT",
    "ESCALATION_DUE",
    "ESCALATED",
    "REPLIED",
    "CLOSED",
  ]).optional(),
  qaStatus: z.enum(["NOT_READY", "PENDING_REVIEW", "PASS", "NEEDS_REVISION"]).optional(),
});

// GET /api/draft - Get drafts pending review
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "DRAFTED";
    const qaStatus = searchParams.get("qaStatus");

    const where: Record<string, unknown> = {
      status: {
        in: status.split(","),
      },
      emailSubject: { not: null },
      emailDraft: { not: null },
    };

    if (qaStatus) {
      where.qaStatus = { in: qaStatus.split(",") };
    }

    const drafts = await db.podcast.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }],
      select: {
        id: true,
        showName: true,
        hostName: true,
        primaryEmail: true,
        emailSubject: true,
        emailDraft: true,
        selectedAngle: true,
        status: true,
        qaStatus: true,
        qaChecklist: true,
        tier: true,
        tier2Anchor: true,
        tier1AddOnLine: true,
        createdAt: true,
        updatedAt: true,
      },
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
    const { podcastId, ...data } = updateDraftSchema.parse(body);

    const podcast = await db.podcast.update({
      where: { id: podcastId },
      data: {
        ...data,
        // If moving to QA_APPROVED, set qaApprovedAt
        ...(data.status === "QA_APPROVED" && {
          qaApprovedAt: new Date(),
          qaStatus: "PASS",
        }),
      },
      select: {
        id: true,
        showName: true,
        hostName: true,
        primaryEmail: true,
        emailSubject: true,
        emailDraft: true,
        selectedAngle: true,
        status: true,
        qaStatus: true,
        qaChecklist: true,
        tier: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(podcast);
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
    const { podcastId, emailSubject, emailDraft, selectedAngle } = body;

    const podcast = await db.podcast.update({
      where: { id: podcastId },
      data: {
        emailSubject,
        emailDraft,
        selectedAngle,
        status: "DRAFTED",
        qaStatus: "PENDING_REVIEW",
      },
      select: {
        id: true,
        showName: true,
        hostName: true,
        primaryEmail: true,
        emailSubject: true,
        emailDraft: true,
        selectedAngle: true,
        status: true,
        qaStatus: true,
        tier: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(podcast, { status: 201 });
  } catch (error) {
    console.error("Error creating draft:", error);
    return NextResponse.json(
      { error: "Failed to create draft" },
      { status: 500 }
    );
  }
}
