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
  Sparkles,
  CheckCircle,
  AlertTriangle,
  Send,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  params: Promise<{ id: string }>;
}

export default function PodcastDetailPage({ params }: Props) {
  const { id } = use(params);
  const queryClient = useQueryClient();
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [isEditingContact, setIsEditingContact] = useState(false);
  const [emailDraft, setEmailDraft] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [contactForm, setContactForm] = useState({ primaryEmail: "", hostName: "" });

  const { data: podcast, isLoading, error } = useQuery({
    queryKey: ["podcast", id],
    queryFn: async () => {
      const res = await fetch(`/api/podcasts/${id}`);
      if (!res.ok) throw new Error("Failed to fetch podcast");
      return res.json();
    },
    staleTime: 0,
  });

  // Initialize email state when podcast loads
  useState(() => {
    if (podcast) {
      setEmailDraft(podcast.emailDraft || "");
      setEmailSubject(podcast.emailSubject || "");
    }
  });

  // Analyze & Draft mutation
  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/podcasts/${id}/analyze-and-draft`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Analysis failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["podcast", id] });
      queryClient.invalidateQueries({ queryKey: ["podcasts"] });
      if (data.emailBody) {
        setEmailDraft(data.emailBody);
        setEmailSubject(data.emailSubject || "");
      }
    },
  });

  // Save email draft
  const saveDraftMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/podcasts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailDraft,
          emailSubject,
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["podcast", id] });
      setIsEditingEmail(false);
    },
  });

  // Mark as sent
  const sendMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/podcasts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "SENT",
          sentPrimaryAt: new Date().toISOString(),
        }),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["podcast", id] });
      queryClient.invalidateQueries({ queryKey: ["podcasts"] });
    },
  });

  // Skip podcast
  const skipMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/podcasts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "SKIPPED",
          suppressed: true,
          suppressedAt: new Date().toISOString(),
        }),
      });
      if (!res.ok) throw new Error("Failed to skip");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["podcast", id] });
      queryClient.invalidateQueries({ queryKey: ["podcasts"] });
    },
  });

  // Update contact info
  const updateContactMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/podcasts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primaryEmail: contactForm.primaryEmail || null,
          hostName: contactForm.hostName || podcast.hostName,
        }),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["podcast", id] });
      setIsEditingContact(false);
    },
  });

  // Reanalyze (for skipped podcasts)
  const reanalyzeMutation = useMutation({
    mutationFn: async () => {
      // Reset status first
      await fetch(`/api/podcasts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "NOT_CONTACTED",
          suppressed: false,
          suppressedAt: null,
        }),
      });
      // Then analyze
      const res = await fetch(`/api/podcasts/${id}/analyze-and-draft`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Analysis failed");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["podcast", id] });
      queryClient.invalidateQueries({ queryKey: ["podcasts"] });
      if (data.emailBody) {
        setEmailDraft(data.emailBody);
        setEmailSubject(data.emailSubject || "");
      }
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

  const analysis = podcast.pendingAnalysis;
  const isAnalyzed = podcast.analysisRunAt !== null;
  const isGoodFit = analysis?.isGoodFit === true;
  const isSkipped = podcast.status === "SKIPPED";
  const isSent = podcast.status === "SENT";
  const isReady = podcast.status === "READY" || podcast.status === "READY_TO_DRAFT" || podcast.status === "DRAFTED" || podcast.status === "QA_APPROVED";

  return (
    <div className="max-w-3xl mx-auto">
      {/* Back button */}
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Pipeline
      </Link>

      {/* Podcast Header */}
      <div className="bg-white border border-slate-200 rounded-lg p-6 mb-6">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
            <Mic2 className="h-8 w-8 text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-semibold text-slate-900 truncate">
              {podcast.showName}
            </h1>
            <p className="text-slate-500">{podcast.hostName || "Unknown host"}</p>
            <div className="flex items-center gap-4 mt-2">
              <a
                href={podcast.primaryPlatformUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
              >
                <ExternalLink className="h-3 w-3" />
                View Podcast
              </a>
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
          <StatusBadge status={podcast.status} />
        </div>

        {/* Contact Info */}
        <div className="mt-6 pt-6 border-t border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-slate-700">Contact</h3>
            {!isEditingContact ? (
              <button
                onClick={() => {
                  setContactForm({
                    primaryEmail: podcast.primaryEmail || "",
                    hostName: podcast.hostName || "",
                  });
                  setIsEditingContact(true);
                }}
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                Edit
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => updateContactMutation.mutate()}
                  disabled={updateContactMutation.isPending}
                  className="text-sm text-green-600 hover:text-green-700"
                >
                  {updateContactMutation.isPending ? "Saving..." : "Save"}
                </button>
                <button
                  onClick={() => setIsEditingContact(false)}
                  className="text-sm text-slate-500"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
          {isEditingContact ? (
            <div className="grid grid-cols-2 gap-4">
              <input
                type="text"
                value={contactForm.hostName}
                onChange={(e) => setContactForm({ ...contactForm, hostName: e.target.value })}
                placeholder="Host name"
                className="border border-slate-300 rounded px-3 py-2 text-sm"
              />
              <input
                type="email"
                value={contactForm.primaryEmail}
                onChange={(e) => setContactForm({ ...contactForm, primaryEmail: e.target.value })}
                placeholder="Email address"
                className="border border-slate-300 rounded px-3 py-2 text-sm"
              />
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Mail className="h-4 w-4 text-slate-400" />
              {podcast.primaryEmail || "No email added"}
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      {!isAnalyzed ? (
        // Not analyzed yet - show analyze button
        <div className="bg-white border border-slate-200 rounded-lg p-8 text-center">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Sparkles className="h-8 w-8 text-blue-600" />
          </div>
          <h2 className="text-xl font-semibold text-slate-900 mb-2">
            Ready to Analyze
          </h2>
          <p className="text-slate-500 mb-6 max-w-md mx-auto">
            AI will evaluate if this podcast is a good fit and draft a personalized outreach email.
          </p>
          <button
            onClick={() => analyzeMutation.mutate()}
            disabled={analyzeMutation.isPending}
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-lg"
          >
            {analyzeMutation.isPending ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Sparkles className="h-5 w-5" />
                Analyze & Draft
              </>
            )}
          </button>
          {analyzeMutation.isError && (
            <p className="mt-4 text-red-600 text-sm">{analyzeMutation.error.message}</p>
          )}
        </div>
      ) : isSkipped ? (
        // Analyzed as NOT a fit
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="bg-red-50 px-6 py-4 border-b border-red-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                  <X className="h-6 w-6 text-red-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-red-900">Not a Fit</h3>
                  <p className="text-sm text-red-700">AI determined this podcast isn't suitable for outreach</p>
                </div>
              </div>
              {analysis?.fitScore !== undefined && (
                <span className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm font-medium">
                  Score: {analysis.fitScore}/100
                </span>
              )}
            </div>
          </div>
          <div className="p-6">
            <p className="text-slate-700 mb-4">{analysis?.fitReason}</p>

            {/* Criteria Results */}
            {analysis?.criteriaResults?.length > 0 && (
              <div className="mb-4">
                <p className="text-sm font-medium text-slate-700 mb-2">Criteria Evaluation:</p>
                <div className="space-y-1">
                  {analysis.criteriaResults.map((result: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      {result.met ? (
                        <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                      ) : (
                        <X className="h-4 w-4 text-red-500 flex-shrink-0" />
                      )}
                      <span className={result.met ? "text-slate-600" : "text-red-700"}>
                        {result.criterion}
                      </span>
                      {result.note && (
                        <span className="text-slate-400">- {result.note}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {analysis?.redFlags?.length > 0 && (
              <div className="mb-4">
                <p className="text-sm font-medium text-slate-700 mb-2">Red Flags:</p>
                <div className="flex flex-wrap gap-2">
                  {analysis.redFlags.map((flag: string, i: number) => (
                    <span key={i} className="px-2 py-1 bg-red-100 text-red-700 rounded text-sm">
                      {flag}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <button
              onClick={() => reanalyzeMutation.mutate()}
              disabled={reanalyzeMutation.isPending}
              className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50"
            >
              {reanalyzeMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              Re-analyze
            </button>
          </div>
        </div>
      ) : isSent ? (
        // Already sent
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="bg-purple-50 px-6 py-4 border-b border-purple-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                <Send className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <h3 className="font-semibold text-purple-900">Email Sent</h3>
                <p className="text-sm text-purple-700">
                  Sent on {new Date(podcast.sentPrimaryAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>
          <div className="p-6">
            <div className="mb-4">
              <p className="text-sm font-medium text-slate-700 mb-1">Subject</p>
              <p className="text-slate-900">{podcast.emailSubject}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-700 mb-1">Email</p>
              <div className="bg-slate-50 rounded-lg p-4 whitespace-pre-wrap text-slate-700 font-mono text-sm">
                {podcast.emailDraft}
              </div>
            </div>
          </div>
        </div>
      ) : isReady || isGoodFit ? (
        // Good fit - show email draft
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          {/* Analysis Summary */}
          <div className="bg-green-50 px-6 py-4 border-b border-green-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                  <CheckCircle className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-green-900">Good Fit</h3>
                  <p className="text-sm text-green-700">{analysis?.fitReason}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {analysis?.fitScore !== undefined && (
                  <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
                    Score: {analysis.fitScore}/100
                  </span>
                )}
                {analysis?.suggestedAngle && (
                  <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                    {analysis.suggestedAngle}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Email Draft */}
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900">Email Draft</h3>
              {!isEditingEmail ? (
                <button
                  onClick={() => {
                    setEmailDraft(podcast.emailDraft || "");
                    setEmailSubject(podcast.emailSubject || "");
                    setIsEditingEmail(true);
                  }}
                  className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                >
                  <Edit2 className="h-3 w-3" />
                  Edit
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => saveDraftMutation.mutate()}
                    disabled={saveDraftMutation.isPending}
                    className="text-sm text-green-600 hover:text-green-700 flex items-center gap-1"
                  >
                    {saveDraftMutation.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Save className="h-3 w-3" />
                    )}
                    Save
                  </button>
                  <button
                    onClick={() => setIsEditingEmail(false)}
                    className="text-sm text-slate-500"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            {/* Subject */}
            <div className="mb-4">
              <label className="text-sm font-medium text-slate-700 block mb-1">Subject</label>
              {isEditingEmail ? (
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2"
                />
              ) : (
                <p className="text-slate-900">{podcast.emailSubject || "No subject"}</p>
              )}
            </div>

            {/* Body */}
            <div className="mb-6">
              <label className="text-sm font-medium text-slate-700 block mb-1">Message</label>
              {isEditingEmail ? (
                <textarea
                  value={emailDraft}
                  onChange={(e) => setEmailDraft(e.target.value)}
                  rows={12}
                  className="w-full border border-slate-300 rounded px-3 py-2 font-mono text-sm"
                />
              ) : (
                <div className="bg-slate-50 rounded-lg p-4 whitespace-pre-wrap text-slate-700 font-mono text-sm">
                  {podcast.emailDraft || "No draft yet"}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4 border-t border-slate-200">
              {!podcast.primaryEmail ? (
                <div className="flex items-center gap-2 text-amber-600">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-sm">Add an email address above before sending</span>
                </div>
              ) : (
                <button
                  onClick={() => sendMutation.mutate()}
                  disabled={sendMutation.isPending}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  {sendMutation.isPending ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Send className="h-5 w-5" />
                  )}
                  Mark as Sent
                </button>
              )}
              <button
                onClick={() => skipMutation.mutate()}
                disabled={skipMutation.isPending}
                className="px-4 py-3 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 disabled:opacity-50"
              >
                {skipMutation.isPending ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  "Skip"
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Show Description if available */}
      {podcast.showDescription && (
        <div className="bg-white border border-slate-200 rounded-lg p-6 mt-6">
          <h3 className="font-semibold text-slate-900 mb-3">About the Show</h3>
          <p className="text-slate-600 text-sm whitespace-pre-wrap">{podcast.showDescription}</p>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; color: string }> = {
    NOT_CONTACTED: { label: "New", color: "bg-slate-100 text-slate-700" },
    READY: { label: "Ready to Send", color: "bg-green-100 text-green-700" },
    READY_TO_DRAFT: { label: "Ready to Send", color: "bg-green-100 text-green-700" },
    DRAFTED: { label: "Ready to Send", color: "bg-green-100 text-green-700" },
    QA_APPROVED: { label: "Ready to Send", color: "bg-green-100 text-green-700" },
    SKIPPED: { label: "Skipped", color: "bg-red-100 text-red-700" },
    SENT: { label: "Sent", color: "bg-purple-100 text-purple-700" },
    REPLIED: { label: "Replied", color: "bg-emerald-100 text-emerald-700" },
    CLOSED: { label: "Closed", color: "bg-slate-100 text-slate-700" },
  };

  const { label, color } = config[status] || config.NOT_CONTACTED;

  return (
    <span className={cn("px-3 py-1 rounded-full text-sm font-medium", color)}>
      {label}
    </span>
  );
}
