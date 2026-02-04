import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { findEmail, type EmailFinderResult } from "@/lib/email-finder";

/**
 * POST /api/email-finder - Find email for a podcast host
 *
 * Uses a robust multi-source approach:
 * 1. Check if already stored in database
 * 2. Scrape podcast website for emails (multiple pages)
 * 3. Parse RSS feed for itunes:email
 * 4. Use Apple Podcasts API to discover website/feed
 * 5. Use Hunter.io API (if configured)
 * 6. Generate common email patterns as last resort
 *
 * This approach maximizes the chances of finding valid contact emails
 * even when some information is missing.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { podcastId, hostName, showName, websiteUrl, applePodcastUrl, rssUrl } = body;

    if (!podcastId) {
      return NextResponse.json(
        { error: "podcastId is required" },
        { status: 400 }
      );
    }

    // Get podcast from database
    const podcast = await db.podcast.findUnique({
      where: { id: podcastId },
    });

    if (!podcast) {
      return NextResponse.json(
        { error: "Podcast not found" },
        { status: 404 }
      );
    }

    // If email already exists and we're not forcing a refresh, return it
    if (podcast.primaryEmail && !body.forceRefresh) {
      return NextResponse.json({
        success: true,
        email: podcast.primaryEmail,
        source: "database",
        sourceUrl: podcast.primaryEmailSourceUrl,
        message: "Email already exists in database",
        confidence: 1.0,
      });
    }

    console.log("[Email Finder] Starting search for podcast:", podcast.showName);

    // Use the comprehensive email finder
    const result: EmailFinderResult = await findEmail({
      podcastId,
      hostName: hostName || podcast.hostName || undefined,
      showName: showName || podcast.showName,
      websiteUrl: websiteUrl || podcast.websiteUrl || undefined,
      applePodcastUrl: applePodcastUrl || podcast.applePodcastUrl || undefined,
      rssUrl: rssUrl || undefined,
      existingEmail: body.forceRefresh ? undefined : podcast.primaryEmail || undefined,
    });

    console.log("[Email Finder] Result:", {
      email: result.email,
      source: result.source,
      confidence: result.confidence,
      alternateCount: result.alternateEmails?.length || 0,
    });

    // Build the full result object to persist
    const fullResult = {
      success: result.email && result.source !== "not_found",
      email: result.email,
      source: result.source,
      sourceUrl: result.sourceUrl,
      confidence: result.confidence,
      message: result.message,
      sourceDetails: result.sourceDetails,
      alternateEmails: result.alternateEmails,
      discoveredWebsiteUrl: result.discoveredWebsiteUrl,
    };

    // If we found an email, update the database
    if (result.email && result.source !== "not_found") {
      const updateData: Record<string, unknown> = {
        primaryEmail: result.email,
        primaryEmailSourceUrl: result.sourceUrl || null,
        // Persist the full email finder result for retroactive access
        emailFinderResult: fullResult,
        emailFinderRunAt: new Date(),
      };

      // If we discovered a website URL, save it
      if (result.discoveredWebsiteUrl && !podcast.websiteUrl) {
        updateData.websiteUrl = result.discoveredWebsiteUrl;
      }

      // Save backup email if available
      if (result.alternateEmails && result.alternateEmails.length > 0) {
        const backup = result.alternateEmails[0];
        updateData.backupEmail = backup.email;
        updateData.backupEmailSourceUrl = backup.sourceUrl || null;
      }

      await db.podcast.update({
        where: { id: podcastId },
        data: updateData,
      });

      return NextResponse.json(fullResult);
    }

    // No email found - provide helpful guidance
    const suggestions = getSearchSuggestions(podcast, result);

    return NextResponse.json({
      success: false,
      email: null,
      source: "not_found",
      confidence: 0,
      message: result.message,
      suggestions,
      discoveredWebsiteUrl: result.discoveredWebsiteUrl,
    });
  } catch (error) {
    console.error("Error finding email:", error);
    return NextResponse.json(
      {
        error: "Failed to find email",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * Generate helpful suggestions when email not found
 */
function getSearchSuggestions(
  podcast: { websiteUrl: string | null; applePodcastUrl: string | null; showName: string },
  result: EmailFinderResult
): string[] {
  const suggestions: string[] = [];

  if (!podcast.websiteUrl && !result.discoveredWebsiteUrl) {
    suggestions.push(
      "Add the podcast's website URL to enable website scanning",
      `Try searching Google for: "${podcast.showName}" podcast contact`
    );
  }

  if (!podcast.applePodcastUrl) {
    suggestions.push(
      "Add the Apple Podcasts URL to enable RSS feed lookup"
    );
  }

  suggestions.push(
    "Check the podcast's social media (Twitter bio, Instagram link in bio)",
    "Look for a 'Be a Guest' or 'Contact' page on their website",
    "Check the show notes of recent episodes for contact info"
  );

  if (!process.env.HUNTER_API_KEY) {
    suggestions.push(
      "Configure Hunter.io API key for enhanced email discovery"
    );
  }

  return suggestions;
}

/**
 * GET /api/email-finder - Get email finder status/config
 * Add ?test=hunter to test Hunter.io API connection
 */
export async function GET(request: NextRequest) {
  const hunterApiKey = process.env.HUNTER_API_KEY;
  const hunterConfigured = !!hunterApiKey;

  // Test Hunter.io API if requested
  const url = new URL(request.url);
  if (url.searchParams.get("test") === "hunter" && hunterApiKey) {
    try {
      // Test the API by checking account info
      const response = await fetch(`https://api.hunter.io/v2/account?api_key=${hunterApiKey}`);
      const data = await response.json();

      if (response.ok && data.data) {
        return NextResponse.json({
          success: true,
          message: "Hunter.io API is working",
          account: {
            email: data.data.email,
            plan: data.data.plan_name,
            requestsUsed: data.data.requests?.searches?.used || 0,
            requestsAvailable: data.data.requests?.searches?.available || 0,
            verificationsUsed: data.data.requests?.verifications?.used || 0,
            verificationsAvailable: data.data.requests?.verifications?.available || 0,
          },
        });
      } else {
        return NextResponse.json({
          success: false,
          message: "Hunter.io API error",
          error: data.errors || data.error || "Unknown error",
          status: response.status,
        }, { status: 400 });
      }
    } catch (error) {
      return NextResponse.json({
        success: false,
        message: "Failed to connect to Hunter.io",
        error: error instanceof Error ? error.message : "Unknown error",
      }, { status: 500 });
    }
  }

  return NextResponse.json({
    methods: [
      { name: "Website Scraping", enabled: true, description: "Scans podcast website for mailto links and email patterns" },
      { name: "RSS Feed Parsing", enabled: true, description: "Extracts email from podcast RSS feed (itunes:email)" },
      { name: "Apple Podcasts API", enabled: true, description: "Discovers website and RSS feed from Apple Podcasts" },
      { name: "Hunter.io", enabled: hunterConfigured, description: "Professional email finder service" },
      { name: "Pattern Generation", enabled: true, description: "Generates common email patterns as fallback" },
    ],
    tips: [
      "Add Apple Podcasts URL for best results",
      "Website URL enables direct scanning",
      hunterConfigured
        ? "Hunter.io is configured and active - add ?test=hunter to verify"
        : "Add HUNTER_API_KEY to .env for enhanced email discovery",
    ],
  });
}
