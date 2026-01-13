import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { z } from "zod";

/**
 * GET /api/podcasts/[id] - Get a single podcast
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const podcast = await db.podcast.findUnique({
      where: { id },
      include: {
        touches: true,
        notes: true,
      },
    });

    if (!podcast) {
      return NextResponse.json({ error: "Podcast not found" }, { status: 404 });
    }

    return NextResponse.json(podcast);
  } catch (error) {
    console.error("Error fetching podcast:", error);
    return NextResponse.json(
      { error: "Failed to fetch podcast" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/podcasts/[id] - Update a podcast
 */
const UpdateSchema = z.object({
  tier: z.enum(["PENDING", "TIER_1", "TIER_2", "TIER_3"]).optional(),
  status: z.enum([
    "NOT_CONTACTED", "READY_TO_DRAFT", "DRAFTED", "QA_APPROVED",
    "SENT", "FOLLOW_UP_DUE", "FOLLOW_UP_SENT", "ESCALATION_DUE",
    "ESCALATED", "REPLIED", "CLOSED"
  ]).optional(),
  outcome: z.enum([
    "OPEN", "BOOKED", "DECLINED", "NO_RESPONSE", "SUPPRESSED", "BOUNCED", "OPT_OUT"
  ]).optional(),
  primaryEmail: z.string().email().optional().nullable(),
  hostName: z.string().optional().nullable(),
  tier2Anchor: z.string().optional().nullable(),
  tier1AddOnLine: z.string().optional().nullable(),
  emailDraft: z.string().optional().nullable(),
  emailSubject: z.string().optional().nullable(),
  nextAction: z.enum(["DRAFT", "QA", "SEND", "FOLLOW_UP", "ESCALATE", "CLOSE", "NONE"]).optional().nullable(),
}).passthrough();

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const validatedData = UpdateSchema.parse(body);

    const podcast = await db.podcast.update({
      where: { id },
      data: validatedData,
    });

    return NextResponse.json(podcast);
  } catch (error) {
    console.error("Error updating podcast:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid data", details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to update podcast" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/podcasts/[id] - Delete a podcast
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await db.podcast.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: "Podcast deleted" });
  } catch (error) {
    console.error("Error deleting podcast:", error);
    return NextResponse.json(
      { error: "Failed to delete podcast" },
      { status: 500 }
    );
  }
}
