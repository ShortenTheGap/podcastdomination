import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

const DEFAULT_CATEGORIES = [
  "Health & Wellness",
  "Fitness",
  "Business",
  "Personal Development",
  "Parenting",
];

// GET /api/settings/quick-categories - Fetch all quick categories
export async function GET() {
  try {
    let categories = await db.quickCategory.findMany({
      orderBy: { sortOrder: "asc" },
    });

    // If no categories exist, seed defaults
    if (categories.length === 0) {
      const created = await Promise.all(
        DEFAULT_CATEGORIES.map((name, index) =>
          db.quickCategory.create({
            data: { name, sortOrder: index },
          })
        )
      );
      categories = created;
    }

    return NextResponse.json(categories);
  } catch (error) {
    console.error("Error fetching quick categories:", error);
    return NextResponse.json(
      { error: "Failed to fetch quick categories" },
      { status: 500 }
    );
  }
}

const createSchema = z.object({
  name: z.string().min(1).max(100),
});

// POST /api/settings/quick-categories - Create a new quick category
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name } = createSchema.parse(body);

    // Check if already exists
    const existing = await db.quickCategory.findUnique({
      where: { name },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Category already exists" },
        { status: 400 }
      );
    }

    // Get max sort order
    const maxOrder = await db.quickCategory.findFirst({
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });

    const category = await db.quickCategory.create({
      data: {
        name,
        sortOrder: (maxOrder?.sortOrder ?? -1) + 1,
      },
    });

    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Error creating quick category:", error);
    return NextResponse.json(
      { error: "Failed to create quick category" },
      { status: 500 }
    );
  }
}

// DELETE /api/settings/quick-categories - Delete a quick category by name
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const name = searchParams.get("name");

    if (!name) {
      return NextResponse.json(
        { error: "Category name is required" },
        { status: 400 }
      );
    }

    await db.quickCategory.delete({
      where: { name },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting quick category:", error);
    return NextResponse.json(
      { error: "Failed to delete quick category" },
      { status: 500 }
    );
  }
}
