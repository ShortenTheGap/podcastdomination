import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const discoverySchema = z.object({
  type: z.enum(["seed_guest", "category"]),
  query: z.string().min(1),
  category: z.string().optional(), // Optional category for seed_guest searches
  limit: z.number().default(20),
});

interface ApplePodcastResult {
  collectionId: number;
  collectionName: string;
  artistName: string;
  collectionViewUrl: string;
  artworkUrl100?: string;
  artworkUrl600?: string;
  primaryGenreName?: string;
  genres?: string[];
  trackCount?: number;
  releaseDate?: string;
  country?: string;
  contentAdvisoryRating?: string;
  feedUrl?: string;
}

// Search Apple Podcasts via iTunes API
async function searchApplePodcasts(query: string, limit: number) {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=podcast&entity=podcast&limit=${limit}&country=US`;

  try {
    const response = await fetch(url, {
      headers: {
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      console.error("Apple API error:", response.status);
      return [];
    }

    const data = await response.json();

    // Filter out results without valid URLs and map to our format
    return (data.results || [])
      .filter((item: ApplePodcastResult) =>
        item.collectionViewUrl &&
        item.collectionId &&
        item.collectionName
      )
      .map((item: ApplePodcastResult) => ({
        showName: item.collectionName,
        hostName: item.artistName || null,
        showDescription: null, // iTunes search doesn't return description
        primaryPlatformUrl: item.collectionViewUrl,
        applePodcastUrl: item.collectionViewUrl,
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
        riskSignals: detectRiskSignals(item),
        // Additional display fields
        artworkUrl: item.artworkUrl600 || item.artworkUrl100 || null,
        genre: item.primaryGenreName || null,
        genres: item.genres || [],
        episodeCount: item.trackCount || 0,
        lastReleaseDate: item.releaseDate || null,
        country: item.country || null,
        contentRating: item.contentAdvisoryRating || null,
        feedUrl: item.feedUrl || null,
      }));
  } catch (error) {
    console.error("Apple search error:", error);
    return [];
  }
}

// Detect potential risk signals from podcast metadata
function detectRiskSignals(item: ApplePodcastResult): string[] {
  const signals: string[] = [];
  const name = (item.collectionName || "").toLowerCase();
  const genres = (item.genres || []).map(g => g.toLowerCase());

  // Check for explicit content
  if (item.contentAdvisoryRating === "Explicit") {
    signals.push("EXPLICIT_CONTENT");
  }

  // Check genres for potential issues
  if (genres.includes("politics") || genres.includes("government")) {
    signals.push("POTENTIAL_POLITICS");
  }

  // Check for potentially inactive shows (no episodes in last year)
  if (item.releaseDate) {
    const lastRelease = new Date(item.releaseDate);
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    if (lastRelease < oneYearAgo) {
      signals.push("POTENTIALLY_INACTIVE");
    }
  }

  // Low episode count might indicate new or inactive show
  if (item.trackCount && item.trackCount < 10) {
    signals.push("FEW_EPISODES");
  }

  return signals;
}

// POST /api/discovery - Search for podcasts
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, query, category, limit } = discoverySchema.parse(body);

    let results;

    if (type === "seed_guest") {
      // For seed guest searches with categories, search each category separately
      if (category) {
        const categories = category.split(",").map((c) => c.trim()).filter(Boolean);
        const allResults: Record<string, unknown>[] = [];
        const seenIds = new Set<string>();

        // Search for each category + guest name combination
        for (const cat of categories) {
          const searchQuery = `${query} ${cat} podcast`;
          const categoryResults = await searchApplePodcasts(searchQuery, Math.ceil(limit / categories.length) + 5);

          for (const result of categoryResults) {
            const dedupeKey = result.dedupeKey as string;
            if (!seenIds.has(dedupeKey)) {
              seenIds.add(dedupeKey);
              allResults.push(result);
            }
          }
        }

        // Also filter/boost results that match the categories in their genre
        const categoryLower = categories.map((c) => c.toLowerCase());
        results = allResults
          .map((r) => {
            const genres = ((r.genres as string[]) || []).map((g) => g.toLowerCase());
            const genreStr = genres.join(" ");
            const showName = ((r.showName as string) || "").toLowerCase();

            // Check if any category matches the genre or show name
            const matchesCategory = categoryLower.some(
              (cat) => genreStr.includes(cat) || showName.includes(cat)
            );

            return {
              ...r,
              discoverySource: `seed:${query} (${category})`,
              recentGuests: [query],
              _matchesCategory: matchesCategory,
            };
          })
          // Sort: matching categories first
          .sort((a, b) => {
            if (a._matchesCategory && !b._matchesCategory) return -1;
            if (!a._matchesCategory && b._matchesCategory) return 1;
            return 0;
          })
          // Remove the temporary field and limit results
          .map(({ _matchesCategory, ...rest }) => rest)
          .slice(0, limit);
      } else {
        // No category specified, just search for the guest name
        results = await searchApplePodcasts(query, limit);
        results = results.map((r: Record<string, unknown>) => ({
          ...r,
          discoverySource: `seed:${query}`,
          recentGuests: [query],
        }));
      }
    } else {
      // Category search
      results = await searchApplePodcasts(query, limit);
    }

    return NextResponse.json({
      results,
      count: results.length,
      query,
      type,
      platform: "Apple Podcasts",
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
