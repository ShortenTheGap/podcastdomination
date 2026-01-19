import { NextRequest, NextResponse } from "next/server";

// In-memory storage for user-provided API keys (use database in production)
interface IntegrationConfig {
  connected: boolean;
  apiKey?: string;
  config: Record<string, string>;
}

// This is exported so other routes can access saved API keys
export const integrationSettings: Record<string, IntegrationConfig> = {
  gmail: { connected: false, config: {} },
  anthropic: { connected: false, config: {} },
  openai: { connected: false, config: {} },
  spotify: { connected: false, config: {} },
  podcastindex: { connected: false, config: {} },
  listennotes: { connected: false, config: {} },
};

// Helper to get an API key (checks user-provided first, then env var)
export function getApiKey(integration: string): string | null {
  // Check user-provided key first
  if (integrationSettings[integration]?.apiKey) {
    return integrationSettings[integration].apiKey!;
  }

  // Fall back to environment variables
  switch (integration) {
    case "anthropic":
      return process.env.ANTHROPIC_API_KEY || null;
    case "openai":
      return process.env.OPENAI_API_KEY || null;
    case "listennotes":
      return process.env.LISTEN_NOTES_API_KEY || null;
    default:
      return null;
  }
}

export async function GET() {
  // Check both environment variables and user-provided keys
  const status = {
    gmail: {
      connected: !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET,
      hasOAuthToken: integrationSettings.gmail.connected,
      configured: !!process.env.GOOGLE_CLIENT_ID,
    },
    anthropic: {
      connected: !!getApiKey("anthropic"),
      configured: !!process.env.ANTHROPIC_API_KEY || integrationSettings.anthropic.connected,
      masked: getApiKey("anthropic")
        ? `sk-ant-...${getApiKey("anthropic")!.slice(-4)}`
        : null,
    },
    openai: {
      connected: !!getApiKey("openai"),
      configured: !!process.env.OPENAI_API_KEY || integrationSettings.openai.connected,
      masked: getApiKey("openai")
        ? `sk-...${getApiKey("openai")!.slice(-4)}`
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
      connected: !!getApiKey("listennotes"),
      configured: !!process.env.LISTEN_NOTES_API_KEY || integrationSettings.listennotes.connected,
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

    if (!integration) {
      return NextResponse.json({ error: "Integration name required" }, { status: 400 });
    }

    if (action === "save_key") {
      const apiKey = config?.apiKey;
      if (!apiKey) {
        return NextResponse.json({ error: "API key required" }, { status: 400 });
      }

      // Store the API key
      integrationSettings[integration] = {
        connected: true,
        apiKey: apiKey,
        config: config || {},
      };

      return NextResponse.json({
        success: true,
        message: `${integration} API key saved successfully`,
      });
    }

    if (action === "disconnect") {
      integrationSettings[integration] = {
        connected: false,
        apiKey: undefined,
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
