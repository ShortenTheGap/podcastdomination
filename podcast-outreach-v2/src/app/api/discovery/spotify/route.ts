import { NextRequest, NextResponse } from "next/server";

// Cache for Spotify access token
let spotifyToken: { token: string; expiresAt: number } | null = null;

async function getSpotifyAccessToken(): Promise<string | null> {
  // Return cached token if valid
  if (spotifyToken && spotifyToken.expiresAt > Date.now()) {
    return spotifyToken.token;
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return null;
  }

  try {
    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: "grant_type=client_credentials",
    });

    if (response.ok) {
      const data = await response.json();
      spotifyToken = {
        token: data.access_token,
        expiresAt: Date.now() + (data.expires_in - 60) * 1000, // Refresh 1 minute early
      };
      return spotifyToken.token;
    }
  } catch (error) {
    console.error("Failed to get Spotify token:", error);
  }

  return null;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q");
  const limit = parseInt(searchParams.get("limit") || "20");
  const offset = parseInt(searchParams.get("offset") || "0");

  if (!query) {
    return NextResponse.json({ error: "Query parameter 'q' is required" }, { status: 400 });
  }

  const accessToken = await getSpotifyAccessToken();

  if (!accessToken) {
    return NextResponse.json(
      { error: "Spotify API not configured", configured: false },
      { status: 503 }
    );
  }

  try {
    const searchUrl = new URL("https://api.spotify.com/v1/search");
    searchUrl.searchParams.set("q", query);
    searchUrl.searchParams.set("type", "show");
    searchUrl.searchParams.set("market", "US");
    searchUrl.searchParams.set("limit", Math.min(limit, 50).toString());
    searchUrl.searchParams.set("offset", offset.toString());

    const response = await fetch(searchUrl.toString(), {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      return NextResponse.json(
        { error: error.error?.message || "Spotify API error" },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Transform Spotify results to match our podcast format
    const podcasts = data.shows?.items?.map((show: SpotifyShow) => ({
      id: `spotify_${show.id}`,
      spotifyId: show.id,
      showName: show.name,
      publisher: show.publisher,
      description: show.description,
      artworkUrl: show.images?.[0]?.url || null,
      totalEpisodes: show.total_episodes,
      explicit: show.explicit,
      languages: show.languages,
      mediaType: show.media_type,
      spotifyUrl: show.external_urls?.spotify,
      source: "spotify",
    })) || [];

    return NextResponse.json({
      podcasts,
      total: data.shows?.total || 0,
      offset: data.shows?.offset || 0,
      limit: data.shows?.limit || 20,
      source: "spotify",
    });
  } catch (error) {
    console.error("Spotify search error:", error);
    return NextResponse.json(
      { error: "Failed to search Spotify" },
      { status: 500 }
    );
  }
}

// Get podcast details by Spotify ID
export async function POST(request: NextRequest) {
  try {
    const { spotifyId } = await request.json();

    if (!spotifyId) {
      return NextResponse.json({ error: "spotifyId is required" }, { status: 400 });
    }

    const accessToken = await getSpotifyAccessToken();

    if (!accessToken) {
      return NextResponse.json(
        { error: "Spotify API not configured" },
        { status: 503 }
      );
    }

    // Get show details
    const showResponse = await fetch(
      `https://api.spotify.com/v1/shows/${spotifyId}?market=US`,
      {
        headers: {
          "Authorization": `Bearer ${accessToken}`,
        },
      }
    );

    if (!showResponse.ok) {
      return NextResponse.json({ error: "Show not found" }, { status: 404 });
    }

    const show: SpotifyShowDetails = await showResponse.json();

    // Get recent episodes
    const episodesResponse = await fetch(
      `https://api.spotify.com/v1/shows/${spotifyId}/episodes?market=US&limit=10`,
      {
        headers: {
          "Authorization": `Bearer ${accessToken}`,
        },
      }
    );

    const episodesData = await episodesResponse.json();

    return NextResponse.json({
      id: `spotify_${show.id}`,
      spotifyId: show.id,
      showName: show.name,
      publisher: show.publisher,
      description: show.description,
      htmlDescription: show.html_description,
      artworkUrl: show.images?.[0]?.url || null,
      totalEpisodes: show.total_episodes,
      explicit: show.explicit,
      languages: show.languages,
      mediaType: show.media_type,
      spotifyUrl: show.external_urls?.spotify,
      copyrights: show.copyrights,
      recentEpisodes: episodesData.items?.map((ep: SpotifyEpisode) => ({
        id: ep.id,
        name: ep.name,
        description: ep.description,
        releaseDate: ep.release_date,
        durationMs: ep.duration_ms,
        spotifyUrl: ep.external_urls?.spotify,
      })) || [],
      source: "spotify",
    });
  } catch (error) {
    console.error("Spotify details error:", error);
    return NextResponse.json(
      { error: "Failed to get podcast details" },
      { status: 500 }
    );
  }
}

// Type definitions for Spotify API responses
interface SpotifyShow {
  id: string;
  name: string;
  publisher: string;
  description: string;
  images: Array<{ url: string; height: number; width: number }>;
  total_episodes: number;
  explicit: boolean;
  languages: string[];
  media_type: string;
  external_urls: { spotify: string };
}

interface SpotifyShowDetails extends SpotifyShow {
  html_description: string;
  copyrights: Array<{ text: string; type: string }>;
}

interface SpotifyEpisode {
  id: string;
  name: string;
  description: string;
  release_date: string;
  duration_ms: number;
  external_urls: { spotify: string };
}
