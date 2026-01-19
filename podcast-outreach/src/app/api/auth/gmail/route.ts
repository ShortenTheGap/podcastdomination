import { NextRequest, NextResponse } from "next/server";

const GOOGLE_OAUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
].join(" ");

// In-memory token storage (use database in production)
let gmailTokens: {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  email: string;
} | null = null;

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const action = searchParams.get("action");

  // Check current connection status
  if (action === "status") {
    if (gmailTokens && gmailTokens.expiresAt > Date.now()) {
      return NextResponse.json({
        connected: true,
        email: gmailTokens.email,
        expiresAt: gmailTokens.expiresAt,
      });
    }
    return NextResponse.json({ connected: false });
  }

  // Generate OAuth URL
  if (action === "connect") {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/gmail/callback`;

    if (!clientId) {
      return NextResponse.json(
        { error: "Google OAuth not configured" },
        { status: 500 }
      );
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: SCOPES,
      access_type: "offline",
      prompt: "consent",
      state: "gmail_connect",
    });

    const authUrl = `${GOOGLE_OAUTH_URL}?${params.toString()}`;
    return NextResponse.json({ authUrl });
  }

  // Disconnect
  if (action === "disconnect") {
    gmailTokens = null;
    return NextResponse.json({ success: true, message: "Gmail disconnected" });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

export async function POST(request: NextRequest) {
  try {
    const { code } = await request.json();

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/gmail/callback`;

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { error: "Google OAuth not configured" },
        { status: 500 }
      );
    }

    // Exchange code for tokens
    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.json();
      return NextResponse.json(
        { error: error.error_description || "Failed to exchange code" },
        { status: 400 }
      );
    }

    const tokens = await tokenResponse.json();

    // Get user email
    const userResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    const userInfo = await userResponse.json();

    // Store tokens
    gmailTokens = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + tokens.expires_in * 1000,
      email: userInfo.email,
    };

    return NextResponse.json({
      success: true,
      email: userInfo.email,
      message: "Gmail connected successfully",
    });
  } catch (error) {
    console.error("Gmail auth error:", error);
    return NextResponse.json(
      { error: "Authentication failed" },
      { status: 500 }
    );
  }
}

// Helper to get current access token (for use by other APIs)
export function getGmailAccessToken(): string | null {
  if (!gmailTokens) return null;
  if (gmailTokens.expiresAt < Date.now()) return null;
  return gmailTokens.accessToken;
}
