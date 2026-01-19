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

// In-memory fallback storage (used when database table doesn't exist)
let inMemoryCategories: { id: string; name: string; sortOrder: number }[] | null = null;

function generateId() {
  return Math.random().toString(36).substring(2, 15);
}

function getDefaultCategories() {
  return DEFAULT_CATEGORIES.map((name, index) => ({
    id: generateId(),
    name,
    sortOrder: index,
  }));
}

// GET /api/settings/quick-categories - Fetch all quick categories
export async function GET() {
  try {
    // Try database first
    const categories = await db.quickCategory.findMany({
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
      return NextResponse.json(created);
    }

    return NextResponse.json(categories);
  } catch (error) {
    console.error("Database error, using in-memory fallback:", error);
    // Fallback to in-memory storage
    if (inMemoryCategories === null) {
      inMemoryCategories = getDefaultCategories();
    }
    return NextResponse.json(inMemoryCategories);
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

    try {
      // Try database first
      const existing = await db.quickCategory.findUnique({
        where: { name },
      });

      if (existing) {
        return NextResponse.json(
          { error: "Category already exists" },
          { status: 400 }
        );
      }

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
    } catch (dbError) {
      console.error("Database error, using in-memory fallback:", dbError);
      // Fallback to in-memory storage
      if (inMemoryCategories === null) {
        inMemoryCategories = getDefaultCategories();
      }

      // Check if already exists in memory
      if (inMemoryCategories.some((c) => c.name === name)) {
        return NextResponse.json(
          { error: "Category already exists" },
          { status: 400 }
        );
      }

      const maxOrder = Math.max(...inMemoryCategories.map((c) => c.sortOrder), -1);
      const newCategory = {
        id: generateId(),
        name,
        sortOrder: maxOrder + 1,
      };
      inMemoryCategories.push(newCategory);

      return NextResponse.json(newCategory, { status: 201 });
    }
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

    try {
      // Try database first
      await db.quickCategory.delete({
        where: { name },
      });
      return NextResponse.json({ success: true });
    } catch (dbError) {
      console.error("Database error, using in-memory fallback:", dbError);
      // Fallback to in-memory storage
      if (inMemoryCategories === null) {
        inMemoryCategories = getDefaultCategories();
      }
      inMemoryCategories = inMemoryCategories.filter((c) => c.name !== name);
      return NextResponse.json({ success: true });
    }
  } catch (error) {
    console.error("Error deleting quick category:", error);
    return NextResponse.json(
      { error: "Failed to delete quick category" },
      { status: 500 }
    );
  }
}
