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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { responseType } = await request.json();

    if (!responseType) {
      return NextResponse.json({ error: "Response type required" }, { status: 400 });
    }

    if (!isPrismaAvailable()) {
      return NextResponse.json({
        success: true,
        message: "Response updated (demo mode)",
      });
    }

    const updateData = mapResponseToDbFields(responseType);

    await prisma.podcast.update({
      where: { id },
      data: {
        ...updateData,
        replyReceivedAt: responseType !== "no_response" ? new Date() : undefined,
      },
    });

    // Create a note about the response
    await prisma.note.create({
      data: {
        podcastId: id,
        content: `Response status changed to: ${responseType}`,
        author: "system",
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating response:", error);
    return NextResponse.json({ error: "Failed to update response" }, { status: 500 });
  }
}
