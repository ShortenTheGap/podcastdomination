import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import Anthropic from "@anthropic-ai/sdk";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Allow up to 60 seconds for AI analysis

// Joey's profile for the AI prompt
const JOEY_PROFILE = `
Name: Joey
Business: Fit4Life Academy
Credentials: PhD (relevant field in exercise science/nutrition)
Focus: Evidence-based fat loss, body recomposition, sustainable habits
Background: Cuban immigrant, born and raised in Miami
Personal: Dedicated father who balances family and fitness
Style: Anti-BS, practical, measurable results, no hype or fads
Unique Value: Bridges the gap between academic research and practical application
`;

// Tier definitions for the AI
const TIER_DEFINITIONS = `
TIER_2 (Approve for outreach - CAN SEND):
- Show clearly has guests/interviews (not solo content only)
- Topic aligns with fitness, health, wellness, performance, parenting, entrepreneurship, or personal development
- No stop rules triggered
- Enough public information to craft a genuine, natural-sounding anchor statement

TIER_3 (Skip - DO NOT SEND):
- Solo show with no guest interviews
- Topic is off-topic or too niche/unrelated
- Stop rule triggered:
  * POLITICS: Show has strong political content
  * EXPLICIT: Inappropriate adult content
  * PAID_GUEST: Requires payment for guest appearances
  * FRAUD_PSEUDOSCIENCE: Promotes pseudoscience, MLM, or dubious health claims
  * NO_GUESTS: Doesn't feature guest interviews
  * NO_CONTACT_ROUTE: No way to contact the host
- Insufficient evidence to make a reasonable pitch
`;

// Anchor statement rules
const ANCHOR_RULES = `
Rules for generating anchor statements:
1. Make a general statement about the show's focus OR mention a verifiable guest
2. NEVER say: "I listened to your episode", "based on your description", "according to your bio"
3. NEVER reference private information or transcripts directly
4. Sound natural and human, not robotic or templated
5. Keep it brief - 1-2 sentences maximum
6. The statement should demonstrate familiarity without being creepy or stalker-ish
7. Focus on the HOST and their approach, not just the podcast content

Good examples:
- "I can see your show takes a really practical, science-backed approach to sustainable fat loss"
- "Love how you bring on researchers and actually dig into the evidence"
- "Your focus on busy professionals trying to stay fit resonates with my audience"

Bad examples:
- "I listened to your episode with Dr. Smith and loved it" (reveals listening claim)
- "Based on your podcast description..." (too robotic)
- "I noticed in your interview transcript..." (reveals private source)
`;

// Available angles
const AVAILABLE_ANGLES = [
  "FAT_LOSS",
  "BODY_RECOMPOSITION",
  "GENERAL_HEALTH",
  "LONGEVITY",
  "DADS_PARENTING",
  "CEO_PERFORMANCE",
  "EVIDENCE_BASED_NUTRITION",
  "PERSONAL_DEVELOPMENT",
];

interface AnalysisResult {
  tier: "TIER_2" | "TIER_3";
  tierConfidence: number;
  tierReasoning: string;
  primaryAngle: string;
  secondaryAngle: string | null;
  angleReasoning: string;
  tier2Anchor: string | null;
  tier2AnchorEvidence: string | null;
  tier1Possible: boolean;
  tier1AddOnLine: string | null;
  tier1Connection: string | null;
  stopRuleFlags: string[];
  stopRuleDetails: string | null;
  evidenceQuality: {
    hasDescription: boolean;
    hasEpisodeTitles: boolean;
    hasGuestList: boolean;
    hasTranscript: boolean;
    hasHostBio: boolean;
  };
  suggestedHostGreeting: string;
  overallAssessment: string;
}

/**
 * POST /api/podcasts/[id]/analyze - Run AI analysis on a podcast
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Check for Anthropic API key
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY not configured" },
        { status: 500 }
      );
    }

    // Fetch the podcast
    const podcast = await db.podcast.findUnique({
      where: { id },
    });

    if (!podcast) {
      return NextResponse.json({ error: "Podcast not found" }, { status: 404 });
    }

    // Build the evidence context for the AI
    const evidenceContext = buildEvidenceContext(podcast);

    // Create the AI prompt
    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt(podcast, evidenceContext);

    // Call Claude API
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: userPrompt,
        },
      ],
      system: systemPrompt,
    });

    // Parse the AI response
    const responseText =
      message.content[0].type === "text" ? message.content[0].text : "";

    let analysis: AnalysisResult;
    try {
      // Extract JSON from the response (it might be wrapped in markdown code blocks)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }
      analysis = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error("Failed to parse AI response:", responseText);
      return NextResponse.json(
        {
          error: "Failed to parse AI analysis",
          rawResponse: responseText,
        },
        { status: 500 }
      );
    }

    // Store the analysis in the database
    await db.podcast.update({
      where: { id },
      data: {
        pendingAnalysis: analysis as any,
        analysisRunAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      analysis,
      podcast: {
        id: podcast.id,
        showName: podcast.showName,
        hostName: podcast.hostName,
      },
    });
  } catch (error) {
    console.error("Error running AI analysis:", error);
    return NextResponse.json(
      {
        error: "Failed to run AI analysis",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

function buildEvidenceContext(podcast: any): string {
  const parts: string[] = [];

  parts.push(`Show Name: ${podcast.showName}`);

  if (podcast.hostName) {
    parts.push(`Host Name: ${podcast.hostName}`);
  }

  if (podcast.showDescription) {
    parts.push(`Show Description: ${podcast.showDescription}`);
  }

  if (podcast.recentEpisodeTitles && podcast.recentEpisodeTitles.length > 0) {
    parts.push(`Recent Episode Titles:\n${podcast.recentEpisodeTitles.map((t: string, i: number) => `  ${i + 1}. ${t}`).join("\n")}`);
  }

  if (podcast.recentGuests && podcast.recentGuests.length > 0) {
    parts.push(`Recent Guests: ${podcast.recentGuests.join(", ")}`);
  }

  if (podcast.evidenceNotes) {
    parts.push(`Additional Evidence Notes: ${podcast.evidenceNotes}`);
  }

  if (podcast.transcriptContent) {
    // Truncate transcript to avoid token limits
    const truncatedTranscript = podcast.transcriptContent.substring(0, 3000);
    parts.push(`Transcript Excerpt: ${truncatedTranscript}...`);
  }

  return parts.join("\n\n");
}

function buildSystemPrompt(): string {
  return `You are an AI assistant helping to analyze podcasts for guest outreach opportunities.

${JOEY_PROFILE}

${TIER_DEFINITIONS}

${ANCHOR_RULES}

Available angles to choose from: ${AVAILABLE_ANGLES.join(", ")}

Your job is to analyze the provided podcast information and return a structured JSON recommendation.

IMPORTANT: You must respond with ONLY a valid JSON object. Do not include any explanation or markdown formatting outside the JSON.

The JSON must follow this exact structure:
{
  "tier": "TIER_2" or "TIER_3",
  "tierConfidence": number between 0 and 1,
  "tierReasoning": "Brief explanation of tier decision",
  "primaryAngle": "One of the available angles",
  "secondaryAngle": "Another angle or null",
  "angleReasoning": "Why this angle fits",
  "tier2Anchor": "The anchor statement if Tier 2, null if Tier 3",
  "tier2AnchorEvidence": "What evidence supports this anchor",
  "tier1Possible": boolean,
  "tier1AddOnLine": "Strong connection line if Tier 1 possible, null otherwise",
  "tier1Connection": "What makes this a strong connection",
  "stopRuleFlags": ["array of triggered stop rules"],
  "stopRuleDetails": "Details about stop rules if any triggered",
  "evidenceQuality": {
    "hasDescription": boolean,
    "hasEpisodeTitles": boolean,
    "hasGuestList": boolean,
    "hasTranscript": boolean,
    "hasHostBio": boolean
  },
  "suggestedHostGreeting": "Hey [HostName]" or similar,
  "overallAssessment": "One paragraph summary of why this is or isn't a good fit"
}`;
}

function buildUserPrompt(podcast: any, evidenceContext: string): string {
  return `Please analyze this podcast for outreach opportunities:

${evidenceContext}

Primary Platform URL: ${podcast.primaryPlatformUrl}
${podcast.applePodcastUrl ? `Apple Podcasts URL: ${podcast.applePodcastUrl}` : ""}
${podcast.websiteUrl ? `Website: ${podcast.websiteUrl}` : ""}

Based on this information:
1. Determine if this is a TIER_2 (good fit, send outreach) or TIER_3 (skip)
2. If TIER_2, select the best angle from Joey's expertise areas
3. Generate a natural-sounding anchor statement that follows the rules
4. Check for any stop rule violations
5. Assess if there's potential for a TIER_1 strong connection

Remember: Only return the JSON object, no other text.`;
}
