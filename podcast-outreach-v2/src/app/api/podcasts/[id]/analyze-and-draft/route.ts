import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import Anthropic from "@anthropic-ai/sdk";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Guest profile - will be replaced with database-stored profile later
const GUEST_PROFILE = `
Name: Joey
Business: Fit4Life Academy
Credentials: PhD in exercise science/nutrition
Focus: Evidence-based fat loss, body recomposition, sustainable habits
Background: Cuban immigrant, born and raised in Miami
Personal: Dedicated father who balances family and fitness
Style: Anti-BS, practical, measurable results, no hype or fads
Unique Value: Bridges the gap between academic research and practical application
`;

interface Criterion {
  id: string;
  name: string;
  description: string | null;
  category: string;
  isEnabled: boolean;
  isRequired: boolean;
  weight: number;
  promptHint: string | null;
}

/**
 * Build the criteria section for the AI prompt
 */
function buildCriteriaPrompt(criteria: Criterion[]): string {
  const enabledCriteria = criteria.filter((c) => c.isEnabled);

  if (enabledCriteria.length === 0) {
    return `
EVALUATION CRITERIA:
Use your best judgment to determine if this podcast is a good fit for a guest focused on health, fitness, and evidence-based nutrition.
`;
  }

  const requiredCriteria = enabledCriteria.filter((c) => c.isRequired);
  const optionalCriteria = enabledCriteria.filter((c) => !c.isRequired);

  let prompt = `
EVALUATION CRITERIA:

The user has defined specific criteria for their "perfect podcast". Evaluate each criterion carefully.

`;

  if (requiredCriteria.length > 0) {
    prompt += `REQUIRED CRITERIA (must ALL be met, otherwise mark as NOT a fit):
`;
    requiredCriteria.forEach((c, i) => {
      prompt += `${i + 1}. ${c.name}`;
      if (c.description) prompt += ` - ${c.description}`;
      if (c.promptHint) prompt += `\n   Evaluation hint: ${c.promptHint}`;
      prompt += `\n`;
    });
    prompt += `\n`;
  }

  if (optionalCriteria.length > 0) {
    prompt += `ADDITIONAL CRITERIA (influence fit score, weighted by importance):
`;
    optionalCriteria.forEach((c, i) => {
      prompt += `${i + 1}. ${c.name} [Weight: ${c.weight}/5]`;
      if (c.description) prompt += ` - ${c.description}`;
      if (c.promptHint) prompt += `\n   Evaluation hint: ${c.promptHint}`;
      prompt += `\n`;
    });
  }

  return prompt;
}

/**
 * Build the full system prompt with criteria
 */
function buildSystemPrompt(criteria: Criterion[]): string {
  const criteriaPrompt = buildCriteriaPrompt(criteria);

  return `You are an AI assistant helping to evaluate podcasts for guest outreach opportunities.

${GUEST_PROFILE}

${criteriaPrompt}

Your job is to:
1. Evaluate this podcast against ALL the criteria above
2. Determine if it's a GOOD FIT (meets all required criteria and scores well on optional ones)
3. If it's a good fit, write a personalized outreach email

For the email, follow these rules:
- Start with a personalized opening that shows familiarity with the show
- NEVER say "I listened to your episode" or reference transcripts directly
- Keep it concise - busy hosts skim emails
- Focus on value the guest brings to their audience
- End with a clear ask
- Sound human and genuine, not templated

Respond with ONLY a valid JSON object (no markdown, no explanation):
{
  "isGoodFit": true/false,
  "fitScore": number 0-100,
  "fitReason": "Brief explanation of the evaluation",
  "criteriaResults": [
    {"criterion": "name", "met": true/false, "note": "brief note"}
  ],
  "redFlags": ["array of any red flags found"] or [],
  "suggestedAngle": "The best topic angle for this show" or null,
  "emailSubject": "Subject line" or null,
  "emailBody": "Full email body" or null
}`;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY not configured" },
        { status: 500 }
      );
    }

    // Fetch the podcast
    const podcast = await db.podcast.findUnique({ where: { id } });
    if (!podcast) {
      return NextResponse.json({ error: "Podcast not found" }, { status: 404 });
    }

    // Fetch enabled criteria
    let criteria = await db.podcastCriteria.findMany({
      where: { isEnabled: true },
      orderBy: { sortOrder: "asc" },
    });

    // If no criteria exist, seed defaults first
    if (criteria.length === 0) {
      // Trigger the criteria endpoint to seed defaults
      await fetch(new URL("/api/settings/criteria", request.url).toString());
      criteria = await db.podcastCriteria.findMany({
        where: { isEnabled: true },
        orderBy: { sortOrder: "asc" },
      });
    }

    // Build context for AI
    const context = buildContext(podcast);
    const systemPrompt = buildSystemPrompt(criteria);

    // Call Claude
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: context }],
    });

    const responseText = message.content[0].type === "text" ? message.content[0].text : "";

    let analysis;
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found");
      analysis = JSON.parse(jsonMatch[0]);
    } catch {
      console.error("Failed to parse AI response:", responseText);
      return NextResponse.json(
        { error: "Failed to parse AI response" },
        { status: 500 }
      );
    }

    // Update database with results
    const updateData: any = {
      analysisRunAt: new Date(),
      pendingAnalysis: analysis,
    };

    if (analysis.isGoodFit) {
      updateData.status = "READY";
      updateData.emailSubject = analysis.emailSubject;
      updateData.emailDraft = analysis.emailBody;
      updateData.tier = "TIER_2"; // Keep for compatibility
    } else {
      updateData.status = "SKIPPED";
      updateData.tier = "TIER_3";
      updateData.suppressed = true;
      updateData.suppressedAt = new Date();
    }

    const updated = await db.podcast.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      isGoodFit: analysis.isGoodFit,
      fitScore: analysis.fitScore,
      fitReason: analysis.fitReason,
      criteriaResults: analysis.criteriaResults,
      redFlags: analysis.redFlags,
      suggestedAngle: analysis.suggestedAngle,
      emailSubject: analysis.emailSubject,
      emailBody: analysis.emailBody,
      podcast: updated,
    });
  } catch (error) {
    console.error("Error in analyze-and-draft:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Analysis failed" },
      { status: 500 }
    );
  }
}

function buildContext(podcast: any): string {
  const parts = [`Podcast: ${podcast.showName}`];

  if (podcast.hostName) parts.push(`Host: ${podcast.hostName}`);
  if (podcast.showDescription) parts.push(`Description: ${podcast.showDescription}`);
  if (podcast.recentEpisodeTitles?.length) {
    parts.push(`Recent Episodes:\n${podcast.recentEpisodeTitles.map((t: string, i: number) => `  ${i + 1}. ${t}`).join("\n")}`);
  }
  if (podcast.recentGuests?.length) {
    parts.push(`Recent Guests: ${podcast.recentGuests.join(", ")}`);
  }

  parts.push(`\nPodcast URL: ${podcast.primaryPlatformUrl}`);

  return parts.join("\n\n");
}
