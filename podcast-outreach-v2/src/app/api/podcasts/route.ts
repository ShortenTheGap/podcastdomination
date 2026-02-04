import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { z } from "zod";
import crypto from "crypto";
import { withRateLimit } from "@/lib/rate-limiter";

// GET /api/podcasts - List podcasts with filters and pagination
export async function GET(request: NextRequest) {
  // Apply rate limiting
  const rateLimitResponse = await withRateLimit(request);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const searchParams = request.nextUrl.searchParams;

    const search = searchParams.get("search");
    const status = searchParams.get("status");
    const tier = searchParams.get("tier");
    const outcome = searchParams.get("outcome");
    const nextAction = searchParams.get("nextAction");
    const suppressed = searchParams.get("suppressed");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    const where: Record<string, unknown> = {};

    // Text search
    if (search) {
      where.OR = [
        { showName: { contains: search, mode: "insensitive" } },
        { hostName: { contains: search, mode: "insensitive" } },
        { showDescription: { contains: search, mode: "insensitive" } },
      ];
    }

    // Filters
    if (status) where.status = status;
    if (tier) where.tier = tier;
    if (outcome) where.outcome = outcome;
    if (nextAction) where.nextAction = nextAction;
    if (suppressed !== null) {
      where.suppressed = suppressed === "true";
    }

    const [podcasts, total] = await Promise.all([
      db.podcast.findMany({
        where,
        orderBy: [
          { nextActionDate: "asc" },
          { updatedAt: "desc" },
        ],
        take: limit,
        skip: offset,
        include: {
          touches: {
            orderBy: { sentAt: "desc" },
            take: 1,
          },
          _count: {
            select: {
              touches: true,
              notes: true,
            },
          },
        },
      }),
      db.podcast.count({ where }),
    ]);

    return NextResponse.json({
      podcasts,
      total,
      limit,
      offset,
      hasMore: offset + podcasts.length < total,
    });
  } catch (error) {
    console.error("Error fetching podcasts:", error);
    return NextResponse.json(
      { error: "Failed to fetch podcasts" },
      { status: 500 }
    );
  }
}

// POST /api/podcasts - Create new podcast
const CreateSchema = z.object({
  showName: z.string().min(1),
  hostName: z.string().optional().nullable(),
  primaryPlatformUrl: z.string().url(),
  websiteUrl: z.string().url().optional().nullable(),
  applePodcastUrl: z.string().url().optional().nullable(),
  spotifyUrl: z.string().url().optional().nullable(),
  showDescription: z.string().optional().nullable(),
  primaryEmail: z.string().email().optional().nullable(),
  primaryEmailSourceUrl: z.string().url().optional().nullable(),
  backupEmail: z.string().email().optional().nullable(),
  backupEmailSourceUrl: z.string().url().optional().nullable(),
  discoverySource: z.string().optional().nullable(),
  discoveryBatch: z.string().optional().nullable(),
  recentEpisodeTitles: z.array(z.string()).optional().nullable().default([]),
  recentGuests: z.array(z.string()).optional().nullable().default([]),
});

export async function POST(request: NextRequest) {
  // Apply rate limiting
  const rateLimitResponse = await withRateLimit(request);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = await request.json();
    const data = CreateSchema.parse(body);

    // Generate dedupe key automatically
    const dedupeKey = generateDedupeKey(
      data.primaryPlatformUrl,
      data.applePodcastUrl || undefined,
      data.showName
    );

    // Check for existing
    const existing = await db.podcast.findUnique({
      where: { dedupeKey },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Podcast already exists", existing },
        { status: 409 }
      );
    }

    // Validate email source requirement - CRITICAL RULE
    if (data.primaryEmail && !data.primaryEmailSourceUrl) {
      return NextResponse.json(
        { error: "Primary email must have source URL" },
        { status: 400 }
      );
    }

    if (data.backupEmail && !data.backupEmailSourceUrl) {
      return NextResponse.json(
        { error: "Backup email must have source URL" },
        { status: 400 }
      );
    }

    const podcast = await db.podcast.create({
      data: {
        ...data,
        dedupeKey,
        tier: "PENDING",
        status: "NOT_CONTACTED",
        isNew: true,
        discoveryBatch: data.discoveryBatch || new Date().toISOString().slice(0, 7),
      },
    });

    return NextResponse.json(podcast, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }

    // Log the full error for debugging
    console.error("Error creating podcast:", error);

    // Return more specific error message
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const isDatabaseError = errorMessage.includes("prisma") ||
                           errorMessage.includes("database") ||
                           errorMessage.includes("connect") ||
                           errorMessage.includes("ECONNREFUSED");

    return NextResponse.json(
      {
        error: isDatabaseError
          ? "Database connection failed. Please check DATABASE_URL configuration."
          : `Failed to create podcast: ${errorMessage}`,
      },
      { status: 500 }
    );
  }
}

/**
 * Generate a unique dedupe key for podcast deduplication
 * Priority: Apple ID > Spotify ID > Website+Name > Hash fallback
 */
function generateDedupeKey(
  primaryUrl: string,
  appleUrl?: string,
  showName?: string
): string {
  // Apple Podcast ID (most reliable)
  if (appleUrl) {
    const match = appleUrl.match(/\/id(\d+)/);
    if (match) return `apple:${match[1]}`;
  }

  // Spotify Show ID
  const spotifyMatch = primaryUrl.match(/\/show\/([a-zA-Z0-9]+)/);
  if (spotifyMatch) return `spotify:${spotifyMatch[1]}`;

  // Website-based key
  try {
    const url = new URL(primaryUrl);
    const normalizedName = (showName || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    return `web:${url.hostname}|${normalizedName}`;
  } catch {
    // Fallback: MD5 hash
    return `hash:${crypto
      .createHash("md5")
      .update(`${primaryUrl}${showName}`)
      .digest("hex")
      .substring(0, 12)}`;
  }
}
