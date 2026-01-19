import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  type: z.enum(["best_match", "momentum"]),
  limit: z.number().default(10),
  searchTerms: z.array(z.string()).optional(),
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

interface MappedPodcast {
  showName: string;
  hostName: string | null;
  showDescription: string | null;
  primaryPlatformUrl: string;
  applePodcastUrl: string;
  websiteUrl: string | null;
  spotifyUrl: string | null;
  dedupeKey: string;
  recentEpisodeTitles: string[];
  recentGuests: string[];
  primaryEmail: string | null;
  primaryEmailSourceUrl: string | null;
  backupEmail: string | null;
  backupEmailSourceUrl: string | null;
  discoverySource: string;
  riskSignals: string[];
  artworkUrl: string | null;
  genre: string | null;
  genres: string[];
  episodeCount: number;
  lastReleaseDate: string | null;
  country: string | null;
  contentRating: string | null;
  feedUrl: string | null;
  matchScore?: number;
  momentumScore?: number;
}

// Search Apple Podcasts via iTunes API
async function searchApplePodcasts(query: string, limit: number): Promise<MappedPodcast[]> {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=podcast&entity=podcast&limit=${limit}&country=US`;

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      console.error("Apple API error:", response.status);
      return [];
    }

    const data = await response.json();

    return (data.results || [])
      .filter(
        (item: ApplePodcastResult) =>
          item.collectionViewUrl && item.collectionId && item.collectionName
      )
      .map((item: ApplePodcastResult) => ({
        showName: item.collectionName,
        hostName: item.artistName || null,
        showDescription: null,
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
        discoverySource: `recommendation:${query}`,
        riskSignals: detectRiskSignals(item),
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
  const genres = (item.genres || []).map((g) => g.toLowerCase());

  if (item.contentAdvisoryRating === "Explicit") {
    signals.push("EXPLICIT_CONTENT");
  }

  if (genres.includes("politics") || genres.includes("government")) {
    signals.push("POTENTIAL_POLITICS");
  }

  if (item.releaseDate) {
    const lastRelease = new Date(item.releaseDate);
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    if (lastRelease < sixMonthsAgo) {
      signals.push("POTENTIALLY_INACTIVE");
    }
  }

  if (item.trackCount && item.trackCount < 10) {
    signals.push("FEW_EPISODES");
  }

  return signals;
}

// Calculate match score based on Perfect Podcast criteria
function calculateMatchScore(
  podcast: MappedPodcast,
  criteria: { name: string; category: string; isRequired: boolean; weight: number }[]
): number {
  let score = 50; // Base score
  const genres = podcast.genres.map((g) => g.toLowerCase());
  const genreStr = genres.join(" ");

  for (const criterion of criteria) {
    const weight = criterion.weight;
    const categoryLower = criterion.category.toLowerCase();

    // Topic alignment check
    if (criterion.name.toLowerCase().includes("topic alignment")) {
      const topicKeywords = [
        "health",
        "fitness",
        "wellness",
        "nutrition",
        "exercise",
        "parenting",
        "business",
        "entrepreneur",
        "personal development",
        "self-help",
        "motivation",
      ];
      const hasAlignment = topicKeywords.some(
        (kw) => genreStr.includes(kw) || (podcast.showName || "").toLowerCase().includes(kw)
      );
      if (hasAlignment) {
        score += weight * 5;
      } else if (criterion.isRequired) {
        score -= 20;
      }
    }

    // Active show check
    if (criterion.name.toLowerCase().includes("active")) {
      if (podcast.lastReleaseDate) {
        const lastRelease = new Date(podcast.lastReleaseDate);
        const sixtyDaysAgo = new Date();
        sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
        if (lastRelease >= sixtyDaysAgo) {
          score += weight * 4;
        } else if (criterion.isRequired) {
          score -= 15;
        }
      }
    }

    // Episode count (established show)
    if (criterion.name.toLowerCase().includes("episode length") || categoryLower === "technical") {
      if (podcast.episodeCount >= 50) {
        score += weight * 3;
      } else if (podcast.episodeCount >= 20) {
        score += weight * 2;
      }
    }

    // No controversial content
    if (criterion.name.toLowerCase().includes("controversial")) {
      const hasControversial = podcast.riskSignals.includes("POTENTIAL_POLITICS");
      if (!hasControversial) {
        score += weight * 2;
      } else if (criterion.isRequired) {
        score -= 25;
      }
    }

    // English language (check country)
    if (criterion.name.toLowerCase().includes("english")) {
      if (podcast.country === "USA" || podcast.country === "GBR" || podcast.country === "CAN") {
        score += weight * 2;
      }
    }
  }

  // Normalize score to 0-100
  return Math.max(0, Math.min(100, score));
}

// Calculate momentum score (rising podcasts)
function calculateMomentumScore(podcast: MappedPodcast): number {
  let score = 0;

  // High episode count indicates established audience
  if (podcast.episodeCount >= 100) {
    score += 25;
  } else if (podcast.episodeCount >= 50) {
    score += 20;
  } else if (podcast.episodeCount >= 20) {
    score += 10;
  }

  // Recent activity is crucial for momentum
  if (podcast.lastReleaseDate) {
    const lastRelease = new Date(podcast.lastReleaseDate);
    const now = new Date();
    const daysSinceRelease = Math.floor(
      (now.getTime() - lastRelease.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSinceRelease <= 7) {
      score += 30; // Very active
    } else if (daysSinceRelease <= 14) {
      score += 25;
    } else if (daysSinceRelease <= 30) {
      score += 20;
    } else if (daysSinceRelease <= 60) {
      score += 10;
    }
  }

  // Clean content rating bonus
  if (podcast.contentRating !== "Explicit") {
    score += 10;
  }

  // No risk signals bonus
  if (podcast.riskSignals.length === 0) {
    score += 15;
  }

  // Genre relevance (health, fitness, business podcasts are higher momentum in this niche)
  const relevantGenres = ["health", "fitness", "business", "self-help", "education"];
  const hasRelevantGenre = podcast.genres.some((g) =>
    relevantGenres.some((rg) => g.toLowerCase().includes(rg))
  );
  if (hasRelevantGenre) {
    score += 20;
  }

  return Math.min(100, score);
}

// Best Match: Search using user-provided or default keywords
async function getBestMatchPodcasts(
  limit: number,
  customSearchTerms?: string[]
): Promise<MappedPodcast[]> {
  // Fetch Perfect Podcast criteria
  const criteria = await db.podcastCriteria.findMany({
    where: { isEnabled: true },
    orderBy: { sortOrder: "asc" },
  });

  // Use custom search terms if provided, otherwise use defaults
  const searchTerms =
    customSearchTerms && customSearchTerms.length > 0
      ? customSearchTerms.map((term) => `${term} podcast`)
      : [
          "fitness podcast interview",
          "health wellness podcast",
          "nutrition science podcast",
          "personal development podcast",
          "entrepreneurship fitness",
        ];

  // Collect results from multiple searches
  const allResults: MappedPodcast[] = [];
  const seenIds = new Set<string>();

  for (const term of searchTerms) {
    const results = await searchApplePodcasts(term, 15);
    for (const podcast of results) {
      if (!seenIds.has(podcast.dedupeKey)) {
        seenIds.add(podcast.dedupeKey);
        podcast.matchScore = calculateMatchScore(podcast, criteria);
        podcast.discoverySource = "recommendation:best_match";
        allResults.push(podcast);
      }
    }
  }

  // Filter out podcasts with risk signals if required criteria demand clean content
  const requiresClean = criteria.some(
    (c: { isRequired: boolean; name: string }) =>
      c.isRequired && c.name.toLowerCase().includes("controversial")
  );

  let filtered = allResults;
  if (requiresClean) {
    filtered = allResults.filter((p) => !p.riskSignals.includes("POTENTIAL_POLITICS"));
  }

  // Sort by match score and return top results
  filtered.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
  return filtered.slice(0, limit);
}

// Momentum: Search for rising/active podcasts
async function getMomentumPodcasts(
  limit: number,
  customSearchTerms?: string[]
): Promise<MappedPodcast[]> {
  // Use custom search terms if provided, otherwise use defaults
  const searchTerms =
    customSearchTerms && customSearchTerms.length > 0
      ? customSearchTerms.map((term) => `trending ${term} podcast`)
      : [
          "trending health podcast",
          "new fitness podcast 2024",
          "popular wellness podcast",
          "top business podcast interview",
          "rising self improvement podcast",
        ];

  const allResults: MappedPodcast[] = [];
  const seenIds = new Set<string>();

  for (const term of searchTerms) {
    const results = await searchApplePodcasts(term, 15);
    for (const podcast of results) {
      if (!seenIds.has(podcast.dedupeKey)) {
        seenIds.add(podcast.dedupeKey);
        podcast.momentumScore = calculateMomentumScore(podcast);
        podcast.discoverySource = "recommendation:momentum";
        allResults.push(podcast);
      }
    }
  }

  // Filter for shows with recent activity (momentum implies active growth)
  const activeOnly = allResults.filter((p) => {
    if (!p.lastReleaseDate) return false;
    const lastRelease = new Date(p.lastReleaseDate);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return lastRelease >= thirtyDaysAgo;
  });

  // Sort by momentum score and return top results
  activeOnly.sort((a, b) => (b.momentumScore || 0) - (a.momentumScore || 0));
  return activeOnly.slice(0, limit);
}

// POST /api/discovery/recommendations
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, limit, searchTerms } = requestSchema.parse(body);

    let results: MappedPodcast[];

    if (type === "best_match") {
      results = await getBestMatchPodcasts(limit, searchTerms);
    } else {
      results = await getMomentumPodcasts(limit, searchTerms);
    }

    return NextResponse.json({
      results,
      count: results.length,
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
    console.error("Recommendations error:", error);
    return NextResponse.json({ error: "Failed to fetch recommendations" }, { status: 500 });
  }
}
