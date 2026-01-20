import { NextRequest, NextResponse } from "next/server";
import { prisma, isPrismaAvailable } from "@/lib/db";

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
      return { status: "DRAFTED" as const };
    case "sent_awaiting":
      return { status: "CONTACTED" as const };
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
    const { responseType, stage } = await request.json();

    if (!responseType && !stage) {
      return NextResponse.json({ error: "Response type or stage required" }, { status: 400 });
    }

    if (!isPrismaAvailable()) {
      return NextResponse.json({
        success: true,
        message: "Updated (demo mode)",
        stage: stage,
        responseType: responseType,
      });
    }

    let updateData = {};
    let noteContent = "";

    if (stage) {
      updateData = mapStageToDbStatus(stage);
      noteContent = `Stage changed to: ${stage}`;
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
