import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

interface TestResult {
  success: boolean;
  message: string;
  details?: Record<string, unknown>;
}

export async function POST(request: NextRequest): Promise<NextResponse<TestResult>> {
  try {
    const { integration, apiKey } = await request.json();

    switch (integration) {
      case "anthropic":
        return NextResponse.json(await testAnthropic(apiKey || process.env.ANTHROPIC_API_KEY));

      case "openai":
        return NextResponse.json(await testOpenAI(apiKey || process.env.OPENAI_API_KEY));

      case "spotify":
        return NextResponse.json(await testSpotify());

      case "podcastindex":
        return NextResponse.json(await testPodcastIndex());

      case "listennotes":
        return NextResponse.json(await testListenNotes(apiKey || process.env.LISTEN_NOTES_API_KEY));

      case "apple":
        return NextResponse.json(await testApplePodcasts());

      case "gmail":
        return NextResponse.json(await testGmail());

      default:
        return NextResponse.json({ success: false, message: "Unknown integration" }, { status: 400 });
    }
  } catch (error) {
    console.error("Test error:", error);
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : "Test failed"
    }, { status: 500 });
  }
}

async function testAnthropic(apiKey?: string): Promise<TestResult> {
  if (!apiKey) {
    return { success: false, message: "No API key configured" };
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-haiku-20240307",
        max_tokens: 10,
        messages: [{ role: "user", content: "Say 'connected'" }],
      }),
    });

    if (response.ok) {
      const data = await response.json();
      return {
        success: true,
        message: "Claude API connected successfully",
        details: { model: "claude-3-haiku-20240307" }
      };
    } else {
      const error = await response.json();
      return {
        success: false,
        message: error.error?.message || "API connection failed"
      };
    }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Connection failed"
    };
  }
}

async function testOpenAI(apiKey?: string): Promise<TestResult> {
  if (!apiKey) {
    return { success: false, message: "No API key configured" };
  }

  try {
    const response = await fetch("https://api.openai.com/v1/models", {
      headers: {
        "Authorization": `Bearer ${apiKey}`,
      },
    });

    if (response.ok) {
      return {
        success: true,
        message: "OpenAI API connected successfully"
      };
    } else {
      const error = await response.json();
      return {
        success: false,
        message: error.error?.message || "API connection failed"
      };
    }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Connection failed"
    };
  }
}

async function testSpotify(): Promise<TestResult> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return { success: false, message: "Spotify credentials not configured" };
  }

  try {
    // Get access token using client credentials flow
    const tokenResponse = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: "grant_type=client_credentials",
    });

    if (tokenResponse.ok) {
      const tokenData = await tokenResponse.json();

      // Test API with a simple search
      const searchResponse = await fetch(
        "https://api.spotify.com/v1/search?q=podcast&type=show&limit=1",
        {
          headers: {
            "Authorization": `Bearer ${tokenData.access_token}`,
          },
        }
      );

      if (searchResponse.ok) {
        return {
          success: true,
          message: "Spotify API connected successfully",
          details: { tokenType: tokenData.token_type, expiresIn: tokenData.expires_in }
        };
      }
    }

    return { success: false, message: "Failed to authenticate with Spotify" };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Connection failed"
    };
  }
}

async function testPodcastIndex(): Promise<TestResult> {
  const apiKey = process.env.PODCAST_INDEX_API_KEY;
  const apiSecret = process.env.PODCAST_INDEX_API_SECRET;

  if (!apiKey || !apiSecret) {
    return { success: false, message: "PodcastIndex credentials not configured" };
  }

  try {
    const apiHeaderTime = Math.floor(Date.now() / 1000);
    const hash = crypto
      .createHash("sha1")
      .update(apiKey + apiSecret + apiHeaderTime)
      .digest("hex");

    const response = await fetch(
      "https://api.podcastindex.org/api/1.0/search/byterm?q=technology&max=1",
      {
        headers: {
          "X-Auth-Date": apiHeaderTime.toString(),
          "X-Auth-Key": apiKey,
          "Authorization": hash,
          "User-Agent": "PodcastOutreach/1.0",
        },
      }
    );

    if (response.ok) {
      const data = await response.json();
      return {
        success: true,
        message: "PodcastIndex API connected successfully",
        details: { status: data.status, description: data.description }
      };
    }

    return { success: false, message: "API connection failed" };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Connection failed"
    };
  }
}

async function testListenNotes(apiKey?: string): Promise<TestResult> {
  if (!apiKey) {
    return { success: false, message: "ListenNotes API key not configured" };
  }

  try {
    const response = await fetch(
      "https://listen-api.listennotes.com/api/v2/search?q=technology&type=podcast&len_min=1",
      {
        headers: {
          "X-ListenAPI-Key": apiKey,
        },
      }
    );

    if (response.ok) {
      return {
        success: true,
        message: "ListenNotes API connected successfully"
      };
    } else if (response.status === 401) {
      return { success: false, message: "Invalid API key" };
    }

    return { success: false, message: "API connection failed" };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Connection failed"
    };
  }
}

async function testApplePodcasts(): Promise<TestResult> {
  try {
    const response = await fetch(
      "https://itunes.apple.com/search?term=podcast&media=podcast&entity=podcast&limit=1"
    );

    if (response.ok) {
      const data = await response.json();
      return {
        success: true,
        message: "Apple Podcasts API connected successfully",
        details: { resultCount: data.resultCount }
      };
    }

    return { success: false, message: "API connection failed" };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Connection failed"
    };
  }
}

async function testGmail(): Promise<TestResult> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return { success: false, message: "Gmail OAuth credentials not configured" };
  }

  return {
    success: true,
    message: "Gmail OAuth configured. Click 'Connect' to authorize."
  };
}
