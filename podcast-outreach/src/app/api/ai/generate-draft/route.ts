import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateEmailDraft } from "@/lib/ai";
import { parseJSON } from "@/lib/utils";
import { z } from "zod";

const generateSchema = z.object({
  podcastId: z.string(),
  angleId: z.string(),
  contactId: z.string().optional(),
  templateId: z.string().optional(),
});

// POST /api/ai/generate-draft - Generate email draft
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { podcastId, angleId, contactId, templateId } = generateSchema.parse(body);

    // Get podcast, angle, and optional contact
    const [podcast, angle, contact, template] = await Promise.all([
      db.podcast.findUnique({ where: { id: podcastId } }),
      db.angle.findUnique({ where: { id: angleId } }),
      contactId ? db.contact.findUnique({ where: { id: contactId } }) : null,
      templateId ? db.emailTemplate.findUnique({ where: { id: templateId } }) : null,
    ]);

    if (!podcast) {
      return NextResponse.json({ error: "Podcast not found" }, { status: 404 });
    }

    if (!angle) {
      return NextResponse.json({ error: "Angle not found" }, { status: 404 });
    }

    // Get guest profile from settings
    const settings = await db.settings.findUnique({
      where: { key: "guestProfile" },
    });
    const guestProfile = settings?.value || "A business professional seeking podcast opportunities.";

    // Generate draft using AI
    const draft = await generateEmailDraft(
      podcast.name,
      contact?.name || "Podcast Host",
      {
        title: angle.title,
        hook: angle.hook,
        talkingPoints: parseJSON<string[]>(angle.talkingPoints, []),
      },
      guestProfile,
      template?.body
    );

    // Find or create outreach record
    let outreach = await db.outreach.findFirst({
      where: {
        podcastId,
        status: { in: ["discovered", "researched"] },
      },
    });

    if (outreach) {
      outreach = await db.outreach.update({
        where: { id: outreach.id },
        data: {
          angleId,
          contactId,
          subject: draft.subject,
          body: draft.body,
          status: "drafted",
        },
      });
    } else {
      outreach = await db.outreach.create({
        data: {
          podcastId,
          angleId,
          contactId,
          subject: draft.subject,
          body: draft.body,
          status: "drafted",
        },
      });
    }

    return NextResponse.json({
      outreachId: outreach.id,
      subject: draft.subject,
      body: draft.body,
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
