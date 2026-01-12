import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getMessage, getThread } from "@/lib/gmail";

// POST /api/webhooks/gmail - Handle Gmail push notifications
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Verify the push notification
    // Gmail sends base64-encoded data
    const data = JSON.parse(
      Buffer.from(body.message.data, "base64").toString()
    );

    const { historyId, emailAddress } = data;

    console.log("Gmail webhook received:", { historyId, emailAddress });

    // Get the new message
    // In production, you'd use the History API to get changes since last historyId
    // For now, we'll check our tracked threads for replies

    const trackedOutreach = await db.outreach.findMany({
      where: {
        gmailThreadId: { not: null },
        status: "sent",
      },
    });

    for (const outreach of trackedOutreach) {
      if (!outreach.gmailThreadId) continue;

      try {
        const thread = await getThread(outreach.gmailThreadId);
        const messageCount = thread.messages?.length || 0;

        // If there's more than one message, we got a reply
        if (messageCount > 1) {
          const latestMessage = thread.messages?.[messageCount - 1];

          // Check if this is a reply (not from us)
          const fromHeader = latestMessage?.payload?.headers?.find(
            (h) => h.name?.toLowerCase() === "from"
          );

          // Simple check - if the from address is different from ours
          if (fromHeader && !fromHeader.value?.includes(emailAddress)) {
            await db.outreach.update({
              where: { id: outreach.id },
              data: {
                status: "replied",
                repliedAt: new Date(),
              },
            });

            console.log(`Reply detected for outreach ${outreach.id}`);
          }
        }
      } catch (error) {
        console.error(`Error checking thread ${outreach.gmailThreadId}:`, error);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Gmail webhook error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}

// Required for Gmail push - acknowledge the subscription
export async function GET() {
  return NextResponse.json({ status: "ok" });
}
