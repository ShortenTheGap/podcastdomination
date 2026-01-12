import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateEmailDraft } from "@/lib/ai";
import { z } from "zod";
import { JOEY_PROFILE_DEFAULT, ANGLE_CONFIG } from "@/lib/constants";

// Define Angle type locally (matches Prisma enum)
type Angle =
  | "FAT_LOSS"
  | "GENERAL_HEALTH"
  | "LONGEVITY"
  | "DADS_PARENTING"
  | "CEO_PERFORMANCE"
  | "PERSONAL_DEVELOPMENT"
  | "EVIDENCE_BASED_NUTRITION"
  | "BODY_RECOMPOSITION";

const generateSchema = z.object({
  podcastId: z.string(),
  angle: z.enum([
    "FAT_LOSS",
    "GENERAL_HEALTH",
    "LONGEVITY",
    "DADS_PARENTING",
    "CEO_PERFORMANCE",
    "PERSONAL_DEVELOPMENT",
    "EVIDENCE_BASED_NUTRITION",
    "BODY_RECOMPOSITION",
  ]),
  leadMagnetId: z.string().optional(),
});

// POST /api/ai/generate-draft - Generate email draft
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { podcastId, angle, leadMagnetId } = generateSchema.parse(body);

    // Get podcast
    const podcast = await db.podcast.findUnique({
      where: { id: podcastId },
    });

    if (!podcast) {
      return NextResponse.json({ error: "Podcast not found" }, { status: 404 });
    }

    // Get Joey's profile
    const joeyProfile = await db.joeyProfile.findFirst();
    const guestProfile = joeyProfile
      ? [
          ...joeyProfile.positioningStatements,
          `Credentials: ${joeyProfile.credibilityAssets.join(", ")}`,
          `Personal: ${joeyProfile.personalTraits.join(", ")}`,
        ].join("\n")
      : JOEY_PROFILE_DEFAULT.positioningStatements.join("\n");

    // Get lead magnet if specified
    const leadMagnet = leadMagnetId
      ? await db.leadMagnet.findUnique({ where: { id: leadMagnetId } })
      : await db.leadMagnet.findFirst({ where: { isDefault: true } });

    // Get angle label
    const angleConfig = ANGLE_CONFIG.find((a) => a.id === angle);
    const angleLabel = angleConfig?.label || angle;

    // Generate draft using AI
    const draft = await generateEmailDraft(
      podcast.showName,
      podcast.hostName || "Podcast Host",
      {
        title: angleLabel,
        hook: podcast.tier2Anchor || `Your show's focus on ${angleLabel.toLowerCase()}`,
        talkingPoints: [...(joeyProfile?.connectionHooks || JOEY_PROFILE_DEFAULT.connectionHooks)],
      },
      guestProfile,
      leadMagnet?.ctaSnippet
    );

    // Update podcast with draft
    const updated = await db.podcast.update({
      where: { id: podcastId },
      data: {
        emailDraft: draft.body,
        emailSubject: draft.subject,
        selectedAngle: angle as Angle,
        selectedLeadMagnet: leadMagnet?.name,
        status: "DRAFTED",
      },
    });

    return NextResponse.json({
      podcastId: updated.id,
      subject: draft.subject,
      body: draft.body,
      angle: angle,
      leadMagnet: leadMagnet?.name,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Error generating draft:", error);
    return NextResponse.json(
      { error: "Failed to generate draft" },
      { status: 500 }
    );
  }
}
