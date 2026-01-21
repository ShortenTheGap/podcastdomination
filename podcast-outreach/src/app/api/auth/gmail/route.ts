import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const GOOGLE_OAUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
].join(" ");

const GMAIL_TOKENS_KEY = "gmail_tokens";

// Token storage interface
interface GmailTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  email: string;
}

// Database token storage functions
async function getStoredTokens(): Promise<GmailTokens | null> {
  try {
    const record = await db.keyValueStore.findUnique({
      where: { key: GMAIL_TOKENS_KEY },
    });
    if (record) {
      return JSON.parse(record.value) as GmailTokens;
    }
    return null;
  } catch {
    return null;
  }
}

async function storeTokens(tokens: GmailTokens): Promise<void> {
  await db.keyValueStore.upsert({
    where: { key: GMAIL_TOKENS_KEY },
    update: { value: JSON.stringify(tokens) },
    create: { key: GMAIL_TOKENS_KEY, value: JSON.stringify(tokens) },
  });
}

async function clearTokens(): Promise<void> {
  await db.keyValueStore.delete({
    where: { key: GMAIL_TOKENS_KEY },
  }).catch(() => {
    // Ignore if doesn't exist
  });
}

// Refresh access token using refresh token
async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number } | null> {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return null;
    }

    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const action = searchParams.get("action");

  // Check current connection status
  if (action === "status") {
    const gmailTokens = await getStoredTokens();
    if (gmailTokens) {
      // Check if token is expired and try to refresh
      if (gmailTokens.expiresAt < Date.now()) {
        const refreshed = await refreshAccessToken(gmailTokens.refreshToken);
        if (refreshed) {
          const updatedTokens: GmailTokens = {
            ...gmailTokens,
            accessToken: refreshed.access_token,
            expiresAt: Date.now() + refreshed.expires_in * 1000,
          };
          await storeTokens(updatedTokens);
          return NextResponse.json({
            connected: true,
            email: updatedTokens.email,
            expiresAt: updatedTokens.expiresAt,
          });
        } else {
          // Refresh failed, token is invalid
          await clearTokens();
          return NextResponse.json({ connected: false });
        }
      }
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
    const configuredRedirectUri = process.env.GOOGLE_REDIRECT_URI;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;

    // Determine the redirect URI
    const redirectUri = configuredRedirectUri || `${appUrl}/api/auth/gmail/callback`;

    if (!clientId) {
      return NextResponse.json(
        { error: "Google OAuth not configured. Set GOOGLE_CLIENT_ID in environment variables." },
        { status: 500 }
      );
    }

    // Get the actual origin of this request to detect mismatches
    const requestOrigin = request.headers.get("origin") || request.headers.get("referer")?.split("/").slice(0, 3).join("/");
    const expectedCallbackUrl = requestOrigin ? `${requestOrigin}/api/auth/gmail/callback` : null;

    // Warn about potential redirect URI mismatch
    if (expectedCallbackUrl && redirectUri !== expectedCallbackUrl) {
      console.warn(`[Gmail OAuth] REDIRECT URI MISMATCH DETECTED!`);
      console.warn(`  Configured: ${redirectUri}`);
      console.warn(`  Expected:   ${expectedCallbackUrl}`);
      console.warn(`  This will cause "Error 400: invalid_request" from Google.`);
      console.warn(`  Fix: Update GOOGLE_REDIRECT_URI and NEXT_PUBLIC_APP_URL in your environment variables.`);
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

    // Return debug info along with auth URL
    return NextResponse.json({
      authUrl,
      debug: {
        redirectUri,
        requestOrigin,
        potentialMismatch: expectedCallbackUrl && redirectUri !== expectedCallbackUrl,
        hint: expectedCallbackUrl && redirectUri !== expectedCallbackUrl
          ? `Your redirect URI (${redirectUri}) doesn't match your app URL (${requestOrigin}). Update GOOGLE_REDIRECT_URI in Railway environment variables.`
          : null,
      }
    });
  }

  // Disconnect
  if (action === "disconnect") {
    await clearTokens();
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

    // Store tokens in database
    const gmailTokens: GmailTokens = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + tokens.expires_in * 1000,
      email: userInfo.email,
    };
    await storeTokens(gmailTokens);

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

// Helper to get current tokens (for use by other APIs)
export async function getGmailTokens(): Promise<{ accessToken: string; refreshToken: string } | null> {
  const tokens = await getStoredTokens();
  if (!tokens) return null;

  // Check if token is expired and try to refresh
  if (tokens.expiresAt < Date.now()) {
    const refreshed = await refreshAccessToken(tokens.refreshToken);
    if (refreshed) {
      const updatedTokens: GmailTokens = {
        ...tokens,
        accessToken: refreshed.access_token,
        expiresAt: Date.now() + refreshed.expires_in * 1000,
      };
      await storeTokens(updatedTokens);
      return {
        accessToken: updatedTokens.accessToken,
        refreshToken: updatedTokens.refreshToken,
      };
    }
    return null;
  }

  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  };
}
