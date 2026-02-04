/**
 * API Route for individual setting operations
 * 
 * GET /api/settings/[key] - Get a specific setting
 * PUT /api/settings/[key] - Update a specific setting
 * DELETE /api/settings/[key] - Delete a specific setting
 */

import { NextRequest, NextResponse } from "next/server";
import { getSetting, setSetting, deleteSetting, maskValue } from "@/lib/settings";
import { withRateLimit } from "@/lib/rate-limiter";
import { db } from "@/lib/db";
import { z } from "zod";

interface RouteParams {
  params: Promise<{ key: string }>;
}

// GET /api/settings/[key] - Get a specific setting
export async function GET(request: NextRequest, { params }: RouteParams) {
  const rateLimitResponse = await withRateLimit(request);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const { key } = await params;
    
    // Get the setting from database
    const dbSetting = await db.setting.findUnique({
      where: { key },
    });
    
    if (dbSetting) {
      // Don't expose the actual secret value
      const value = await getSetting(key);
      return NextResponse.json({
        key,
        maskedValue: dbSetting.isSecret ? maskValue(value || "") : value,
        isSecret: dbSetting.isSecret,
        description: dbSetting.description,
        category: dbSetting.category,
        source: "database",
        exists: true,
      });
    }
    
    // Check environment variable
    const envValue = process.env[key];
    if (envValue) {
      return NextResponse.json({
        key,
        maskedValue: maskValue(envValue),
        isSecret: true,
        description: null,
        category: "general",
        source: "environment",
        exists: true,
      });
    }
    
    return NextResponse.json({
      key,
      exists: false,
    });
  } catch (error) {
    console.error("Error fetching setting:", error);
    return NextResponse.json(
      { error: "Failed to fetch setting" },
      { status: 500 }
    );
  }
}

// Schema for updating a setting
const UpdateSchema = z.object({
  value: z.string(),
  isSecret: z.boolean().optional(),
  description: z.string().optional(),
  category: z.enum(["ai", "email", "discovery", "general"]).optional(),
});

// PUT /api/settings/[key] - Update a specific setting
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const rateLimitResponse = await withRateLimit(request);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const { key } = await params;
    const body = await request.json();
    const data = UpdateSchema.parse(body);
    
    await setSetting(key, data.value, {
      isSecret: data.isSecret,
      description: data.description,
      category: data.category,
    });
    
    return NextResponse.json({
      success: true,
      key,
      maskedValue: data.isSecret !== false ? maskValue(data.value) : data.value,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }
    
    console.error("Error updating setting:", error);
    return NextResponse.json(
      { error: "Failed to update setting" },
      { status: 500 }
    );
  }
}

// DELETE /api/settings/[key] - Delete a specific setting
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const rateLimitResponse = await withRateLimit(request);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const { key } = await params;
    
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

