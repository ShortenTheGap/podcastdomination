import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

// Default criteria to seed if none exist
const DEFAULT_CRITERIA = [
  {
    name: "Features guest interviews",
    description: "Show regularly has guest interviews, not just solo episodes",
    category: "content",
    isRequired: true,
    weight: 5,
    promptHint: "Check if the podcast format includes guest interviews. Solo-only shows are not suitable.",
    sortOrder: 1,
  },
  {
    name: "Topic alignment",
    description: "Content aligns with health, fitness, wellness, nutrition, parenting, entrepreneurship, or personal development",
    category: "content",
    isRequired: true,
    weight: 5,
    promptHint: "Evaluate if the podcast topics overlap with fitness, health, nutrition, parenting, business performance, or personal development.",
    sortOrder: 2,
  },
  {
    name: "Active show",
    description: "Released an episode within the last 60 days",
    category: "general",
    isRequired: false,
    weight: 3,
    promptHint: "Check episode release dates. Inactive or discontinued shows are lower priority.",
    sortOrder: 3,
  },
  {
    name: "Professional quality",
    description: "Good audio quality and professional presentation",
    category: "technical",
    isRequired: false,
    weight: 2,
    promptHint: "Assess if the show appears professionally produced based on description and presentation.",
    sortOrder: 4,
  },
  {
    name: "Engaged audience",
    description: "Has reviews, ratings, or signs of an engaged listener base",
    category: "audience",
    isRequired: false,
    weight: 3,
    promptHint: "Look for signs of audience engagement like reviews or social media presence.",
    sortOrder: 5,
  },
  {
    name: "English language",
    description: "Primary language is English",
    category: "general",
    isRequired: true,
    weight: 4,
    promptHint: "Verify the podcast is primarily in English.",
    sortOrder: 6,
  },
  {
    name: "No paid guest spots",
    description: "Does not charge guests to appear",
    category: "general",
    isRequired: true,
    weight: 5,
    promptHint: "Check for any indication that the show charges guests for appearances. This is a red flag.",
    sortOrder: 7,
  },
  {
    name: "Appropriate episode length",
    description: "Episodes are typically 20-120 minutes",
    category: "technical",
    isRequired: false,
    weight: 2,
    promptHint: "Check typical episode duration. Very short (<15min) or very long (>3hrs) shows may not be ideal.",
    sortOrder: 8,
  },
  {
    name: "Contact method available",
    description: "Has a way to contact the host (email, form, social media)",
    category: "general",
    isRequired: false,
    weight: 3,
    promptHint: "Look for contact information availability. Without a contact method, outreach is impossible.",
    sortOrder: 9,
  },
  {
    name: "No controversial content",
    description: "Avoids heavily political, explicit, or pseudoscientific content",
    category: "content",
    isRequired: true,
    weight: 5,
    promptHint: "Check for red flags: strong political bias, explicit adult content, MLM promotion, conspiracy theories, or pseudoscience.",
    sortOrder: 10,
  },
];

/**
 * GET /api/settings/criteria - Get all criteria
 */
export async function GET() {
  try {
    let criteria = await db.podcastCriteria.findMany({
      orderBy: { sortOrder: "asc" },
    });

    // If no criteria exist, seed with defaults
    if (criteria.length === 0) {
      await db.podcastCriteria.createMany({
        data: DEFAULT_CRITERIA.map((c) => ({
          ...c,
          isEnabled: true,
          isCustom: false,
        })),
      });
      criteria = await db.podcastCriteria.findMany({
        orderBy: { sortOrder: "asc" },
      });
    }

    return NextResponse.json({ criteria });
  } catch (error) {
    console.error("Error fetching criteria:", error);
    return NextResponse.json(
      { error: "Failed to fetch criteria" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/settings/criteria - Create a new criterion
 */
const CreateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  category: z.string().default("general"),
  isRequired: z.boolean().default(false),
  weight: z.number().min(1).max(5).default(3),
  promptHint: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = CreateSchema.parse(body);

    // Get max sort order
    const maxSort = await db.podcastCriteria.aggregate({
      _max: { sortOrder: true },
    });

    const criterion = await db.podcastCriteria.create({
      data: {
        ...data,
        isEnabled: true,
        isCustom: true,
        sortOrder: (maxSort._max.sortOrder || 0) + 1,
      },
    });

    return NextResponse.json(criterion, { status: 201 });
  } catch (error) {
    console.error("Error creating criterion:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid data", details: error.issues },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Failed to create criterion" },
      { status: 500 }
    );
  }
}
