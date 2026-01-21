import { NextRequest, NextResponse } from "next/server";
import {
  getDemoCampaignsAsync,
  syncDemoCampaigns,
  DemoCampaign,
} from "@/lib/demo-campaigns";

/**
 * POST /api/outreach/campaigns/add - Add a podcast to outreach campaigns
 * Creates a new campaign in the "not_started" stage
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      podcastId,
      showName,
      hostName,
      primaryEmail,
      tier = "TIER_2"
    } = body;

    if (!podcastId || !showName) {
      return NextResponse.json(
        { error: "podcastId and showName are required" },
        { status: 400 }
      );
    }

    // Get existing campaigns
    const campaigns = await getDemoCampaignsAsync();

    // Check if podcast already exists in campaigns
    const existingCampaign = campaigns.find((c: DemoCampaign) => c.id === podcastId);
    if (existingCampaign) {
      return NextResponse.json(
        { error: "Podcast already exists in outreach", campaign: existingCampaign },
        { status: 409 }
      );
    }

    // Create new campaign
    const newCampaign: DemoCampaign = {
      id: podcastId,
      showName,
      hostName: hostName || null,
      primaryEmail: primaryEmail || null,
      tier,
      status: "not_started",
      responseType: null,
      emailSequence: [],
      lastContactedAt: null,
      nextFollowUpAt: null,
      createdAt: new Date().toISOString(),
    };

    // Add to campaigns and sync
    const updatedCampaigns = [...campaigns, newCampaign];
    await syncDemoCampaigns(updatedCampaigns);

    return NextResponse.json({
      success: true,
      message: "Podcast added to outreach",
      campaign: newCampaign,
    });
  } catch (error) {
    console.error("Error adding podcast to outreach:", error);
    return NextResponse.json(
      { error: "Failed to add podcast to outreach" },
      { status: 500 }
    );
  }
}
