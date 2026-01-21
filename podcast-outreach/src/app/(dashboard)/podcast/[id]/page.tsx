"use client";

import { use, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  RotateCcw,
  Search,
  Send,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  params: Promise<{ id: string }>;
}

export default function PodcastDetailPage({ params }: Props) {
  const { id } = use(params);
  const queryClient = useQueryClient();
  const router = useRouter();
  const [isEditingContact, setIsEditingContact] = useState(false);
  const [contactForm, setContactForm] = useState({ primaryEmail: "", hostName: "" });
  const [isFindingEmail, setIsFindingEmail] = useState(false);
  const [emailFinderResult, setEmailFinderResult] = useState<{
    success: boolean;
    message: string;
    email?: string;
    source?: string;
  } | null>(null);

  const { data: podcast, isLoading, error } = useQuery({
    queryKey: ["podcast", id],
    queryFn: async () => {
      const res = await fetch(`/api/podcasts/${id}`);
      if (!res.ok) throw new Error("Failed to fetch podcast");
      return res.json();
    },
    staleTime: 0,
  });

  // Analyze & Draft mutation (just for analysis, no drafting)
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
      setEmailFinderResult(null);
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["podcast", id] });
      queryClient.invalidateQueries({ queryKey: ["podcasts"] });
    },
  });

  // Find email mutation
  const findEmailMutation = useMutation({
    mutationFn: async () => {
      setIsFindingEmail(true);
      const res = await fetch("/api/email-finder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          podcastId: id,
          hostName: contactForm.hostName || podcast.hostName,
          showName: podcast.showName,
          websiteUrl: podcast.websiteUrl,
        }),
      });
      if (!res.ok) throw new Error("Email finder failed");
      return res.json();
    },
    onSuccess: (data) => {
      setEmailFinderResult(data);
      if (data.success && data.email) {
        setContactForm(prev => ({ ...prev, primaryEmail: data.email }));
        // Refresh podcast data to get updated email
        queryClient.invalidateQueries({ queryKey: ["podcast", id] });
      }
      setIsFindingEmail(false);
    },
    onError: () => {
      setIsFindingEmail(false);
      setEmailFinderResult({
        success: false,
        message: "Failed to search for email. Please enter manually.",
      });
    },
  });

  // Start outreach mutation - add to outreach page
  const startOutreachMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/outreach/campaigns/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          podcastId: id,
          showName: podcast.showName,
          hostName: podcast.hostName,
          primaryEmail: podcast.primaryEmail,
          tier: podcast.tier || "TIER_2",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to start outreach");
      }
      return data;
    },
    onSuccess: () => {
      // Navigate to outreach page
      router.push("/outreach");
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
                  onClick={() => {
                    setIsEditingContact(false);
                    setEmailFinderResult(null);
                  }}
                  className="text-sm text-slate-500"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
          {isEditingContact ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <input
                  type="text"
                  value={contactForm.hostName}
                  onChange={(e) => setContactForm({ ...contactForm, hostName: e.target.value })}
                  placeholder="Host name"
                  className="border border-slate-300 rounded px-3 py-2 text-sm text-slate-900"
                />
                <input
                  type="email"
                  value={contactForm.primaryEmail}
                  onChange={(e) => setContactForm({ ...contactForm, primaryEmail: e.target.value })}
                  placeholder="Email address"
                  className="border border-slate-300 rounded px-3 py-2 text-sm text-slate-900"
                />
              </div>
              {/* Find Email Button */}
              <button
                onClick={() => findEmailMutation.mutate()}
                disabled={isFindingEmail}
                className="inline-flex items-center gap-2 px-3 py-1.5 border border-blue-300 text-blue-600 rounded hover:bg-blue-50 text-sm"
              >
                {isFindingEmail ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Searching...
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4" />
                    Find Email
                  </>
                )}
              </button>
              {emailFinderResult && (
                <div className={cn(
                  "text-sm p-2 rounded",
                  emailFinderResult.success ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"
                )}>
                  {emailFinderResult.message}
                  {emailFinderResult.source && emailFinderResult.source !== "database" && (
                    <span className="text-xs ml-2 opacity-75">
                      (Source: {emailFinderResult.source})
                    </span>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Mail className="h-4 w-4 text-slate-400" />
                {podcast.primaryEmail || "No email added"}
              </div>
              {!podcast.primaryEmail && (
                <button
                  onClick={() => {
                    setContactForm({
                      primaryEmail: "",
                      hostName: podcast.hostName || "",
                    });
                    setIsEditingContact(true);
                    findEmailMutation.mutate();
                  }}
                  disabled={isFindingEmail}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                >
                  {isFindingEmail ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Finding...
                    </>
                  ) : (
                    <>
                      <Search className="h-4 w-4" />
                      Find Email
                    </>
                  )}
                </button>
              )}
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
            AI will evaluate if this podcast is a good fit for your outreach.
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
                Analyze Podcast
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
                  <p className="text-sm text-red-700">AI determined this podcast isn&apos;t suitable for outreach</p>
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
        // Already in outreach
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="bg-purple-50 px-6 py-4 border-b border-purple-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                <Send className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <h3 className="font-semibold text-purple-900">Outreach Started</h3>
                <p className="text-sm text-purple-700">
                  This podcast is in your outreach pipeline
                </p>
              </div>
            </div>
          </div>
          <div className="p-6">
            <Link
              href="/outreach"
              className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
            >
              <Send className="h-4 w-4" />
              View in Outreach
            </Link>
          </div>
        </div>
      ) : isReady || isGoodFit ? (
        // Good fit - show action buttons
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

          {/* Action Buttons */}
          <div className="p-6">
            <h3 className="font-semibold text-slate-900 mb-4">Ready for Outreach</h3>

            {/* Email Status */}
            {!podcast.primaryEmail && (
              <div className="flex items-center gap-2 text-amber-600 mb-4 p-3 bg-amber-50 rounded-lg">
                <AlertTriangle className="h-5 w-5" />
                <span className="text-sm">Find or add an email address before starting outreach</span>
              </div>
            )}

            <div className="flex gap-3">
              {/* Start Outreach Button */}
              <button
                onClick={() => startOutreachMutation.mutate()}
                disabled={startOutreachMutation.isPending || !podcast.primaryEmail}
                className={cn(
                  "flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg",
                  podcast.primaryEmail
                    ? "bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                    : "bg-slate-300 text-slate-500 cursor-not-allowed"
                )}
              >
                {startOutreachMutation.isPending ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    <Send className="h-5 w-5" />
                    Start Outreach
                  </>
                )}
              </button>

              {/* Skip Button */}
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

            {startOutreachMutation.isError && (
              <p className="mt-4 text-red-600 text-sm">
                {startOutreachMutation.error.message}
              </p>
            )}
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
    READY: { label: "Ready", color: "bg-green-100 text-green-700" },
    READY_TO_DRAFT: { label: "Ready", color: "bg-green-100 text-green-700" },
    DRAFTED: { label: "Ready", color: "bg-green-100 text-green-700" },
    QA_APPROVED: { label: "Ready", color: "bg-green-100 text-green-700" },
    SKIPPED: { label: "Skipped", color: "bg-red-100 text-red-700" },
    SENT: { label: "In Outreach", color: "bg-purple-100 text-purple-700" },
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
