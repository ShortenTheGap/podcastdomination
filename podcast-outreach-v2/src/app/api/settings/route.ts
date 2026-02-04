/**
 * API Routes for Settings Management
 * 
 * GET /api/settings - Get all settings (with masked values for secrets)
 * POST /api/settings - Create/update a setting
 * DELETE /api/settings?key=KEY - Delete a setting
 */

import { NextRequest, NextResponse } from "next/server";
import { 
  getAllSettings, 
  getSetting, 
  setSetting, 
  deleteSetting,
  maskValue 
} from "@/lib/settings";
import { withRateLimit } from "@/lib/rate-limiter";
import { z } from "zod";

// GET /api/settings - Get all settings
export async function GET(request: NextRequest) {
  // Apply rate limiting
  const rateLimitResponse = await withRateLimit(request);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const settings = await getAllSettings();
    
    return NextResponse.json({
      settings,
      categories: {
        ai: settings.filter(s => s.category === "ai"),
        email: settings.filter(s => s.category === "email"),
        discovery: settings.filter(s => s.category === "discovery"),
        general: settings.filter(s => s.category === "general"),
      },
    });
  } catch (error) {
    console.error("Error fetching settings:", error);
    return NextResponse.json(
      { error: "Failed to fetch settings" },
      { status: 500 }
    );
  }
}

// Schema for creating/updating a setting
const SettingSchema = z.object({
  key: z.string().min(1).max(100),
  value: z.string(),
  isSecret: z.boolean().optional().default(true),
  description: z.string().optional(),
  category: z.enum(["ai", "email", "discovery", "general"]).optional().default("general"),
});

// POST /api/settings - Create or update a setting
export async function POST(request: NextRequest) {
  // Apply rate limiting
  const rateLimitResponse = await withRateLimit(request);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = await request.json();
    const data = SettingSchema.parse(body);
    
    await setSetting(data.key, data.value, {
      isSecret: data.isSecret,
      description: data.description,
      category: data.category,
    });
    
    return NextResponse.json({
      success: true,
      key: data.key,
      maskedValue: data.isSecret ? maskValue(data.value) : data.value,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }
    
    console.error("Error saving setting:", error);
    return NextResponse.json(
      { error: "Failed to save setting" },
      { status: 500 }
    );
  }
}

// DELETE /api/settings?key=KEY - Delete a setting
export async function DELETE(request: NextRequest) {
  // Apply rate limiting
  const rateLimitResponse = await withRateLimit(request);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const key = request.nextUrl.searchParams.get("key");
    
    if (!key) {
      return NextResponse.json(
        { error: "Missing key parameter" },
        { status: 400 }
      );
    }
    
    await deleteSetting(key);
    
    return NextResponse.json({
      success: true,
      message: `Setting ${key} deleted`,
    });
  } catch (error) {
    console.error("Error deleting setting:", error);
    return NextResponse.json(
      { error: "Failed to delete setting" },
      { status: 500 }
    );
  }
}

