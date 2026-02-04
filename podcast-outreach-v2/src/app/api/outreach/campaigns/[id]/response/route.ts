import { NextRequest, NextResponse } from "next/server";
import { prisma, isPrismaAvailable } from "@/lib/db";
import { updateDemoCampaignAsync } from "@/lib/demo-campaigns";

// Map response type to database fields
function mapResponseToDbFields(responseType: string) {
  switch (responseType) {
    case "booked":
      return {
        outcome: "BOOKED" as const,
        replyType: "POSITIVE" as const,
        status: "CLOSED" as const,
      };
    case "not_interested":
      return {
        outcome: "DECLINED" as const,
        replyType: "NEGATIVE" as const,
        status: "CLOSED" as const,
      };
    case "opted_out":
      return {
        outcome: "OPT_OUT" as const,
        replyType: "NEGATIVE" as const,
        status: "CLOSED" as const,
        suppressed: true,
        suppressedAt: new Date(),
      };
    case "interested_not_booked":
      return {
        outcome: "OPEN" as const,
        replyType: "POSITIVE" as const,
        status: "REPLIED" as const,
      };
    case "no_response":
      return {
        outcome: "OPEN" as const,
        replyType: null,
        status: "FOLLOW_UP_DUE" as const,
      };
    default:
      return {};
  }
}

// Map stage to database status
function mapStageToDbStatus(stage: string) {
  switch (stage) {
    case "not_started":
      return { status: "NOT_STARTED" as const };
    case "drafting":
      return { status: "RESEARCHING" as const };
    case "ready_to_send":
      return { status: "SENT" as const };
    case "follow_up_due":
      return { status: "FOLLOW_UP_DUE" as const };
    case "responded":
      return { status: "REPLIED" as const };
    case "booked":
      return { status: "CLOSED" as const, outcome: "BOOKED" as const };
    case "closed":
      return { status: "CLOSED" as const };
    default:
      return {};
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { responseType, stage, clearResponse } = await request.json();

    if (!responseType && !stage && !clearResponse) {
      return NextResponse.json({ error: "Response type or stage required" }, { status: 400 });
    }

    if (!isPrismaAvailable()) {
      // Update file-persisted storage for demo mode
      const updates: { status?: string; responseType?: string | null } = {};
      if (stage) {
        updates.status = stage;
      }
      if (clearResponse) {
        // Clear the response type
        updates.responseType = null;
      } else if (responseType) {
        updates.responseType = responseType;
        // Also update status based on response type
        if (responseType === "booked") {
          updates.status = "booked";
        } else if (responseType === "not_interested" || responseType === "opted_out") {
          updates.status = "closed";
        } else if (responseType === "interested_not_booked") {
          updates.status = "responded";
        }
      }

      // Use async update for file persistence
      await updateDemoCampaignAsync(id, updates);

      return NextResponse.json({
        success: true,
        message: "Updated and persisted to file",
        stage: stage,
        responseType: responseType,
      });
    }

    let updateData = {};
    let noteContent = "";

    if (stage) {
      updateData = mapStageToDbStatus(stage);
      noteContent = `Stage changed to: ${stage}`;
    } else if (clearResponse) {
      updateData = {
        replyType: null,
        outcome: "OPEN",
      };
      noteContent = "Response status cleared";
    } else if (responseType) {
      updateData = {
        ...mapResponseToDbFields(responseType),
        replyReceivedAt: responseType !== "no_response" ? new Date() : undefined,
      };
      noteContent = `Response status changed to: ${responseType}`;
    }

    await prisma.podcast.update({
      where: { id },
      data: updateData,
    });

    // Create a note about the change
    await prisma.note.create({
      data: {
        podcastId: id,
        content: noteContent,
        author: "system",
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating:", error);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}
