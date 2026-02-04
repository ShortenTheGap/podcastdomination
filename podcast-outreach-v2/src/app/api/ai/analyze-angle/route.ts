import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

// Define types locally to avoid Prisma client dependency issues
type Angle =
  | "FAT_LOSS"
  | "GENERAL_HEALTH"
  | "LONGEVITY"
  | "DADS_PARENTING"
  | "CEO_PERFORMANCE"
  | "PERSONAL_DEVELOPMENT"
  | "EVIDENCE_BASED_NUTRITION"
  | "BODY_RECOMPOSITION";

type Tier = "PENDING" | "TIER_1" | "TIER_2" | "TIER_3";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const analyzeSchema = z.object({
  podcastId: z.string(),
});

// Valid angles
const VALID_ANGLES: Angle[] = [
  "FAT_LOSS",
  "GENERAL_HEALTH",
  "LONGEVITY",
  "DADS_PARENTING",
  "CEO_PERFORMANCE",
  "PERSONAL_DEVELOPMENT",
  "EVIDENCE_BASED_NUTRITION",
  "BODY_RECOMPOSITION",
];

// POST /api/ai/analyze-angle - Analyze podcast and determine best outreach angle
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { podcastId } = analyzeSchema.parse(body);

    // Fetch podcast from database
    const podcast = await db.podcast.findUnique({
      where: { id: podcastId },
    });

    if (!podcast) {
      return NextResponse.json(
        { error: "Podcast not found" },
        { status: 404 }
      );
    }

    // Check if we have transcript content for Tier 1 analysis
    const hasTranscript =
      podcast.transcriptContent && podcast.transcriptContent.length > 500;

    const systemPrompt = `You are an expert at analyzing podcasts to determine the best outreach angle for Joey, a fitness and health expert with a PhD, who runs Fit4Life Academy.

Joey's positioning:
- Evidence-based fat loss and body recomposition
- PhD-level scientific approach
- Sustainable habits over quick fixes
- Cuban immigrant, born in Miami, dedicated father

Your task is to analyze the podcast information and:
1. Determine if this podcast meets Tier 2 requirements (sufficient evidence to make general claims about the show's focus)
2. Identify the best angle for Joey to pitch
3. ${hasTranscript ? "Look for any strong personal connections in the transcript that could be a Tier 1 add-on" : "No transcript available, so Tier 1 add-on is not possible"}
4. Provide 1-2 anchor statements that are verifiable and do not claim listening

CRITICAL RULES:
- Never suggest claiming "I listened to your episode"
- Never mention transcript, description, titles, catalog, bio in the suggested copy
- Anchors must be general and provable from public information
- If you can't find enough evidence for a general anchor, mark as Tier 3

Output JSON format:
{
  "tier": "TIER_1" | "TIER_2" | "TIER_3",
  "recommendedAngle": "FAT_LOSS" | "GENERAL_HEALTH" | "LONGEVITY" | "DADS_PARENTING" | "CEO_PERFORMANCE" | "PERSONAL_DEVELOPMENT" | "EVIDENCE_BASED_NUTRITION" | "BODY_RECOMPOSITION",
  "backupAngle": "...",
  "tier2Anchor": "I can see your show focuses heavily on...",
  "tier2Evidence": "Show frequently covers topics like X and has had guests discussing Y",
  "tier1AddOnLine": "Also, I noticed that..." | null,
  "tier1Connection": "Description of the connection found" | null,
  "reasoning": "Brief explanation of analysis",
  "riskSignals": ["POTENTIAL_POLITICS", "POTENTIAL_PSEUDOSCIENCE", etc] | []
}`;

    const userContent = `Analyze this podcast:

Show Name: ${podcast.showName}
Host Name: ${podcast.hostName || "Unknown"}
Description: ${podcast.showDescription || "Not available"}
Recent Episode Titles: ${podcast.recentEpisodeTitles?.join(", ") || "Not available"}
Recent Guests: ${podcast.recentGuests?.join(", ") || "Not available"}
${hasTranscript ? `\nTranscript excerpt (for Tier 1 analysis):\n${podcast.transcriptContent?.substring(0, 8000)}` : ""}

Provide your analysis in JSON format.`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: userContent,
        },
      ],
      system: systemPrompt,
    });

    // Extract JSON from response
    const textContent = response.content.find((c) => c.type === "text");
    if (!textContent || textContent.type !== "text") {
      throw new Error("No text response from AI");
    }

    // Parse JSON from response
    const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }

    const analysis = JSON.parse(jsonMatch[0]);

    // Validate and map the recommended angle
    const recommendedAngle = VALID_ANGLES.includes(analysis.recommendedAngle)
      ? (analysis.recommendedAngle as Angle)
      : null;

    // Map tier string to Prisma enum
    const tierMap: Record<string, Tier> = {
      TIER_1: "TIER_1",
      TIER_2: "TIER_2",
      TIER_3: "TIER_3",
    };
    const tier = tierMap[analysis.tier] || "PENDING";

    // Update podcast with analysis results
    const updatedPodcast = await db.podcast.update({
      where: { id: podcastId },
      data: {
        tier: tier,
        tier2Anchor: analysis.tier2Anchor || null,
        tier2EvidenceUrl: analysis.tier2Evidence || null, // Storing evidence text
        tier1AddOnLine: analysis.tier1AddOnLine || null,
        selectedAngle: recommendedAngle,
        // If Tier 3, suppress the podcast
        suppressed: tier === "TIER_3",
        stopRule: tier === "TIER_3" ? "TIER_3_INSUFFICIENT" : podcast.stopRule,
        // Update status if ready for drafting
        status:
          tier === "TIER_1" || tier === "TIER_2"
            ? "READY_TO_DRAFT"
            : podcast.status,
      },
    });

    return NextResponse.json({
      podcastId: updatedPodcast.id,
      showName: updatedPodcast.showName,
      tier: analysis.tier,
      recommendedAngle: analysis.recommendedAngle,
      backupAngle: analysis.backupAngle,
      tier2Anchor: analysis.tier2Anchor,
      tier2Evidence: analysis.tier2Evidence,
      tier1AddOnLine: analysis.tier1AddOnLine,
      tier1Connection: analysis.tier1Connection,
      reasoning: analysis.reasoning,
      riskSignals: analysis.riskSignals || [],
      status: updatedPodcast.status,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Angle analysis error:", error);
    return NextResponse.json(
      { error: "Failed to analyze angle" },
      { status: 500 }
    );
  }
}
