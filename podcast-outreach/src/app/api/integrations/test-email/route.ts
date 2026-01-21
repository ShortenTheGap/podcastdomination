import { NextRequest, NextResponse } from "next/server";
import { GmailClient } from "@/lib/gmail";
import { getGmailTokens } from "@/app/api/auth/gmail/route";
import { db } from "@/lib/db";

const GMAIL_TOKENS_KEY = "gmail_tokens";

// Get the connected Gmail email address
async function getConnectedEmail(): Promise<string | null> {
  try {
    const record = await db.keyValueStore.findUnique({
      where: { key: GMAIL_TOKENS_KEY },
    });
    if (record) {
      const tokens = JSON.parse(record.value);
      return tokens.email || null;
    }
    return null;
  } catch {
    return null;
  }
}

// Create Gmail client from stored OAuth tokens
async function getGmailClient(): Promise<GmailClient> {
  const tokens = await getGmailTokens();
  if (!tokens) {
    throw new Error("Gmail not connected. Please connect Gmail in Settings first.");
  }
  return new GmailClient({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
  });
}

export async function POST(request: NextRequest) {
  try {
    // Get the connected email address
    const connectedEmail = await getConnectedEmail();
    if (!connectedEmail) {
      return NextResponse.json({
        success: false,
        message: "Gmail not connected. Please connect Gmail first.",
      }, { status: 400 });
    }

    // Get Gmail client
    const gmail = await getGmailClient();

    // Send test email to the connected email address
    const testSubject = `Test Email from Podcast Outreach - ${new Date().toLocaleString()}`;
    const testBody = `This is a test email sent from your Podcast Outreach application.

If you received this email, your Gmail integration is working correctly!

Sent at: ${new Date().toISOString()}

---
This is an automated test message.`;

    const result = await gmail.sendEmail({
      to: connectedEmail,
      subject: testSubject,
      body: testBody,
    });

    return NextResponse.json({
      success: true,
      message: `Test email sent successfully to ${connectedEmail}`,
      details: {
        messageId: result.id,
        threadId: result.threadId,
        sentTo: connectedEmail,
      },
    });
  } catch (error) {
    console.error("Test email error:", error);
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : "Failed to send test email",
    }, { status: 500 });
  }
}
