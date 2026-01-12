import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { z } from "zod";

const createPodcastSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  website: z.string().url().optional(),
  rssFeed: z.string().url().optional(),
  appleId: z.string().optional(),
  spotifyId: z.string().optional(),
  youtubeId: z.string().optional(),
  category: z.string().optional(),
  source: z.string().default("manual"),
  episodeCount: z.number().default(0),
});

// GET /api/podcasts - List all podcasts
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");
    const category = searchParams.get("category");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    const where: Record<string, unknown> = {};

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { description: { contains: search } },
      ];
    }

    if (category) {
      where.category = category;
    }

    const podcasts = await db.podcast.findMany({
      where,
      take: limit,
      skip: offset,
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: {
            contacts: true,
            outreach: true,
            angles: true,
          },
        },
      },
    });

    return NextResponse.json(podcasts);
  } catch (error) {
    console.error("Error fetching podcasts:", error);
    return NextResponse.json(
      { error: "Failed to fetch podcasts" },
      { status: 500 }
    );
  }
}

// POST /api/podcasts - Create a new podcast
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = createPodcastSchema.parse(body);

    // Check for duplicates
    const existing = await db.podcast.findFirst({
      where: {
        OR: [
          data.appleId ? { appleId: data.appleId } : {},
          data.spotifyId ? { spotifyId: data.spotifyId } : {},
          { name: data.name },
        ].filter((o) => Object.keys(o).length > 0),
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Podcast already exists", podcast: existing },
        { status: 409 }
      );
    }

    const podcast = await db.podcast.create({
      data,
    });

    // Create initial outreach entry
    await db.outreach.create({
      data: {
        podcastId: podcast.id,
        status: "discovered",
      },
    });

    return NextResponse.json(podcast, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.errors },
        { status: 400 }
      );
    }
    console.error("Error creating podcast:", error);
    return NextResponse.json(
      { error: "Failed to create podcast" },
      { status: 500 }
    );
  }
}
