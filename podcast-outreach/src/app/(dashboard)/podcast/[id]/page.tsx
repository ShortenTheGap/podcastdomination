"use client";

import { use, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  ArrowLeft,
  ExternalLink,
  Mail,
  Globe,
  Mic2,
  Edit2,
  Save,
  X,
  Loader2,
} from "lucide-react";
import { AnalysisPanel } from "@/components/pipeline/analysis-panel";
import { NextActionBanner } from "@/components/pipeline/next-action-banner";
import { cn } from "@/lib/utils";

interface Props {
  params: Promise<{ id: string }>;
}

export default function PodcastDetailPage({ params }: Props) {
  const { id } = use(params);
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"analysis" | "draft" | "details">("analysis");
  const [isEditingContact, setIsEditingContact] = useState(false);
  const [contactForm, setContactForm] = useState({
    primaryEmail: "",
    hostName: "",
  });

  const { data: podcast, isLoading, error } = useQuery({
    queryKey: ["podcast", id],
    queryFn: async () => {
      const res = await fetch(`/api/podcasts/${id}`);
      if (!res.ok) throw new Error("Failed to fetch podcast");
      return res.json();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch(`/api/podcasts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["podcast", id] });
      setIsEditingContact(false);
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error || !podcast) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">Failed to load podcast</p>
        <Link href="/" className="text-blue-600 hover:underline mt-2 inline-block">
          Back to Pipeline
        </Link>
      </div>
    );
  }

  const handleSaveContact = () => {
    updateMutation.mutate({
      primaryEmail: contactForm.primaryEmail || null,
      hostName: contactForm.hostName || podcast.hostName,
    });
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Back button */}
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Pipeline
      </Link>

      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-lg p-6 mb-6">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 bg-slate-100 rounded-lg flex items-center justify-center">
              <Mic2 className="h-8 w-8 text-slate-400" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">
                {podcast.showName}
              </h1>
              <p className="text-slate-500">{podcast.hostName || "Unknown host"}</p>
              <div className="flex items-center gap-4 mt-2">
                {podcast.applePodcastUrl && (
                  <a
                    href={podcast.applePodcastUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Apple Podcasts
                  </a>
                )}
                {podcast.websiteUrl && (
                  <a
                    href={podcast.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                  >
                    <Globe className="h-3 w-3" />
                    Website
                  </a>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <TierBadge tier={podcast.tier} />
            <StatusBadge status={podcast.status} />
          </div>
        </div>

        {/* Contact info */}
        <div className="mt-6 pt-6 border-t border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-slate-700">Contact Information</h3>
            {!isEditingContact ? (
              <button
                onClick={() => {
                  setContactForm({
                    primaryEmail: podcast.primaryEmail || "",
                    hostName: podcast.hostName || "",
                  });
                  setIsEditingContact(true);
                }}
                className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
              >
                <Edit2 className="h-3 w-3" />
                Edit
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSaveContact}
                  disabled={updateMutation.isPending}
                  className="text-sm text-green-600 hover:text-green-700 flex items-center gap-1"
                >
                  {updateMutation.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Save className="h-3 w-3" />
                  )}
                  Save
                </button>
                <button
                  onClick={() => setIsEditingContact(false)}
                  className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1"
                >
                  <X className="h-3 w-3" />
                  Cancel
                </button>
              </div>
            )}
          </div>
          {isEditingContact ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-500 block mb-1">Host Name</label>
                <input
                  type="text"
                  value={contactForm.hostName}
                  onChange={(e) =>
                    setContactForm({ ...contactForm, hostName: e.target.value })
                  }
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                  placeholder="Enter host name"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Email Address</label>
                <input
                  type="email"
                  value={contactForm.primaryEmail}
                  onChange={(e) =>
                    setContactForm({ ...contactForm, primaryEmail: e.target.value })
                  }
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                  placeholder="Enter email address"
                />
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-slate-400" />
                <span className="text-sm text-slate-700">
                  {podcast.primaryEmail || "No email"}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Next Action Banner */}
      <NextActionBanner
        podcast={podcast}
        onNavigateToAnalysis={() => setActiveTab("analysis")}
        onNavigateToDraft={() => setActiveTab("draft")}
      />

      {/* Tabs */}
      <div className="border-b border-slate-200 mb-6">
        <div className="flex gap-6">
          <button
            onClick={() => setActiveTab("analysis")}
            className={cn(
              "pb-3 text-sm font-medium border-b-2 -mb-px",
              activeTab === "analysis"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            )}
          >
            Analysis & Tiering
          </button>
          <button
            onClick={() => setActiveTab("draft")}
            className={cn(
              "pb-3 text-sm font-medium border-b-2 -mb-px",
              activeTab === "draft"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            )}
          >
            Email Draft
          </button>
          <button
            onClick={() => setActiveTab("details")}
            className={cn(
              "pb-3 text-sm font-medium border-b-2 -mb-px",
              activeTab === "details"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            )}
          >
            Details & Notes
          </button>
        </div>
      </div>

      {/* Tab content */}
      {activeTab === "analysis" && <AnalysisPanel podcast={podcast} />}
      {activeTab === "draft" && <DraftPanel podcast={podcast} />}
      {activeTab === "details" && <DetailsPanel podcast={podcast} />}
    </div>
  );
}

function TierBadge({ tier }: { tier: string }) {
  const colors: Record<string, string> = {
    TIER_1: "bg-emerald-100 text-emerald-700",
    TIER_2: "bg-green-100 text-green-700",
    TIER_3: "bg-red-100 text-red-700",
    PENDING: "bg-slate-100 text-slate-700",
  };

  return (
    <span className={cn("px-2 py-1 rounded text-xs font-medium", colors[tier] || colors.PENDING)}>
      {tier.replace("_", " ")}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    NOT_CONTACTED: "bg-slate-100 text-slate-700",
    READY_TO_DRAFT: "bg-blue-100 text-blue-700",
    DRAFTED: "bg-amber-100 text-amber-700",
    QA_APPROVED: "bg-green-100 text-green-700",
    SENT: "bg-purple-100 text-purple-700",
    REPLIED: "bg-emerald-100 text-emerald-700",
    CLOSED: "bg-slate-100 text-slate-700",
  };

  const label = status.split("_").map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(" ");

  return (
    <span className={cn("px-2 py-1 rounded text-xs font-medium", colors[status] || colors.NOT_CONTACTED)}>
      {label}
    </span>
  );
}

function DraftPanel({ podcast }: { podcast: any }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(podcast.emailDraft || "");
  const [subject, setSubject] = useState(podcast.emailSubject || "");
  const [isEditing, setIsEditing] = useState(false);

  const generateMutation = useMutation({
    mutationFn: async () => {
      // For now, generate a simple template - in the future, this could call an AI endpoint
      const template = generateDraftTemplate(podcast);
      return template;
    },
    onSuccess: (template) => {
      setDraft(template.body);
      setSubject(template.subject);
      setIsEditing(true);
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/podcasts/${podcast.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailDraft: draft,
          emailSubject: subject,
          workflowAction: "GENERATE_DRAFT",
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["podcast", podcast.id] });
      setIsEditing(false);
    },
  });

  if (!podcast.emailDraft && podcast.status === "READY_TO_DRAFT") {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-6 text-center">
        <h3 className="text-lg font-semibold text-slate-900 mb-2">Generate Email Draft</h3>
        <p className="text-slate-500 mb-6">
          Create a personalized outreach email using the analysis results.
        </p>
        <button
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
          className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {generateMutation.isPending ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Edit2 className="h-5 w-5" />
          )}
          Generate Draft
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
        <h3 className="font-semibold text-slate-900">Email Draft</h3>
        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              <button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="text-sm text-green-600 hover:text-green-700 flex items-center gap-1"
              >
                {saveMutation.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Save className="h-3 w-3" />
                )}
                Save Draft
              </button>
              <button
                onClick={() => {
                  setDraft(podcast.emailDraft || "");
                  setSubject(podcast.emailSubject || "");
                  setIsEditing(false);
                }}
                className="text-sm text-slate-500 hover:text-slate-700"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => setIsEditing(true)}
              className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              <Edit2 className="h-3 w-3" />
              Edit
            </button>
          )}
        </div>
      </div>
      <div className="p-6 space-y-4">
        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">Subject</label>
          {isEditing ? (
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full border border-slate-300 rounded px-3 py-2"
              placeholder="Email subject..."
            />
          ) : (
            <p className="text-slate-700">{subject || "No subject"}</p>
          )}
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">Body</label>
          {isEditing ? (
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="w-full border border-slate-300 rounded px-3 py-2 min-h-[300px] font-mono text-sm"
              placeholder="Email body..."
            />
          ) : (
            <div className="bg-slate-50 rounded-lg p-4 whitespace-pre-wrap text-slate-700 font-mono text-sm">
              {draft || "No draft yet"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function generateDraftTemplate(podcast: any) {
  const hostName = podcast.hostName || "there";
  const analysis = podcast.pendingAnalysis;
  const anchor = podcast.tier2Anchor || analysis?.tier2Anchor || "";
  const addOn = podcast.tier1AddOnLine || analysis?.tier1AddOnLine || "";

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

function DetailsPanel({ podcast }: { podcast: any }) {
  return (
    <div className="space-y-6">
      {/* Description */}
      {podcast.showDescription && (
        <div className="bg-white border border-slate-200 rounded-lg p-6">
          <h3 className="font-semibold text-slate-900 mb-3">Show Description</h3>
          <p className="text-slate-600 whitespace-pre-wrap">{podcast.showDescription}</p>
        </div>
      )}

      {/* Episode titles */}
      {podcast.recentEpisodeTitles && podcast.recentEpisodeTitles.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg p-6">
          <h3 className="font-semibold text-slate-900 mb-3">Recent Episodes</h3>
          <ul className="space-y-2">
            {podcast.recentEpisodeTitles.map((title: string, i: number) => (
              <li key={i} className="text-slate-600 text-sm">
                {i + 1}. {title}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Notes */}
      <div className="bg-white border border-slate-200 rounded-lg p-6">
        <h3 className="font-semibold text-slate-900 mb-3">Notes</h3>
        {podcast.notes && podcast.notes.length > 0 ? (
          <div className="space-y-3">
            {podcast.notes.map((note: any) => (
              <div key={note.id} className="bg-slate-50 rounded p-3">
                <p className="text-slate-600 text-sm">{note.content}</p>
                <p className="text-xs text-slate-400 mt-1">
                  {new Date(note.createdAt).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-slate-500 text-sm">No notes yet</p>
        )}
      </div>

      {/* Metadata */}
      <div className="bg-white border border-slate-200 rounded-lg p-6">
        <h3 className="font-semibold text-slate-900 mb-3">Metadata</h3>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-slate-500">Created</dt>
            <dd className="text-slate-700">{new Date(podcast.createdAt).toLocaleDateString()}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Last Updated</dt>
            <dd className="text-slate-700">{new Date(podcast.updatedAt).toLocaleDateString()}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Discovery Source</dt>
            <dd className="text-slate-700">{podcast.discoverySource || "Manual"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Dedupe Key</dt>
            <dd className="text-slate-700 font-mono text-xs">{podcast.dedupeKey}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
