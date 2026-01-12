import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
];

export class GmailClient {
  private oauth2Client: OAuth2Client;
  private gmail: ReturnType<typeof google.gmail>;

  constructor(credentials: { access_token: string; refresh_token: string }) {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    this.oauth2Client.setCredentials(credentials);
    this.gmail = google.gmail({ version: "v1", auth: this.oauth2Client });
  }

  async sendEmail({
    to,
    subject,
    body,
    replyTo,
  }: {
    to: string;
    subject: string;
    body: string;
    replyTo?: string;
  }): Promise<{ id: string; threadId: string }> {
    // Construct email in RFC 2822 format
    const emailLines = [
      `To: ${to}`,
      `Subject: ${subject}`,
      "Content-Type: text/plain; charset=utf-8",
      "MIME-Version: 1.0",
    ];

    if (replyTo) {
      emailLines.push(`In-Reply-To: ${replyTo}`);
      emailLines.push(`References: ${replyTo}`);
    }

    emailLines.push(""); // Empty line before body
    emailLines.push(body);

    const email = emailLines.join("\r\n");
    const encodedEmail = Buffer.from(email)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const response = await this.gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: encodedEmail,
      },
    });

    return {
      id: response.data.id!,
      threadId: response.data.threadId!,
    };
  }

  async checkForReplies(
    threadId: string
  ): Promise<{ hasReply: boolean; replyText?: string }> {
    const thread = await this.gmail.users.threads.get({
      userId: "me",
      id: threadId,
    });

    const messages = thread.data.messages || [];

    // Check if there are responses after our sent message
    if (messages.length > 1) {
      const lastMessage = messages[messages.length - 1];
      const headers = lastMessage.payload?.headers || [];
      const fromHeader = headers.find((h) => h.name?.toLowerCase() === "from");

      // If the last message isn't from us, it's a reply
      // This is a simplified check - in production, compare to Joey's email
      const isFromUs =
        fromHeader?.value?.includes("joey") ||
        fromHeader?.value?.includes("fit4life");

      if (!isFromUs) {
        // Extract reply text
        let replyText = "";
        if (lastMessage.payload?.body?.data) {
          replyText = Buffer.from(
            lastMessage.payload.body.data,
            "base64"
          ).toString();
        }

        return { hasReply: true, replyText };
      }
    }

    return { hasReply: false };
  }

  async getBounceStatus(
    messageId: string
  ): Promise<{ bounced: boolean; reason?: string }> {
    try {
      const message = await this.gmail.users.messages.get({
        userId: "me",
        id: messageId,
        format: "metadata",
        metadataHeaders: ["X-Failed-Recipients", "X-Delivery-Status"],
      });

      const headers = message.data.payload?.headers || [];
      const failedRecipients = headers.find(
        (h) => h.name === "X-Failed-Recipients"
      );

      if (failedRecipients) {
        return { bounced: true, reason: failedRecipients.value ?? undefined };
      }

      return { bounced: false };
    } catch {
      return { bounced: false };
    }
  }

  async getThread(threadId: string) {
    const response = await this.gmail.users.threads.get({
      userId: "me",
      id: threadId,
    });
    return response.data;
  }

  async getMessage(messageId: string) {
    const response = await this.gmail.users.messages.get({
      userId: "me",
      id: messageId,
      format: "full",
    });
    return response.data;
  }
}

// OAuth flow helpers
export function getAuthUrl(): string {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });
}

export async function getTokensFromCode(
  code: string
): Promise<{ access_token: string; refresh_token: string }> {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  const { tokens } = await oauth2Client.getToken(code);

  return {
    access_token: tokens.access_token!,
    refresh_token: tokens.refresh_token!,
  };
}
