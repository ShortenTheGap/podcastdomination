import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const discoverySchema = z.object({
  source: z.enum(["apple", "spotify", "youtube", "manual"]),
  query: z.string().optional(),
  category: z.string().optional(),
  limit: z.number().default(20),
});

// Mock discovery results for now - will be replaced with actual API calls
async function searchApplePodcasts(query: string, limit: number) {
  // TODO: Implement Apple Podcasts API search
  // For now, return mock data
  return [
    {
      id: `apple-${Date.now()}`,
      name: `${query} Podcast`,
      description: `A podcast about ${query}`,
      episodeCount: 100,
      source: "apple",
      sourceId: `apple-${Date.now()}`,
    },
  ];
}

async function searchSpotifyPodcasts(query: string, limit: number) {
  // TODO: Implement Spotify API search
  return [
    {
      id: `spotify-${Date.now()}`,
      name: `${query} Show`,
      description: `Discussing ${query} topics`,
      episodeCount: 50,
      source: "spotify",
      sourceId: `spotify-${Date.now()}`,
    },
  ];
}

async function searchYouTubePodcasts(query: string, limit: number) {
  // TODO: Implement YouTube API search
  return [
    {
      id: `youtube-${Date.now()}`,
      name: `${query} Channel`,
      description: `Video podcast about ${query}`,
      episodeCount: 200,
      source: "youtube",
      sourceId: `youtube-${Date.now()}`,
    },
  ];
}

// POST /api/discovery - Search for podcasts
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { source, query, category, limit } = discoverySchema.parse(body);

    if (!query && !category) {
      return NextResponse.json(
        { error: "Query or category is required" },
        { status: 400 }
      );
    }

    const searchTerm = query || category || "";
    let results: Array<{
      id: string;
      name: string;
      description: string;
      episodeCount: number;
      source: string;
      sourceId: string;
    }> = [];

    switch (source) {
      case "apple":
        results = await searchApplePodcasts(searchTerm, limit);
        break;
      case "spotify":
        results = await searchSpotifyPodcasts(searchTerm, limit);
        break;
      case "youtube":
        results = await searchYouTubePodcasts(searchTerm, limit);
        break;
      default:
        return NextResponse.json(
          { error: "Invalid source" },
          { status: 400 }
        );
    }

    return NextResponse.json(results);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Discovery error:", error);
    return NextResponse.json(
      { error: "Discovery failed" },
      { status: 500 }
    );
  }
}
