import { NextRequest, NextResponse } from "next/server";

// Debug endpoint to diagnose Gmail OAuth configuration issues
export async function GET(request: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  // Get the actual request URL to see what domain we're on
  const requestUrl = request.url;
  const actualOrigin = new URL(requestUrl).origin;

  // Calculate what the redirect URI should be
  const expectedRedirectUri = redirectUri || `${appUrl}/api/auth/gmail/callback`;
  const actualRedirectUri = `${actualOrigin}/api/auth/gmail/callback`;

  const issues: string[] = [];

  // Check for common issues
  if (!clientId) {
    issues.push("GOOGLE_CLIENT_ID is not set");
  } else if (!clientId.includes(".apps.googleusercontent.com")) {
    issues.push("GOOGLE_CLIENT_ID doesn't look like a valid Google client ID");
  }

  if (!clientSecret) {
    issues.push("GOOGLE_CLIENT_SECRET is not set");
  }

  if (!redirectUri && !appUrl) {
    issues.push("Neither GOOGLE_REDIRECT_URI nor NEXT_PUBLIC_APP_URL is set");
  }

  // Check for redirect URI mismatch
  const redirectUriMismatch = expectedRedirectUri !== actualRedirectUri;
  if (redirectUriMismatch) {
    issues.push(`REDIRECT URI MISMATCH: Your app is running at ${actualOrigin} but redirect URI is configured as ${expectedRedirectUri}`);
  }

  // Check for http vs https mismatch
  if (expectedRedirectUri.startsWith("http://") && !expectedRedirectUri.includes("localhost")) {
    issues.push("Redirect URI uses http:// but is not localhost - Google may block this. Use https:// for deployed apps.");
  }

  return NextResponse.json({
    status: issues.length === 0 ? "OK" : "ISSUES_FOUND",
    issues,
    configuration: {
      clientIdConfigured: !!clientId,
      clientIdPreview: clientId ? `${clientId.substring(0, 20)}...` : null,
      clientSecretConfigured: !!clientSecret,
      configuredRedirectUri: expectedRedirectUri,
      actualAppOrigin: actualOrigin,
      actualRedirectUri: actualRedirectUri,
      redirectUriMismatch,
    },
    googleCloudConsoleChecklist: [
      "1. Go to https://console.cloud.google.com/apis/credentials",
      "2. Click on your OAuth 2.0 Client ID",
      `3. Under 'Authorized redirect URIs', add EXACTLY: ${actualRedirectUri}`,
      "4. Go to 'OAuth consent screen' in the left menu",
      "5. Scroll down to 'Test users' and click 'ADD USERS'",
      "6. Add YOUR Gmail email address (the one you're trying to sign in with)",
      "7. Save and try connecting again",
    ],
    commonErrors: {
      "Error 400: invalid_request": "Usually means redirect URI mismatch OR you're not added as a test user",
      "Access blocked": "App is in testing mode and your email is not in the test users list",
      "redirect_uri_mismatch": "The redirect URI in your .env doesn't match what's in Google Cloud Console",
    },
  });
}
