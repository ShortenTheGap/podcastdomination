import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

function getPodcastIndexHeaders(): Record<string, string> | null {
  const apiKey = process.env.PODCAST_INDEX_API_KEY;
  const apiSecret = process.env.PODCAST_INDEX_API_SECRET;

  if (!apiKey || !apiSecret) {
    return null;
  }

  const apiHeaderTime = Math.floor(Date.now() / 1000);
  const hash = crypto
    .createHash("sha1")
    .update(apiKey + apiSecret + apiHeaderTime)
    .digest("hex");

  return {
    "X-Auth-Date": apiHeaderTime.toString(),
    "X-Auth-Key": apiKey,
    "Authorization": hash,
    "User-Agent": "PodcastOutreach/1.0",
  };
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q");
  const type = searchParams.get("type") || "search"; // search, trending, recent
  const limit = parseInt(searchParams.get("limit") || "20");
  const category = searchParams.get("category");

  const headers = getPodcastIndexHeaders();

  if (!headers) {
    return NextResponse.json(
      { error: "PodcastIndex API not configured", configured: false },
      { status: 503 }
    );
  }

  try {
    let url: string;

    switch (type) {
      case "trending":
        url = `https://api.podcastindex.org/api/1.0/podcasts/trending?max=${limit}${
          category ? `&cat=${encodeURIComponent(category)}` : ""
        }`;
        break;

      case "recent":
        url = `https://api.podcastindex.org/api/1.0/recent/feeds?max=${limit}${
          category ? `&cat=${encodeURIComponent(category)}` : ""
        }`;
        break;

      case "categories":
        url = "https://api.podcastindex.org/api/1.0/categories/list";
        break;

      default:
        if (!query) {
          return NextResponse.json(
            { error: "Query parameter 'q' is required for search" },
            { status: 400 }
          );
        }
        url = `https://api.podcastindex.org/api/1.0/search/byterm?q=${encodeURIComponent(
          query
        )}&max=${limit}`;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      const error = await response.text();
      console.error("PodcastIndex error:", error);
      return NextResponse.json(
        { error: "PodcastIndex API error" },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Handle categories response
    if (type === "categories") {
      return NextResponse.json({
        categories: data.feeds || [],
        source: "podcastindex",
      });
    }

    // Transform results to match our podcast format
    const feeds = data.feeds || [];
    const podcasts = feeds.map((feed: PodcastIndexFeed) => ({
      id: `podcastindex_${feed.id}`,
      podcastIndexId: feed.id,
      showName: feed.title,
      publisher: feed.author || feed.ownerName,
      description: feed.description,
      artworkUrl: feed.image || feed.artwork,
      language: feed.language,
      categories: feed.categories ? Object.values(feed.categories) : [],
      episodeCount: feed.episodeCount,
      lastUpdate: feed.newestItemPubdate ? new Date(feed.newestItemPubdate * 1000).toISOString() : null,
      itunesId: feed.itunesId,
      feedUrl: feed.url,
      websiteUrl: feed.link,
      explicit: feed.explicit,
      trendScore: feed.trendScore,
      source: "podcastindex",
    }));

    return NextResponse.json({
      podcasts,
      total: data.count || podcasts.length,
      source: "podcastindex",
      status: data.status,
    });
  } catch (error) {
    console.error("PodcastIndex search error:", error);
    return NextResponse.json(
      { error: "Failed to search PodcastIndex" },
      { status: 500 }
    );
  }
}

// Get podcast details by PodcastIndex ID
export async function POST(request: NextRequest) {
  try {
    const { podcastIndexId, feedUrl } = await request.json();

    const headers = getPodcastIndexHeaders();

    if (!headers) {
      return NextResponse.json(
        { error: "PodcastIndex API not configured" },
        { status: 503 }
      );
    }

    let url: string;

    if (podcastIndexId) {
      url = `https://api.podcastindex.org/api/1.0/podcasts/byfeedid?id=${podcastIndexId}`;
    } else if (feedUrl) {
      url = `https://api.podcastindex.org/api/1.0/podcasts/byfeedurl?url=${encodeURIComponent(feedUrl)}`;
    } else {
      return NextResponse.json(
        { error: "podcastIndexId or feedUrl is required" },
        { status: 400 }
      );
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      return NextResponse.json({ error: "Podcast not found" }, { status: 404 });
    }

    const data = await response.json();
    const feed = data.feed;

    if (!feed) {
      return NextResponse.json({ error: "Podcast not found" }, { status: 404 });
    }

    // Get recent episodes
    const episodesResponse = await fetch(
      `https://api.podcastindex.org/api/1.0/episodes/byfeedid?id=${feed.id}&max=10`,
      { headers }
    );

    const episodesData = await episodesResponse.json();

    return NextResponse.json({
      id: `podcastindex_${feed.id}`,
      podcastIndexId: feed.id,
      showName: feed.title,
      publisher: feed.author || feed.ownerName,
      description: feed.description,
      artworkUrl: feed.image || feed.artwork,
      language: feed.language,
      categories: feed.categories ? Object.values(feed.categories) : [],
      episodeCount: feed.episodeCount,
      lastUpdate: feed.newestItemPubdate ? new Date(feed.newestItemPubdate * 1000).toISOString() : null,
      itunesId: feed.itunesId,
      feedUrl: feed.url,
      websiteUrl: feed.link,
      explicit: feed.explicit,
      ownerEmail: feed.ownerEmail, // Useful for outreach!
      contactEmail: feed.contactEmail,
      recentEpisodes: (episodesData.items || []).map((ep: PodcastIndexEpisode) => ({
        id: ep.id,
        title: ep.title,
        description: ep.description,
        datePublished: ep.datePublished ? new Date(ep.datePublished * 1000).toISOString() : null,
        duration: ep.duration,
        episodeUrl: ep.link,
      })),
      source: "podcastindex",
    });
  } catch (error) {
    console.error("PodcastIndex details error:", error);
    return NextResponse.json(
      { error: "Failed to get podcast details" },
      { status: 500 }
    );
  }
}

// Type definitions for PodcastIndex API responses
interface PodcastIndexFeed {
  id: number;
  title: string;
  url: string;
  link: string;
  description: string;
  author: string;
  ownerName: string;
  ownerEmail?: string;
  contactEmail?: string;
  image: string;
  artwork: string;
  language: string;
  categories: Record<number, string>;
  episodeCount: number;
  newestItemPubdate: number;
  itunesId: number;
  explicit: boolean;
  trendScore?: number;
}

interface PodcastIndexEpisode {
  id: number;
  title: string;
  description: string;
  datePublished: number;
  duration: number;
  link: string;
}
