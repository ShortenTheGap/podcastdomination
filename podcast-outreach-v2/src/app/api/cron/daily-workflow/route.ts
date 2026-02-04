import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { SENDING_RULES } from "@/lib/constants";

// Day-specific automated tasks
const DAY_TASKS: Record<number, string[]> = {
  1: ["safety-filter"], // Monday
  2: ["transcript-retrieval", "ai-angle-analysis", "assign-tiers"], // Tuesday
  3: ["ai-draft-generation"], // Wednesday
  4: ["qa-checklist", "send-emails", "log-sends"], // Thursday
  5: ["send-followups", "escalate-backup"], // Friday
};

// GET /api/cron/daily-workflow - Run all automated tasks for today
export async function GET() {
  try {
    const today = new Date().getDay();
    const tasks = DAY_TASKS[today] || [];

    if (tasks.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No automated tasks scheduled for today",
        day: today,
      });
    }

    const results: Record<string, { success: boolean; count?: number; error?: string }> = {};

    for (const taskId of tasks) {
      try {
        const result = await runTask(taskId);
        results[taskId] = { success: true, ...result };
      } catch (error) {
        results[taskId] = {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }

    return NextResponse.json({
      success: true,
      day: today,
      tasksRun: tasks,
      results,
    });
  } catch (error) {
    console.error("Daily workflow error:", error);
    return NextResponse.json(
      { error: "Failed to run daily workflow" },
      { status: 500 }
    );
  }
}

// POST /api/cron/daily-workflow - Run a specific task manually
export async function POST(request: NextRequest) {
  try {
    const { taskId } = await request.json();

    if (!taskId) {
      return NextResponse.json(
        { error: "taskId is required" },
        { status: 400 }
      );
    }

    const result = await runTask(taskId);

    return NextResponse.json({
      success: true,
      taskId,
      ...result,
    });
  } catch (error) {
    console.error("Task execution error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to run task" },
      { status: 500 }
    );
  }
}

async function runTask(taskId: string): Promise<{ count?: number; message?: string }> {
  switch (taskId) {
    case "safety-filter":
      return await runSafetyFilter();

    case "transcript-retrieval":
      return await runTranscriptRetrieval();

    case "ai-angle-analysis":
      return await runAngleAnalysis();

    case "assign-tiers":
      return await runTierAssignment();

    case "ai-draft-generation":
      return await runDraftGeneration();

    case "qa-checklist":
      return await runQAChecklist();

    case "send-emails":
      return await runEmailSending();

    case "send-followups":
      return await runFollowUps();

    case "escalate-backup":
      return await runEscalation();

    default:
      throw new Error(`Unknown task: ${taskId}`);
  }
}

// Monday: Safety Filter - Check new podcasts for stop rules
async function runSafetyFilter(): Promise<{ count: number }> {
  const newPodcasts = await db.podcast.findMany({
    where: {
      isNew: true,
      suppressed: false,
      stopRule: "NONE",
    },
  });

  let flagged = 0;

  for (const podcast of newPodcasts) {
    // Check for obvious red flags in description
    const description = (podcast.showDescription || "").toLowerCase();
    const name = (podcast.showName || "").toLowerCase();

    let stopRule = null;

    // Check for politics
    if (
      description.includes("political") ||
      description.includes("democrat") ||
      description.includes("republican") ||
      description.includes("maga") ||
      description.includes("liberal agenda")
    ) {
      stopRule = "POLITICS";
    }

    // Check for explicit content
    if (
      description.includes("explicit") ||
      description.includes("adult content") ||
      description.includes("nsfw")
    ) {
      stopRule = "EXPLICIT";
    }

    // Check for paid guest spots
    if (
      description.includes("pay to appear") ||
      description.includes("guest fee") ||
      description.includes("sponsored guest")
    ) {
      stopRule = "PAID_GUEST";
    }

    // Check for no-guest shows
    if (
      description.includes("solo podcast") ||
      description.includes("no interviews") ||
      description.includes("no guests")
    ) {
      stopRule = "NO_GUESTS";
    }

    if (stopRule) {
      await db.podcast.update({
        where: { id: podcast.id },
        data: {
          stopRule,
          suppressed: true,
          suppressedAt: new Date(),
          suppressionEvidence: `Auto-detected via safety filter: ${stopRule}`,
        },
      });
      flagged++;
    }

    // Mark as no longer new after processing
    await db.podcast.update({
      where: { id: podcast.id },
      data: { isNew: false },
    });
  }

  return { count: flagged };
}

// Tuesday: Transcript Retrieval - Placeholder for transcript fetching
async function runTranscriptRetrieval(): Promise<{ count: number; message: string }> {
  const podcasts = await db.podcast.findMany({
    where: {
      tier: "PENDING",
      suppressed: false,
      transcriptContent: null,
    },
    take: 20, // Process in batches
  });

  // In production, this would call the Python transcript_fetcher
  // For now, just return the count of podcasts needing transcripts
  return {
    count: podcasts.length,
    message: "Transcript retrieval requires Python scraper integration",
  };
}

// Tuesday: AI Angle Analysis - Trigger angle analysis for pending podcasts
async function runAngleAnalysis(): Promise<{ count: number }> {
  const podcasts = await db.podcast.findMany({
    where: {
      tier: "PENDING",
      suppressed: false,
      selectedAngle: null,
    },
    take: 10, // Process in batches to respect rate limits
  });

  let analyzed = 0;

  for (const podcast of podcasts) {
    try {
      // Call the angle analysis API
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/ai/analyze-angle`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ podcastId: podcast.id }),
        }
      );

      if (res.ok) {
        analyzed++;
      }
    } catch (error) {
      console.error(`Failed to analyze podcast ${podcast.id}:`, error);
    }
  }

  return { count: analyzed };
}

// Tuesday: Tier Assignment - Handled by angle analysis
async function runTierAssignment(): Promise<{ message: string }> {
  return { message: "Tier assignment is handled automatically by angle analysis" };
}

// Wednesday: Draft Generation - Generate drafts for ready podcasts
async function runDraftGeneration(): Promise<{ count: number }> {
  const podcasts = await db.podcast.findMany({
    where: {
      status: "READY_TO_DRAFT",
      tier: { in: ["TIER_1", "TIER_2"] },
      emailDraft: null,
      suppressed: false,
    },
    take: 10,
  });

  let drafted = 0;

  for (const podcast of podcasts) {
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/ai/generate-draft`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ podcastId: podcast.id }),
        }
      );

      if (res.ok) {
        drafted++;
      }
    } catch (error) {
      console.error(`Failed to draft for podcast ${podcast.id}:`, error);
    }
  }

  return { count: drafted };
}

// Thursday: QA Checklist - Auto-run QA checks on drafted emails
async function runQAChecklist(): Promise<{ count: number }> {
  const podcasts = await db.podcast.findMany({
    where: {
      status: "DRAFTED",
      emailDraft: { not: null },
      qaStatus: "NOT_READY",
    },
  });

  let checked = 0;

  for (const podcast of podcasts) {
    // Run automated QA checks
    const qaResults = runAutoQAChecks(podcast);

    await db.podcast.update({
      where: { id: podcast.id },
      data: {
        qaStatus: qaResults.passed ? "PENDING_REVIEW" : "NEEDS_REVISION",
        qaChecklist: qaResults.checks,
      },
    });

    checked++;
  }

  return { count: checked };
}

interface QACheckResult {
  passed: boolean;
  checks: Record<string, boolean>;
}

function runAutoQAChecks(podcast: {
  emailDraft: string | null;
  tier: string;
  tier1AddOnLine: string | null;
}): QACheckResult {
  const draft = podcast.emailDraft || "";
  const draftLower = draft.toLowerCase();

  // Forbidden phrases check
  const forbiddenPhrases = [
    "i listened to your episode",
    "i was listening to you",
    "i heard your episode",
    "i read the transcript",
    "according to the transcript",
    "based on the description",
    "based on the titles",
    "reviewing your catalog",
    "according to your bio",
    "based on your trailer",
  ];

  const noListening = !forbiddenPhrases.some((phrase) =>
    draftLower.includes(phrase)
  );

  // First person voice check
  const hasFirstPerson = draft.includes("I ") || draft.includes("I'm") || draft.includes("my ");

  // Tier requirements
  const tier2Met = podcast.tier === "TIER_1" || podcast.tier === "TIER_2";
  const tier1Valid = podcast.tier !== "TIER_1" || (podcast.tier1AddOnLine && podcast.tier1AddOnLine.length > 10);

  // Check for excessive links
  const linkCount = (draft.match(/https?:\/\//g) || []).length;
  const deliverability = linkCount <= 2;

  const checks = {
    noListening,
    voice: hasFirstPerson,
    tier2Met,
    tier1Valid: tier1Valid || false,
    deliverability,
  };

  const passed = noListening && hasFirstPerson && tier2Met && deliverability;

  return { passed, checks };
}

// Thursday: Email Sending - Send approved emails respecting daily cap
async function runEmailSending(): Promise<{ count: number }> {
  // Check how many already sent today
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const sentToday = await db.touch.count({
    where: {
      sentAt: { gte: today },
      type: "PRIMARY",
    },
  });

  const remaining = SENDING_RULES.DAILY_CAP - sentToday;

  if (remaining <= 0) {
    return { count: 0 };
  }

  const podcasts = await db.podcast.findMany({
    where: {
      status: "QA_APPROVED",
      qaStatus: "PASS",
      sentPrimaryAt: null,
      primaryEmail: { not: null },
    },
    take: remaining,
  });

  // In production, this would trigger the send API
  // For now, just return the count of emails ready to send
  return {
    count: podcasts.length,
  };
}

// Friday: Follow-ups - Mark as due AND trigger actual sending
async function runFollowUps(): Promise<{ count: number; sent: number }> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - SENDING_RULES.FOLLOW_UP_DELAY_DAYS);

  const podcasts = await db.podcast.findMany({
    where: {
      status: "SENT",
      sentPrimaryAt: { lte: cutoffDate },
      followUpSentAt: null,
      replyReceivedAt: null,
      suppressed: false,
    },
  });

  // Mark as follow-up due
  let updated = 0;
  for (const podcast of podcasts) {
    await db.podcast.update({
      where: { id: podcast.id },
      data: {
        status: "FOLLOW_UP_DUE",
        nextAction: "FOLLOW_UP",
      },
    });
    updated++;
  }

  // NOW ACTUALLY SEND THE EMAILS by calling the send-scheduled-emails cron
  let sent = 0;
  if (updated > 0) {
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      const cronSecret = process.env.CRON_SECRET;
      
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (cronSecret) {
        headers["Authorization"] = `Bearer ${cronSecret}`;
      }

      const res = await fetch(`${appUrl}/api/cron/send-scheduled-emails`, {
        method: "GET",
        headers,
      });

      if (res.ok) {
        const result = await res.json();
        sent = result.results?.filter((r: { success: boolean }) => r.success).length || 0;
        console.log(`[Daily Workflow] Triggered send-scheduled-emails, sent ${sent} emails`);
      }
    } catch (error) {
      console.error("[Daily Workflow] Failed to trigger send-scheduled-emails:", error);
    }
  }

  return { count: updated, sent };
}

// Friday: Escalation - Escalate to backup contacts
async function runEscalation(): Promise<{ count: number; message?: string }> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - SENDING_RULES.ESCALATION_DELAY_DAYS);

  const podcasts = await db.podcast.findMany({
    where: {
      status: "FOLLOW_UP_SENT",
      followUpSentAt: { lte: cutoffDate },
      sentBackupAt: null,
      backupEmail: { not: null },
      replyReceivedAt: null,
      suppressed: false,
    },
  });

  // Mark as escalation due
  let updated = 0;
  for (const podcast of podcasts) {
    await db.podcast.update({
      where: { id: podcast.id },
      data: {
        status: "ESCALATION_DUE",
        nextAction: "ESCALATE",
      },
    });
    updated++;
  }

  // The send-scheduled-emails cron will pick these up and send them
  return { 
    count: updated,
    message: updated > 0 ? "Escalations marked, will be sent by send-scheduled-emails cron" : "No escalations due",
  };
}
