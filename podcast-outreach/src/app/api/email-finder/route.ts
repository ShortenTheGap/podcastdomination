import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * POST /api/email-finder - Find email for a podcast host
 * Uses various methods to find the email:
 * 1. Check if already stored in database
 * 2. Try to extract from podcast website
 * 3. Use email finder services (Hunter.io, etc.)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { podcastId, hostName, showName, websiteUrl } = body;

    if (!podcastId) {
      return NextResponse.json(
        { error: "podcastId is required" },
        { status: 400 }
      );
    }

    // Get podcast from database to check current email
    const podcast = await db.podcast.findUnique({
      where: { id: podcastId },
    });

    if (!podcast) {
      return NextResponse.json(
        { error: "Podcast not found" },
        { status: 404 }
      );
    }

    // If email already exists, return it
    if (podcast.primaryEmail) {
      return NextResponse.json({
        success: true,
        email: podcast.primaryEmail,
        source: "database",
        message: "Email already exists in database",
      });
    }

    // Try to find email using various methods
    let foundEmail: string | null = null;
    let source = "not_found";

    // Method 1: Check for email patterns in podcast description or website
    // This is a placeholder for more sophisticated email finding logic

    // Method 2: Try Hunter.io API if configured
    const hunterApiKey = process.env.HUNTER_API_KEY;
    if (hunterApiKey && websiteUrl) {
      try {
        // Extract domain from website URL
        const domain = new URL(websiteUrl).hostname.replace("www.", "");

        // Use Hunter.io domain search
        const hunterRes = await fetch(
          `https://api.hunter.io/v2/domain-search?domain=${domain}&api_key=${hunterApiKey}&limit=5`
        );

        if (hunterRes.ok) {
          const hunterData = await hunterRes.json();
          if (hunterData.data?.emails?.length > 0) {
            // Find the most relevant email (prefer based on host name if provided)
            const emails = hunterData.data.emails;

            if (hostName) {
              // Try to find email matching host name
              const hostFirstName = hostName.split(" ")[0]?.toLowerCase();
              const matchingEmail = emails.find((e: any) =>
                e.first_name?.toLowerCase() === hostFirstName ||
                e.value?.toLowerCase().includes(hostFirstName)
              );
              if (matchingEmail) {
                foundEmail = matchingEmail.value;
                source = "hunter.io";
              }
            }

            // If no match by name, use the first email
            if (!foundEmail && emails[0]?.value) {
              foundEmail = emails[0].value;
              source = "hunter.io";
            }
          }
        }
      } catch (hunterError) {
        console.error("Hunter.io API error:", hunterError);
      }
    }

    // Method 3: Try email permutator if we have host name and domain
    if (!foundEmail && hostName && websiteUrl) {
      try {
        const domain = new URL(websiteUrl).hostname.replace("www.", "");
        const nameParts = hostName.toLowerCase().split(" ");

        if (nameParts.length >= 2) {
          const firstName = nameParts[0];
          const lastName = nameParts[nameParts.length - 1];

          // Common email patterns to try
          const patterns = [
            `${firstName}@${domain}`,
            `${firstName}.${lastName}@${domain}`,
            `${firstName}${lastName}@${domain}`,
            `${firstName[0]}${lastName}@${domain}`,
            `${firstName}_${lastName}@${domain}`,
          ];

          // For now, suggest the most common pattern
          // In a production system, you would verify these
          foundEmail = patterns[1]; // firstname.lastname@domain
          source = "pattern_generated";
        }
      } catch (urlError) {
        console.error("URL parsing error:", urlError);
      }
    }

    // If email found, optionally update the podcast record
    if (foundEmail) {
      await db.podcast.update({
        where: { id: podcastId },
        data: { primaryEmail: foundEmail },
      });

      return NextResponse.json({
        success: true,
        email: foundEmail,
        source,
        message: `Email found via ${source}`,
      });
    }

    // No email found
    return NextResponse.json({
      success: false,
      email: null,
      source: "not_found",
      message: "Could not find email automatically. Please enter manually.",
    });
  } catch (error) {
    console.error("Error finding email:", error);
    return NextResponse.json(
      { error: "Failed to find email" },
      { status: 500 }
    );
  }
}
