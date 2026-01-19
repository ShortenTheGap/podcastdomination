import { NextRequest, NextResponse } from "next/server";

// In-memory storage for demo (use database in production)
let integrationSettings: Record<string, { connected: boolean; config: Record<string, string> }> = {
  gmail: { connected: false, config: {} },
  anthropic: { connected: false, config: {} },
  spotify: { connected: false, config: {} },
  podcastindex: { connected: false, config: {} },
  listennotes: { connected: false, config: {} },
};

export async function GET() {
  // Check environment variables for pre-configured integrations
  const status = {
    gmail: {
      connected: !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET,
      hasOAuthToken: integrationSettings.gmail.connected,
      configured: !!process.env.GOOGLE_CLIENT_ID,
    },
    anthropic: {
      connected: !!process.env.ANTHROPIC_API_KEY || integrationSettings.anthropic.connected,
      configured: !!process.env.ANTHROPIC_API_KEY,
      masked: process.env.ANTHROPIC_API_KEY
        ? `sk-ant-...${process.env.ANTHROPIC_API_KEY.slice(-4)}`
        : null,
    },
    openai: {
      connected: !!process.env.OPENAI_API_KEY,
      configured: !!process.env.OPENAI_API_KEY,
      masked: process.env.OPENAI_API_KEY
        ? `sk-...${process.env.OPENAI_API_KEY.slice(-4)}`
        : null,
    },
    spotify: {
      connected: !!process.env.SPOTIFY_CLIENT_ID && !!process.env.SPOTIFY_CLIENT_SECRET,
      configured: !!process.env.SPOTIFY_CLIENT_ID,
    },
    podcastindex: {
      connected: !!process.env.PODCAST_INDEX_API_KEY && !!process.env.PODCAST_INDEX_API_SECRET,
      configured: !!process.env.PODCAST_INDEX_API_KEY,
    },
    listennotes: {
      connected: !!process.env.LISTEN_NOTES_API_KEY,
      configured: !!process.env.LISTEN_NOTES_API_KEY,
    },
    apple: {
      connected: true, // Apple Podcasts/iTunes API is public
      configured: true,
    },
  };

  return NextResponse.json({ integrations: status });
}

export async function POST(request: NextRequest) {
  try {
    const { integration, action, config } = await request.json();

    if (action === "save_key") {
      integrationSettings[integration] = {
        connected: true,
        config: config || {},
      };
      return NextResponse.json({ success: true, message: `${integration} configuration saved` });
    }

    if (action === "disconnect") {
      integrationSettings[integration] = {
        connected: false,
        config: {},
      };
      return NextResponse.json({ success: true, message: `${integration} disconnected` });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Integration error:", error);
    return NextResponse.json({ error: "Failed to update integration" }, { status: 500 });
  }
}
