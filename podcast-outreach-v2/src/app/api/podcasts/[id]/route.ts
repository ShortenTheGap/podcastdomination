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
    "NOT_CONTACTED", "READY", "SKIPPED", "READY_TO_DRAFT", "DRAFTED", "QA_APPROVED",
    "SENT", "FOLLOW_UP_DUE", "FOLLOW_UP_SENT", "ESCALATION_DUE",
    "ESCALATED", "REPLIED", "CLOSED"
  ]).optional(),
  outcome: z.enum([
    "OPEN", "BOOKED", "DECLINED", "NO_RESPONSE", "SUPPRESSED", "BOUNCED", "OPT_OUT"
  ]).optional(),
  stopRule: z.enum([
    "NONE", "POLITICS", "EXPLICIT", "PAID_GUEST", "FRAUD_PSEUDOSCIENCE",
    "NO_GUESTS", "TIER_3_INSUFFICIENT", "NO_CONTACT_ROUTE", "BOUNCE", "OPT_OUT", "SPAM_COMPLAINT"
  ]).optional(),
  suppressed: z.boolean().optional(),
  primaryEmail: z.string().email().optional().nullable(),
  hostName: z.string().optional().nullable(),
  tier2Anchor: z.string().optional().nullable(),
  tier2EvidenceUrl: z.string().optional().nullable(),
  tier1AddOnLine: z.string().optional().nullable(),
  selectedAngle: z.enum([
    "FAT_LOSS", "GENERAL_HEALTH", "LONGEVITY", "DADS_PARENTING",
    "CEO_PERFORMANCE", "PERSONAL_DEVELOPMENT", "EVIDENCE_BASED_NUTRITION", "BODY_RECOMPOSITION"
  ]).optional().nullable(),
  emailDraft: z.string().optional().nullable(),
  emailSubject: z.string().optional().nullable(),
  nextAction: z.enum(["DRAFT", "QA", "SEND", "FOLLOW_UP", "ESCALATE", "CLOSE", "NONE"]).optional().nullable(),
  qaStatus: z.enum(["NOT_READY", "PENDING_REVIEW", "PASS", "NEEDS_REVISION"]).optional(),
}).passthrough();

// Workflow action types for explicit state transitions
type WorkflowAction =
  | "APPROVE_TIER_2"   // Approve as Tier 2 → READY_TO_DRAFT
  | "SKIP_TIER_3"      // Skip as Tier 3 → suppressed
  | "GENERATE_DRAFT"   // Generate draft → DRAFTED
  | "APPROVE_QA"       // Approve QA → QA_APPROVED
  | "SEND_EMAIL"       // Send email → SENT
  | "MARK_REPLIED";    // Mark as replied → REPLIED

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Check for workflow action
    const workflowAction = body.workflowAction as WorkflowAction | undefined;
    delete body.workflowAction; // Remove from update data

    const validatedData = UpdateSchema.parse(body);

    // Apply workflow transitions based on action
    const updateData: any = { ...validatedData };

    if (workflowAction) {
      switch (workflowAction) {
        case "APPROVE_TIER_2":
          updateData.tier = body.tier || "TIER_2";
          updateData.status = "READY_TO_DRAFT";
          updateData.nextAction = "DRAFT";
          updateData.isNew = false;
          break;

        case "SKIP_TIER_3":
          updateData.tier = "TIER_3";
          updateData.suppressed = true;
          updateData.suppressedAt = new Date();
          updateData.stopRule = body.stopRule || "TIER_3_INSUFFICIENT";
          updateData.outcome = "SUPPRESSED";
          updateData.status = "CLOSED";
          updateData.nextAction = "NONE";
          updateData.isNew = false;
          break;

        case "GENERATE_DRAFT":
          updateData.status = "DRAFTED";
          updateData.nextAction = "QA";
          updateData.qaStatus = "PENDING_REVIEW";
          break;

        case "APPROVE_QA":
          updateData.status = "QA_APPROVED";
          updateData.nextAction = "SEND";
          updateData.qaStatus = "PASS";
          updateData.qaApprovedAt = new Date();
          break;

        case "SEND_EMAIL":
          updateData.status = "SENT";
          updateData.sentPrimaryAt = new Date();
          updateData.nextAction = "NONE";
          // Set follow-up due date (7 days from now)
          const followUpDate = new Date();
          followUpDate.setDate(followUpDate.getDate() + 7);
          updateData.nextActionDate = followUpDate;
          break;

        case "MARK_REPLIED":
          updateData.status = "REPLIED";
          updateData.replyReceivedAt = new Date();
          updateData.nextAction = "CLOSE";
          break;
      }
    }

    // Handle tier changes without explicit workflow action (for compatibility)
    if (validatedData.tier && !workflowAction) {
      if (validatedData.tier === "TIER_2" || validatedData.tier === "TIER_1") {
        // If changing to Tier 1 or 2, suggest transitioning to READY_TO_DRAFT
        // But don't force it - let the caller decide
      } else if (validatedData.tier === "TIER_3") {
        // If changing to Tier 3, suggest suppression
        // But don't force it - let the caller decide
      }
    }

    const podcast = await db.podcast.update({
      where: { id },
      data: updateData,
      include: {
        touches: true,
        notes: true,
      },
    });

    return NextResponse.json(podcast);
  } catch (error) {
    console.error("Error updating podcast:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid data", details: error.issues },
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
