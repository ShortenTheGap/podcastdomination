import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const state = searchParams.get("state");

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  // Handle OAuth error
  if (error) {
    return NextResponse.redirect(
      `${baseUrl}/settings?tab=integrations&error=${encodeURIComponent(error)}`
    );
  }

  // Validate state
  if (state !== "gmail_connect") {
    return NextResponse.redirect(
      `${baseUrl}/settings?tab=integrations&error=invalid_state`
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${baseUrl}/settings?tab=integrations&error=no_code`
    );
  }

  // Return HTML that sends the code to the parent window
  return new NextResponse(
    `<!DOCTYPE html>
    <html>
      <head>
        <title>Gmail Authorization</title>
        <style>
          body {
            font-family: system-ui, -apple-system, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: #f5f5f5;
          }
          .container {
            text-align: center;
            padding: 2rem;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          .spinner {
            border: 3px solid #e5e5e5;
            border-top-color: #3b82f6;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 0 auto 1rem;
          }
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="spinner"></div>
          <p>Completing authorization...</p>
        </div>
        <script>
          const code = "${code}";

          // Send code to parent window
          if (window.opener) {
            window.opener.postMessage({ type: 'gmail_oauth_callback', code }, '*');
            setTimeout(() => window.close(), 1000);
          } else {
            // If no opener, redirect back to settings with the code
            window.location.href = '${baseUrl}/settings?tab=integrations&gmail_code=' + code;
          }
        </script>
      </body>
    </html>`,
    {
      headers: { "Content-Type": "text/html" },
    }
  );
}
