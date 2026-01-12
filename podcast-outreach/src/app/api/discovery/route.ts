import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const discoverySchema = z.object({
  type: z.enum(["seed_guest", "category"]),
  query: z.string().min(1),
  limit: z.number().default(20),
});

// Mock Apple Podcasts search - will be replaced with Python scraper call
async function searchApplePodcasts(query: string, limit: number) {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=podcast&entity=podcast&limit=${limit}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    return data.results.map((item: Record<string, unknown>) => ({
      showName: item.collectionName as string,
      hostName: item.artistName as string,
      showDescription: (item.description as string) || "",
      primaryPlatformUrl: item.collectionViewUrl as string,
      applePodcastUrl: item.collectionViewUrl as string,
      websiteUrl: null,
      spotifyUrl: null,
      dedupeKey: `apple:${item.collectionId}`,
      recentEpisodeTitles: [],
      recentGuests: [],
      primaryEmail: null,
      primaryEmailSourceUrl: null,
      backupEmail: null,
      backupEmailSourceUrl: null,
      discoverySource: `category:${query}`,
      riskSignals: [],
    }));
  } catch (error) {
    console.error("Apple search error:", error);
    return [];
  }
}

// POST /api/discovery - Search for podcasts
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, query, limit } = discoverySchema.parse(body);

    let results;

    if (type === "seed_guest") {
      // For seed guest searches, we'd call the Python discovery engine
      // For now, search Apple with the guest name
      results = await searchApplePodcasts(query, limit);
      results = results.map((r: Record<string, unknown>) => ({
        ...r,
        discoverySource: `seed:${query}`,
        recentGuests: [query],
      }));
    } else {
      // Category search
      results = await searchApplePodcasts(query, limit);
    }

    return NextResponse.json({
      results,
      count: results.length,
      query,
      type,
    });
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
