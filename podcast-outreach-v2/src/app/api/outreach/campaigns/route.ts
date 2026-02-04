import { NextRequest, NextResponse } from "next/server";
import {
  getDemoCampaignsAsync,
  updateDemoCampaignAsync,
  syncDemoCampaigns,
  DemoCampaign,
} from "@/lib/demo-campaigns";

// Re-export for backwards compatibility
export { getDemoCampaignsAsync as getInMemoryCampaigns, updateDemoCampaignAsync as updateInMemoryCampaign };

export async function GET() {
  try {
    // ALWAYS use the campaign storage as the single source of truth
    // This ensures consistency between reads (GET) and writes (PUT/POST)
    // The storage layer now uses PostgreSQL on Railway for persistence
    const campaigns = await getDemoCampaignsAsync();
    return NextResponse.json({ campaigns });
  } catch (error) {
    console.error("Error fetching campaigns:", error);
    return NextResponse.json({ campaigns: [] });
  }
}

export async function POST(request: NextRequest) {
  try {
    // Handle both JSON and text/plain (from sendBeacon)
    const contentType = request.headers.get("content-type") || "";
    let body;

    if (contentType.includes("application/json")) {
      body = await request.json();
    } else {
      // sendBeacon sends as text/plain
      const text = await request.text();
      try {
        body = JSON.parse(text);
      } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
      }
    }

    const { campaigns } = body;

    // Handle bulk sync action (from sendBeacon or regular POST)
    // sendBeacon will send { campaigns: [...] } directly
    if (campaigns && Array.isArray(campaigns)) {
      await syncDemoCampaigns(campaigns as DemoCampaign[]);
      return NextResponse.json({
        success: true,
        message: `Synced ${campaigns.length} campaigns`,
      });
    }

    return NextResponse.json({ error: "Campaigns array required" }, { status: 400 });
  } catch (error) {
    console.error("Error updating campaign:", error);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}

// PUT endpoint for syncing full campaign data
// Uses PostgreSQL database for persistence (survives Railway restarts)
export async function PUT(request: NextRequest) {
  try {
    // Handle both JSON and text/plain (from sendBeacon)
    const contentType = request.headers.get("content-type") || "";
    let data;

    if (contentType.includes("application/json")) {
      data = await request.json();
    } else {
      // sendBeacon sends as text/plain
      const text = await request.text();
      try {
        data = JSON.parse(text);
      } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
      }
    }

    const { campaigns } = data;

    if (!campaigns || !Array.isArray(campaigns)) {
      return NextResponse.json({ error: "Campaigns array required" }, { status: 400 });
    }

    // Sync all campaigns to database
    await syncDemoCampaigns(campaigns as DemoCampaign[]);

    return NextResponse.json({
      success: true,
      message: `Synced ${campaigns.length} campaigns to database`,
    });
  } catch (error) {
    console.error("Error syncing campaigns:", error);
    return NextResponse.json({ error: "Failed to sync campaigns" }, { status: 500 });
  }
}
