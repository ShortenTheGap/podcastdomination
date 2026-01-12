import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/workflow/metrics - Get weekly workflow metrics
export async function GET() {
  try {
    // Get start of current week (Monday)
    const now = new Date();
    const dayOfWeek = now.getDay();
    const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Adjust for Monday start
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - diff);
    weekStart.setHours(0, 0, 0, 0);

    // New shows added this week
    const newShowsAdded = await db.podcast.count({
      where: {
        createdAt: { gte: weekStart },
      },
    });

    // Emails sent this week
    const emailsSentThisWeek = await db.touch.count({
      where: {
        sentAt: { gte: weekStart },
      },
    });

    // Total sent for reply rate calculation
    const totalSent = await db.podcast.count({
      where: {
        sentPrimaryAt: { not: null },
      },
    });

    // Total replies
    const totalReplies = await db.podcast.count({
      where: {
        replyReceivedAt: { not: null },
      },
    });

    // Reply rate
    const replyRate = totalSent > 0 ? totalReplies / totalSent : 0;

    // Bookings this week
    const bookings = await db.podcast.count({
      where: {
        outcome: "BOOKED",
        updatedAt: { gte: weekStart },
      },
    });

    // Stop rules triggered this week
    const stopRulesTriggered = await db.podcast.count({
      where: {
        suppressedAt: { gte: weekStart },
        stopRule: { not: "NONE" },
      },
    });

    // Pending QA
    const pendingQA = await db.podcast.count({
      where: {
        status: "DRAFTED",
        qaStatus: { in: ["NOT_READY", "PENDING_REVIEW"] },
      },
    });

    // Follow-ups due
    const followUpsDue = await db.podcast.count({
      where: {
        status: "FOLLOW_UP_DUE",
      },
    });

    // Pending replies (replied but not processed)
    const pendingReplies = await db.podcast.count({
      where: {
        status: "REPLIED",
        outcome: "OPEN",
      },
    });

    return NextResponse.json({
      newShowsAdded,
      emailsSent: emailsSentThisWeek,
      replyRate,
      bookings,
      stopRulesTriggered,
      pendingQA,
      followUpsDue,
      pendingReplies,
      // Additional context
      weekStart: weekStart.toISOString(),
      totalInPipeline: await db.podcast.count({
        where: { outcome: "OPEN", suppressed: false },
      }),
    });
  } catch (error) {
    console.error("Failed to fetch workflow metrics:", error);
    return NextResponse.json(
      { error: "Failed to fetch metrics" },
      { status: 500 }
    );
  }
}
