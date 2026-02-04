import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

// Lazy-loaded clients (only initialized when first used, not at build time)
let _anthropic: Anthropic | null = null;
let _openai: OpenAI | null = null;

export function getAnthropicClient(): Anthropic {
  if (!_anthropic) {
    _anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  return _anthropic;
}

export function getOpenAIClient(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return _openai;
}

// Default model configurations
export const AI_CONFIG = {
  claude: {
    model: "claude-sonnet-4-20250514",
    maxTokens: 4096,
  },
  gpt: {
    model: "gpt-4o",
    maxTokens: 4096,
  },
} as const;

// Analyze podcast for pitch angles
export async function analyzePodcastForAngles(
  podcastName: string,
  podcastDescription: string,
  recentEpisodes: { title: string; description?: string }[],
  guestProfile: string
): Promise<{
  angles: Array<{
    title: string;
    description: string;
    hook: string;
    talkingPoints: string[];
    relevanceScore: number;
  }>;
}> {
  const anthropic = getAnthropicClient();
  const episodeContext = recentEpisodes
    .map((ep) => `- ${ep.title}${ep.description ? `: ${ep.description}` : ""}`)
    .join("\n");

  const response = await anthropic.messages.create({
    model: AI_CONFIG.claude.model,
    max_tokens: AI_CONFIG.claude.maxTokens,
    messages: [
      {
        role: "user",
        content: `Analyze this podcast and generate 2-3 compelling pitch angles for a guest appearance.

PODCAST: ${podcastName}
DESCRIPTION: ${podcastDescription}

RECENT EPISODES:
${episodeContext}

GUEST PROFILE:
${guestProfile}

Generate pitch angles that:
1. Align with the podcast's themes and audience
2. Offer unique value the guest can provide
3. Include a compelling hook for the email
4. Have specific talking points

Respond in JSON format:
{
  "angles": [
    {
      "title": "Brief angle title",
      "description": "Why this angle works for this podcast",
      "hook": "Opening sentence for the pitch email",
      "talkingPoints": ["Point 1", "Point 2", "Point 3"],
      "relevanceScore": 0.85
    }
  ]
}`,
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type");
  }

  return JSON.parse(content.text);
}

// Generate personalized email draft
export async function generateEmailDraft(
  podcastName: string,
  hostName: string,
  angle: {
    title: string;
    hook: string;
    talkingPoints: string[];
  },
  guestProfile: string,
  template?: string
): Promise<{
  subject: string;
  body: string;
}> {
  const anthropic = getAnthropicClient();
  const response = await anthropic.messages.create({
    model: AI_CONFIG.claude.model,
    max_tokens: AI_CONFIG.claude.maxTokens,
    messages: [
      {
        role: "user",
        content: `Write a personalized podcast guest pitch email.

PODCAST: ${podcastName}
HOST: ${hostName}
ANGLE: ${angle.title}
HOOK: ${angle.hook}
TALKING POINTS: ${angle.talkingPoints.join(", ")}

GUEST PROFILE:
${guestProfile}

${template ? `USE THIS TEMPLATE STRUCTURE:\n${template}` : ""}

Write a concise, personalized email that:
1. Opens with a genuine connection to their show
2. Clearly states the value proposition
3. Includes 2-3 specific talking points
4. Has a clear call to action
5. Keeps it under 200 words

Respond in JSON format:
{
  "subject": "Email subject line",
  "body": "Full email body"
}`,
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type");
  }

  return JSON.parse(content.text);
}
