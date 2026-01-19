import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { z } from "zod";

/**
 * PATCH /api/settings/criteria/[id] - Update a criterion
 */
const UpdateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  category: z.string().optional(),
  isEnabled: z.boolean().optional(),
  isRequired: z.boolean().optional(),
  weight: z.number().min(1).max(5).optional(),
  promptHint: z.string().optional().nullable(),
  sortOrder: z.number().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const data = UpdateSchema.parse(body);

    const criterion = await db.podcastCriteria.update({
      where: { id },
      data,
    });

    return NextResponse.json(criterion);
  } catch (error) {
    console.error("Error updating criterion:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid data", details: error.issues },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Failed to update criterion" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/settings/criteria/[id] - Delete a criterion (only custom ones)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Check if it's a custom criterion
    const criterion = await db.podcastCriteria.findUnique({
      where: { id },
    });

    if (!criterion) {
      return NextResponse.json(
        { error: "Criterion not found" },
        { status: 404 }
      );
    }

    if (!criterion.isCustom) {
      return NextResponse.json(
        { error: "Cannot delete default criteria. You can disable them instead." },
        { status: 400 }
      );
    }

    await db.podcastCriteria.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting criterion:", error);
    return NextResponse.json(
      { error: "Failed to delete criterion" },
      { status: 500 }
    );
  }
}
