import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const generateSequenceSchema = z.object({
  podcastId: z.string(),
  podcastName: z.string(),
  hostName: z.string().optional(),
  podcastEmail: z.string().optional(),
  // Guest profile info
  guestProfile: z.object({
    name: z.string().optional(),
    title: z.string().optional(),
    company: z.string().optional(),
    bio: z.string().optional(),
    topics: z.string().optional(),
    credentials: z.string().optional(),
    uniqueAngle: z.string().optional(),
  }).optional(),
  // Email settings
  emailSettings: z.object({
    senderName: z.string().optional(),
    signature: z.string().optional(),
    followUp1Days: z.number().optional(),
    followUp2Days: z.number().optional(),
    followUp3Days: z.number().optional(),
  }).optional(),
});

interface GeneratedEmail {
  id: string;
  type: "initial" | "follow_up_1" | "follow_up_2" | "follow_up_3";
  subject: string;
  body: string;
  status: "draft";
  sentAt: null;
  scheduledFor: null;
  openedAt: null;
  repliedAt: null;
}

// POST /api/ai/generate-sequence - Generate full email sequence for a campaign
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      podcastId,
      podcastName,
      hostName,
      guestProfile = {},
      emailSettings = {},
    } = generateSequenceSchema.parse(body);

    // Build guest context for the AI
    const guestContext = [
      guestProfile.name && `Name: ${guestProfile.name}`,
      guestProfile.title && `Title: ${guestProfile.title}`,
      guestProfile.company && `Company: ${guestProfile.company}`,
      guestProfile.bio && `Bio: ${guestProfile.bio}`,
      guestProfile.topics && `Topics I speak about: ${guestProfile.topics}`,
      guestProfile.credentials && `Credentials: ${guestProfile.credentials}`,
      guestProfile.uniqueAngle && `Unique angle: ${guestProfile.uniqueAngle}`,
    ].filter(Boolean).join("\n");

    const followUpSchedule = [
      emailSettings.followUp1Days && `First follow-up: ${emailSettings.followUp1Days} days after initial`,
      emailSettings.followUp2Days && `Second follow-up: ${emailSettings.followUp2Days} days after first follow-up`,
      emailSettings.followUp3Days && `Third follow-up: ${emailSettings.followUp3Days} days after second follow-up`,
    ].filter(Boolean).join("\n");

    const signature = emailSettings.signature || (guestProfile.name ? `Best regards,\n${guestProfile.name}` : "Best regards");

    const systemPrompt = `You are an expert at crafting podcast guest outreach emails. Generate a complete email sequence for pitching to be a guest on a podcast.

The sequence should include:
1. Initial outreach email - personalized, shows you know the podcast
2. Follow-up #1 - gentle check-in, add new value or angle
3. Follow-up #2 - brief, understanding, offer alternative
4. Final follow-up #3 - last attempt, graceful close

RULES:
- Write in first person as the guest
- Be professional but personable
- Each follow-up should be shorter than the previous
- Reference the previous email naturally in follow-ups
- Don't be pushy or salesy
- Focus on value the guest can bring to the podcast's audience
- Keep initial email under 200 words, follow-ups under 150 words each
- Subject lines should be short and not clickbait
- ${signature ? `End emails with: ${signature}` : "Include a professional sign-off"}

OUTPUT FORMAT: Return ONLY valid JSON with this exact structure:
{
  "initial": { "subject": "...", "body": "..." },
  "follow_up_1": { "subject": "...", "body": "..." },
  "follow_up_2": { "subject": "...", "body": "..." },
  "follow_up_3": { "subject": "...", "body": "..." }
}`;

    const userContent = `Generate a complete email outreach sequence for:

PODCAST INFORMATION:
- Show name: ${podcastName}
- Host: ${hostName || "the host"}

GUEST INFORMATION (the person reaching out):
${guestContext || "No specific guest profile provided - write generically but professionally"}

${followUpSchedule ? `FOLLOW-UP SCHEDULE:\n${followUpSchedule}` : ""}

Generate all 4 emails now. Remember to output ONLY valid JSON.`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
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

    const generatedEmails = JSON.parse(jsonMatch[0]);

    // Build the email sequence array
    const emailSequence: GeneratedEmail[] = [
      {
        id: `email-initial-${Date.now()}`,
        type: "initial",
        subject: generatedEmails.initial.subject,
        body: generatedEmails.initial.body,
        status: "draft",
        sentAt: null,
        scheduledFor: null,
        openedAt: null,
        repliedAt: null,
      },
      {
        id: `email-fu1-${Date.now()}`,
        type: "follow_up_1",
        subject: generatedEmails.follow_up_1.subject,
        body: generatedEmails.follow_up_1.body,
        status: "draft",
        sentAt: null,
        scheduledFor: null,
        openedAt: null,
        repliedAt: null,
      },
      {
        id: `email-fu2-${Date.now()}`,
        type: "follow_up_2",
        subject: generatedEmails.follow_up_2.subject,
        body: generatedEmails.follow_up_2.body,
        status: "draft",
        sentAt: null,
        scheduledFor: null,
        openedAt: null,
        repliedAt: null,
      },
      {
        id: `email-fu3-${Date.now()}`,
        type: "follow_up_3",
        subject: generatedEmails.follow_up_3.subject,
        body: generatedEmails.follow_up_3.body,
        status: "draft",
        sentAt: null,
        scheduledFor: null,
        openedAt: null,
        repliedAt: null,
      },
    ];

    return NextResponse.json({
      success: true,
      podcastId,
      emailSequence,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Sequence generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate email sequence" },
      { status: 500 }
    );
  }
}
