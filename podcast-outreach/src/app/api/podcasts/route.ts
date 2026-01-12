import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { z } from "zod";

const createPodcastSchema = z.object({
  showName: z.string().min(1),
  hostName: z.string().optional(),
  showDescription: z.string().optional(),
  websiteUrl: z.string().url().optional().nullable(),
  applePodcastUrl: z.string().url().optional().nullable(),
  spotifyUrl: z.string().url().optional().nullable(),
  primaryPlatformUrl: z.string().url(),
  primaryEmail: z.string().email().optional().nullable(),
  primaryEmailSourceUrl: z.string().url().optional().nullable(),
  backupEmail: z.string().email().optional().nullable(),
  backupEmailSourceUrl: z.string().url().optional().nullable(),
  discoverySource: z.string().optional(),
  recentEpisodeTitles: z.array(z.string()).optional().default([]),
  recentGuests: z.array(z.string()).optional().default([]),
  dedupeKey: z.string(),
});

// GET /api/podcasts - List all podcasts
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");
    const status = searchParams.get("status");
    const tier = searchParams.get("tier");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    const where: Record<string, unknown> = {};

    if (search) {
      where.OR = [
        { showName: { contains: search, mode: "insensitive" } },
        { hostName: { contains: search, mode: "insensitive" } },
        { showDescription: { contains: search, mode: "insensitive" } },
      ];
    }

    if (status) {
      where.status = status;
    }

    if (tier) {
      where.tier = tier;
    }

    const podcasts = await db.podcast.findMany({
      where,
      take: limit,
      skip: offset,
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: {
            touches: true,
            notes: true,
          },
        },
      },
    });

    const total = await db.podcast.count({ where });

    return NextResponse.json({
      podcasts,
      total,
      limit,
      offset,
    });
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

    // Check for duplicates by dedupeKey
    const existing = await db.podcast.findUnique({
      where: { dedupeKey: data.dedupeKey },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Podcast already exists", podcast: existing },
        { status: 409 }
      );
    }

    const podcast = await db.podcast.create({
      data: {
        ...data,
        status: "NOT_CONTACTED",
        tier: "PENDING",
        isNew: true,
        discoveryBatch: new Date().toISOString().slice(0, 7), // "2026-01"
      },
    });

    return NextResponse.json(podcast, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
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
