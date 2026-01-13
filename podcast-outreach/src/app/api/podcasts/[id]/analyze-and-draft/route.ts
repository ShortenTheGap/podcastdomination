import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import Anthropic from "@anthropic-ai/sdk";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const JOEY_PROFILE = `
Name: Joey
Business: Fit4Life Academy
Credentials: PhD in exercise science/nutrition
Focus: Evidence-based fat loss, body recomposition, sustainable habits
Background: Cuban immigrant, born and raised in Miami
Personal: Dedicated father who balances family and fitness
Style: Anti-BS, practical, measurable results, no hype or fads
Unique Value: Bridges the gap between academic research and practical application
`;

const SYSTEM_PROMPT = `You are an AI assistant helping Joey evaluate podcasts for guest outreach.

${JOEY_PROFILE}

Your job is to:
1. Analyze if this podcast is a GOOD FIT for Joey as a guest
2. If it's a good fit, write a personalized outreach email

A podcast is a GOOD FIT if:
- It features guest interviews (not solo content only)
- Topics align with: fitness, health, wellness, nutrition, parenting, entrepreneurship, personal development, or performance
- No red flags: political content, explicit content, paid guest spots, pseudoscience/MLM promotion

A podcast is NOT A FIT if any red flags exist or topics don't align.

For the email, follow these rules:
- Start with a personalized opening that shows familiarity with the show (but NEVER say "I listened to your episode" or reference transcripts)
- Keep it concise - busy hosts skim emails
- Focus on value Joey brings to their audience
- End with a clear ask
- Sound human and genuine, not templated

Respond with ONLY a valid JSON object (no markdown, no explanation):
{
  "isGoodFit": true/false,
  "fitReason": "Brief explanation of why this is or isn't a good fit",
  "redFlags": ["array of any red flags found"] or [],
  "suggestedAngle": "The best topic angle for this show" or null,
  "emailSubject": "Subject line" or null,
  "emailBody": "Full email body" or null
}`;

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

    const podcast = await db.podcast.findUnique({ where: { id } });
    if (!podcast) {
      return NextResponse.json({ error: "Podcast not found" }, { status: 404 });
    }

    // Build context for AI
    const context = buildContext(podcast);

    // Call Claude
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
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
      fitReason: analysis.fitReason,
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
