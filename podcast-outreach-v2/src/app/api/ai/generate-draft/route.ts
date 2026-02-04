import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { CLAIM_RULES } from "@/lib/constants";
import { withRateLimit } from "@/lib/rate-limiter";
import { getSetting } from "@/lib/settings";

const generateSchema = z.object({
  podcastId: z.string(),
  leadMagnetId: z.string().optional(),
});

// POST /api/ai/generate-draft - Generate email draft for a podcast
export async function POST(request: NextRequest) {
  // Apply rate limiting (AI routes are expensive)
  const rateLimitResponse = await withRateLimit(request);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    // Get API key from settings (database) or fallback to env
    const apiKey = await getSetting("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return NextResponse.json(
        { error: "Anthropic API key not configured" },
        { status: 500 }
      );
    }
    
    const anthropic = new Anthropic({ apiKey });
    const body = await request.json();
    const { podcastId, leadMagnetId } = generateSchema.parse(body);

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

    // Check tier - don't draft for Tier 3 or PENDING
    if (podcast.tier === "TIER_3" || podcast.tier === "PENDING") {
      return NextResponse.json(
        { error: `Cannot draft for ${podcast.tier} podcasts. Run analysis first.` },
        { status: 400 }
      );
    }

    // Check for required tier2Anchor
    if (!podcast.tier2Anchor) {
      return NextResponse.json(
        { error: "No tier2Anchor found. Run analysis first." },
        { status: 400 }
      );
    }

    // Get lead magnet if specified, otherwise use default
    const leadMagnet = leadMagnetId
      ? await db.leadMagnet.findUnique({ where: { id: leadMagnetId } })
      : await db.leadMagnet.findFirst({ where: { isDefault: true } });

    // Get angle label for the prompt
    const angleLabels: Record<string, string> = {
      FAT_LOSS: "Fat Loss",
      GENERAL_HEALTH: "General Health",
      LONGEVITY: "Longevity",
      DADS_PARENTING: "Dads & Parenting",
      CEO_PERFORMANCE: "CEO Performance",
      PERSONAL_DEVELOPMENT: "Personal Development",
      EVIDENCE_BASED_NUTRITION: "Evidence-Based Nutrition",
      BODY_RECOMPOSITION: "Body Recomposition",
    };
    const angleLabel = podcast.selectedAngle
      ? angleLabels[podcast.selectedAngle] || podcast.selectedAngle
      : "General Health";

    const systemPrompt = `You are writing an email AS Joey, a fitness and health expert with a PhD who runs Fit4Life Academy. Write in FIRST PERSON.

Joey's voice characteristics:
- Professional but personable
- Evidence-based, no hype
- Direct and concise
- Cuban immigrant background, born in Miami
- Dedicated father who balances family and fitness

ABSOLUTE RULES (violating these = failure):
1. Write in FIRST PERSON as Joey ("I", "my", "me")
2. NEVER use: ${CLAIM_RULES.FORBIDDEN_PHRASES.map((p) => `"${p}"`).join(", ")}
3. NEVER mention: transcript, transcription, description, titles, catalog, bio, trailer
4. The email should sound like Joey knows the show's focus WITHOUT explaining how he knows
5. Keep anchors general and human - no micro-details
6. Maximum 2 anchors (1 required Tier 2, 1 optional Tier 1 add-on)
7. Simple CTA: ask if they accept guests and best channel to coordinate
8. Keep it under 200 words
9. No links in the first email unless specifically requested
10. No attachments, no formatting, plain text only

TONE: Professional, direct, human - like a colleague reaching out, not a sales pitch.`;

    const userContent = `Write an outreach email for:

Show: ${podcast.showName}
Host: ${podcast.hostName || "the host"}
Tier 2 Anchor to use: ${podcast.tier2Anchor}
${podcast.tier1AddOnLine ? `Tier 1 Add-on (optional, only use if it flows naturally): ${podcast.tier1AddOnLine}` : "No Tier 1 add-on available"}
Angle: ${angleLabel}
${leadMagnet ? `Lead Magnet (mention only if natural): ${leadMagnet.name}` : ""}

Generate:
1. Subject line (keep short, no clickbait)
2. Email body (in Joey's first-person voice)
3. One follow-up email (shorter, reference the first)

Format as JSON:
{
  "subject": "...",
  "body": "...",
  "followUp": "..."
}`;

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

    const draft = JSON.parse(jsonMatch[0]);

    // Validate against forbidden phrases
    const combinedText =
      `${draft.subject} ${draft.body} ${draft.followUp}`.toLowerCase();
    const violations = CLAIM_RULES.FORBIDDEN_PHRASES.filter((phrase) =>
      combinedText.includes(phrase.toLowerCase())
    );

    if (violations.length > 0) {
      // Log the violation but try to regenerate or return error
      console.error("Draft contains forbidden phrases:", violations);
      return NextResponse.json(
        {
          error: "Draft contains forbidden phrases - regeneration needed",
          violations,
        },
        { status: 400 }
      );
    }

    // Update podcast with draft
    const updatedPodcast = await db.podcast.update({
      where: { id: podcastId },
      data: {
        emailSubject: draft.subject,
        emailDraft: draft.body,
        selectedLeadMagnet: leadMagnet?.name || null,
        status: "DRAFTED",
      },
    });

    return NextResponse.json({
      podcastId: updatedPodcast.id,
      showName: updatedPodcast.showName,
      subject: draft.subject,
      body: draft.body,
      followUp: draft.followUp,
      leadMagnet: leadMagnet?.name || null,
      status: updatedPodcast.status,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Draft generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate draft" },
      { status: 500 }
    );
  }
}
