import { google } from "googleapis";

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Set credentials if we have tokens
if (process.env.GOOGLE_ACCESS_TOKEN) {
  oauth2Client.setCredentials({
    access_token: process.env.GOOGLE_ACCESS_TOKEN,
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  });
}

const gmail = google.gmail({ version: "v1", auth: oauth2Client });

export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
  threadId?: string;
}

// Generate OAuth URL for authentication
export function getAuthUrl(): string {
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: [
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.modify",
    ],
  });
}

// Exchange auth code for tokens
export async function getTokensFromCode(code: string) {
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  return tokens;
}

// Send an email
export async function sendEmail(message: EmailMessage): Promise<{
  messageId: string;
  threadId: string;
}> {
  const raw = createRawEmail(message);

  const response = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw,
      threadId: message.threadId,
    },
  });

  return {
    messageId: response.data.id || "",
    threadId: response.data.threadId || "",
  };
}

// Create base64 encoded email
function createRawEmail(message: EmailMessage): string {
  const emailLines = [
    `To: ${message.to}`,
    `Subject: ${message.subject}`,
    "Content-Type: text/html; charset=utf-8",
    "MIME-Version: 1.0",
    "",
    message.body,
  ];

  const email = emailLines.join("\r\n");
  return Buffer.from(email)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Get thread messages
export async function getThread(threadId: string) {
  const response = await gmail.users.threads.get({
    userId: "me",
    id: threadId,
  });
  return response.data;
}

// Check for replies in a thread
export async function checkForReplies(threadId: string): Promise<boolean> {
  const thread = await getThread(threadId);
  return (thread.messages?.length || 0) > 1;
}

// Watch for new messages (webhook setup)
export async function setupWatch(topicName: string) {
  const response = await gmail.users.watch({
    userId: "me",
    requestBody: {
      topicName,
      labelIds: ["INBOX"],
    },
  });
  return response.data;
}

// Get message details
export async function getMessage(messageId: string) {
  const response = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });
  return response.data;
}

export { oauth2Client, gmail };
