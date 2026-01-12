import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { analyzePodcastForAngles } from "@/lib/ai";
import { z } from "zod";
import { JOEY_PROFILE_DEFAULT } from "@/lib/constants";

const analyzeSchema = z.object({
  podcastId: z.string(),
});

// POST /api/ai/analyze-angle - Generate pitch angles for a podcast
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { podcastId } = analyzeSchema.parse(body);

    // Get podcast
    const podcast = await db.podcast.findUnique({
      where: { id: podcastId },
    });

    if (!podcast) {
      return NextResponse.json(
        { error: "Podcast not found" },
        { status: 404 }
      );
    }

    // Get Joey's profile from database or use default
    const joeyProfile = await db.joeyProfile.findFirst();
    const guestProfile = joeyProfile
      ? [
          ...joeyProfile.positioningStatements,
          `Credentials: ${joeyProfile.credibilityAssets.join(", ")}`,
          `Personal: ${joeyProfile.personalTraits.join(", ")}`,
        ].join("\n")
      : JOEY_PROFILE_DEFAULT.positioningStatements.join("\n");

    // Generate angles using AI
    const result = await analyzePodcastForAngles(
      podcast.showName,
      podcast.showDescription || "",
      podcast.recentEpisodeTitles.map((title: string) => ({ title })),
      guestProfile
    );

    // Return the generated angles (not saving to separate table since angles are now an enum)
    // The selected angle will be stored on the Podcast record
    return NextResponse.json({
      angles: result.angles,
      podcast: podcast.showName,
      suggestedAngle: result.angles[0]?.title || null,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Error analyzing podcast:", error);
    return NextResponse.json(
      { error: "Failed to analyze podcast" },
      { status: 500 }
    );
  }
}
