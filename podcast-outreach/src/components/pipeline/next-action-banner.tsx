"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileEdit,
  CheckCircle,
  Send,
  Clock,
  AlertTriangle,
  Sparkles,
  Loader2,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Podcast {
  id: string;
  showName: string;
  hostName: string | null;
  tier: string;
  status: string;
  nextAction: string | null;
  nextActionDate: string | null;
  pendingAnalysis: any | null;
  analysisRunAt: string | null;
  emailDraft: string | null;
  primaryEmail: string | null;
}

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; icon: any; bgColor: string }
> = {
  NOT_CONTACTED: {
    label: "Not Yet Analyzed",
    color: "text-slate-700",
    bgColor: "bg-slate-100",
    icon: Sparkles,
  },
  READY_TO_DRAFT: {
    label: "Ready to Draft",
    color: "text-blue-700",
    bgColor: "bg-blue-100",
    icon: FileEdit,
  },
  DRAFTED: {
    label: "Draft Pending Review",
    color: "text-amber-700",
    bgColor: "bg-amber-100",
    icon: CheckCircle,
  },
  QA_APPROVED: {
    label: "Ready to Send",
    color: "text-green-700",
    bgColor: "bg-green-100",
    icon: Send,
  },
  SENT: {
    label: "Email Sent",
    color: "text-purple-700",
    bgColor: "bg-purple-100",
    icon: Clock,
  },
  FOLLOW_UP_DUE: {
    label: "Follow-up Due",
    color: "text-orange-700",
    bgColor: "bg-orange-100",
    icon: Clock,
  },
  REPLIED: {
    label: "Reply Received",
    color: "text-emerald-700",
    bgColor: "bg-emerald-100",
    icon: CheckCircle,
  },
  CLOSED: {
    label: "Closed",
    color: "text-slate-700",
    bgColor: "bg-slate-100",
    icon: CheckCircle,
  },
};

const ACTION_CONFIG: Record<
  string,
  { label: string; buttonLabel: string; workflowAction: string }
> = {
  DRAFT: {
    label: "Create an email draft",
    buttonLabel: "Generate Draft",
    workflowAction: "GENERATE_DRAFT",
  },
  QA: {
    label: "Review and approve the draft",
    buttonLabel: "Approve Draft",
    workflowAction: "APPROVE_QA",
  },
  SEND: {
    label: "Send the email",
    buttonLabel: "Mark as Sent",
    workflowAction: "SEND_EMAIL",
  },
  FOLLOW_UP: {
    label: "Send a follow-up email",
    buttonLabel: "Send Follow-up",
    workflowAction: "SEND_EMAIL",
  },
  CLOSE: {
    label: "Close this outreach",
    buttonLabel: "Close",
    workflowAction: "MARK_REPLIED",
  },
};

function generateDraftTemplate(podcast: Podcast) {
  const hostName = podcast.hostName || "there";
  const analysis = podcast.pendingAnalysis;
  const anchor = analysis?.tier2Anchor || "";
  const addOn = analysis?.tier1AddOnLine || "";

  const subject = `Guest idea for ${podcast.showName}`;

  const body = `Hey ${hostName},

${anchor}

I'm Joey, founder of Fit4Life Academy. I help busy professionals lose fat and build sustainable habits using an evidence-based approach - no fads, no BS, just what actually works backed by research.

${addOn ? `${addOn}\n\n` : ""}I'd love to share some insights with your audience on [TOPIC BASED ON ANGLE]. Some ideas:

- [Talking point 1]
- [Talking point 2]
- [Talking point 3]

Would you be open to having me on as a guest?

Best,
Joey

P.S. Happy to share my media kit or recent interviews if helpful.`;

  return { subject, body };
}

export function NextActionBanner({
  podcast,
  onNavigateToAnalysis,
  onNavigateToDraft,
}: {
  podcast: Podcast;
  onNavigateToAnalysis?: () => void;
  onNavigateToDraft?: () => void;
}) {
  const queryClient = useQueryClient();

  const statusConfig = STATUS_CONFIG[podcast.status] || STATUS_CONFIG.NOT_CONTACTED;
  const actionConfig = podcast.nextAction ? ACTION_CONFIG[podcast.nextAction] : null;
  const StatusIcon = statusConfig.icon;

  // Workflow action mutation
  const actionMutation = useMutation({
    mutationFn: async (workflowAction: string) => {
      const res = await fetch(`/api/podcasts/${podcast.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflowAction }),
      });
      if (!res.ok) throw new Error("Action failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["podcast", podcast.id] });
      queryClient.invalidateQueries({ queryKey: ["podcasts"] });
    },
  });

  // Determine what action to show based on current state
  const renderAction = () => {
    // If tier is PENDING, show analyze button
    if (podcast.tier === "PENDING" && !podcast.pendingAnalysis) {
      return (
        <button
          onClick={onNavigateToAnalysis}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Sparkles className="h-4 w-4" />
          Run AI Analysis
          <ArrowRight className="h-4 w-4" />
        </button>
      );
    }

    // If analysis exists but not approved, show review button
    if (podcast.tier === "PENDING" && podcast.pendingAnalysis) {
      return (
        <button
          onClick={onNavigateToAnalysis}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <CheckCircle className="h-4 w-4" />
          Review Analysis
          <ArrowRight className="h-4 w-4" />
        </button>
      );
    }

    // If READY_TO_DRAFT, show generate draft button that actually generates
    if (podcast.status === "READY_TO_DRAFT" && !podcast.emailDraft) {
      return (
        <button
          onClick={() => {
            // Generate the draft template
            const template = generateDraftTemplate(podcast);
            // Save it to the database
            fetch(`/api/podcasts/${podcast.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                emailDraft: template.body,
                emailSubject: template.subject,
                workflowAction: "GENERATE_DRAFT",
              }),
            }).then(() => {
              queryClient.invalidateQueries({ queryKey: ["podcast", podcast.id] });
              queryClient.invalidateQueries({ queryKey: ["podcasts"] });
              if (onNavigateToDraft) onNavigateToDraft();
            });
          }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <FileEdit className="h-4 w-4" />
          Generate Draft
          <ArrowRight className="h-4 w-4" />
        </button>
      );
    }

    // If already has draft, just navigate to view it
    if (podcast.status === "READY_TO_DRAFT" && podcast.emailDraft) {
      return (
        <button
          onClick={onNavigateToDraft}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <FileEdit className="h-4 w-4" />
          View Draft
          <ArrowRight className="h-4 w-4" />
        </button>
      );
    }

    // If DRAFTED, show approve button
    if (podcast.status === "DRAFTED") {
      return (
        <button
          onClick={() => actionMutation.mutate("APPROVE_QA")}
          disabled={actionMutation.isPending}
          className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
        >
          {actionMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle className="h-4 w-4" />
          )}
          Approve Draft
        </button>
      );
    }

    // If QA_APPROVED, show send button
    if (podcast.status === "QA_APPROVED") {
      if (!podcast.primaryEmail) {
        return (
          <div className="flex items-center gap-3">
            <span className="text-amber-700 text-sm">
              <AlertTriangle className="h-4 w-4 inline mr-1" />
              No email address - add contact info first
            </span>
          </div>
        );
      }
      return (
        <button
          onClick={() => actionMutation.mutate("SEND_EMAIL")}
          disabled={actionMutation.isPending}
          className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
        >
          {actionMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          Mark as Sent
        </button>
      );
    }

    // Default: show next action if available
    if (actionConfig) {
      return (
        <button
          onClick={() => actionMutation.mutate(actionConfig.workflowAction)}
          disabled={actionMutation.isPending}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {actionMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : null}
          {actionConfig.buttonLabel}
        </button>
      );
    }

    return null;
  };

  return (
    <div
      className={cn(
        "rounded-lg p-4 mb-6 flex items-center justify-between",
        statusConfig.bgColor
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "w-10 h-10 rounded-full flex items-center justify-center bg-white"
          )}
        >
          <StatusIcon className={cn("h-5 w-5", statusConfig.color)} />
        </div>
        <div>
          <p className={cn("font-medium", statusConfig.color)}>
            {statusConfig.label}
          </p>
          {actionConfig && (
            <p className="text-sm text-slate-600">
              Next: {actionConfig.label}
            </p>
          )}
          {podcast.nextActionDate && (
            <p className="text-sm text-slate-500">
              Due: {new Date(podcast.nextActionDate).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>
      <div>{renderAction()}</div>
    </div>
  );
}
