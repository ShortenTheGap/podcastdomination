import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { analyzePodcastForAngles } from "@/lib/ai";
import { z } from "zod";

const analyzeSchema = z.object({
  podcastId: z.string(),
  guestProfile: z.string().optional(),
});

// POST /api/ai/analyze-angle - Generate pitch angles for a podcast
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { podcastId, guestProfile } = analyzeSchema.parse(body);

    // Get podcast with recent episodes
    const podcast = await db.podcast.findUnique({
      where: { id: podcastId },
      include: {
        episodes: {
          orderBy: { publishedAt: "desc" },
          take: 5,
        },
      },
    });

    if (!podcast) {
      return NextResponse.json(
        { error: "Podcast not found" },
        { status: 404 }
      );
    }

    // Get guest profile from settings if not provided
    let profile = guestProfile;
    if (!profile) {
      const settings = await db.settings.findUnique({
        where: { key: "guestProfile" },
      });
      profile = settings?.value || "A business professional seeking podcast opportunities.";
    }

    // Generate angles using AI
    const result = await analyzePodcastForAngles(
      podcast.name,
      podcast.description || "",
      podcast.episodes.map((ep) => ({
        title: ep.title,
        description: ep.description || undefined,
      })),
      profile
    );

    // Save angles to database
    const savedAngles = await Promise.all(
      result.angles.map((angle) =>
        db.angle.create({
          data: {
            podcastId,
            title: angle.title,
            description: angle.description,
            hook: angle.hook,
            talkingPoints: JSON.stringify(angle.talkingPoints),
            relevanceScore: angle.relevanceScore,
          },
        })
      )
    );

    // Update outreach status to researched
    await db.outreach.updateMany({
      where: {
        podcastId,
        status: "discovered",
      },
      data: {
        status: "researched",
      },
    });

    return NextResponse.json({
      angles: savedAngles,
      podcast: podcast.name,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.errors },
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
