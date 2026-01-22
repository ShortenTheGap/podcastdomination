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
    sourceUrl?: string;
    confidence?: number;
    sourceDetails?: {
      method: string;
      description: string;
      extractionType?: string;
      pageChecked?: string;
      reliability: "high" | "medium" | "low";
      verificationTips?: string[];
    };
    alternateEmails?: Array<{
      email: string;
      source: string;
      sourceUrl?: string;
      confidence: number;
      sourceDetails?: {
        method: string;
        description: string;
        extractionType?: string;
        pageChecked?: string;
        reliability: "high" | "medium" | "low";
        verificationTips?: string[];
      };
    }>;
    suggestions?: string[];
    discoveredWebsiteUrl?: string;
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
    mutationFn: async (forceRefresh: boolean = false) => {
      setIsFindingEmail(true);
      const res = await fetch("/api/email-finder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          podcastId: id,
          hostName: contactForm.hostName || podcast.hostName,
          showName: podcast.showName,
          websiteUrl: podcast.websiteUrl,
          applePodcastUrl: podcast.applePodcastUrl,
          forceRefresh: forceRefresh || false,
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

  // Use alternate email
  const useAlternateEmail = (email: string) => {
    setContactForm(prev => ({ ...prev, primaryEmail: email }));
  };

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
        <Loader2 className="h-8 w-8 animate-spin text-[#0a9396]" />
      </div>
    );
  }

  if (error || !podcast) {
    return (
      <div className="text-center py-12">
        <p className="text-[#9d2227]">Failed to load podcast</p>
        <Link href="/" className="text-[#0a9396] hover:underline mt-2 inline-block">
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
        className="inline-flex items-center gap-2 text-[#006073] hover:text-[#02121a] mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Pipeline
      </Link>

      {/* Podcast Header */}
      <div className="bg-white border border-[#94d2bd] rounded-lg p-6 mb-6">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 bg-[#d4f0e7] rounded-lg flex items-center justify-center flex-shrink-0">
            <Mic2 className="h-8 w-8 text-[#0a9396]" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-semibold text-[#02121a] truncate">
              {podcast.showName}
            </h1>
            <p className="text-[#006073]">{podcast.hostName || "Unknown host"}</p>
            <div className="flex items-center gap-4 mt-2">
              <a
                href={podcast.primaryPlatformUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-[#0a9396] hover:text-[#006073] flex items-center gap-1"
              >
                <ExternalLink className="h-3 w-3" />
                View Podcast
              </a>
              {podcast.websiteUrl && (
                <a
                  href={podcast.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-[#0a9396] hover:text-[#006073] flex items-center gap-1"
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
        <div className="mt-6 pt-6 border-t border-[#94d2bd]">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-[#006073]">Contact</h3>
            {!isEditingContact ? (
              <button
                onClick={() => {
                  setContactForm({
                    primaryEmail: podcast.primaryEmail || "",
                    hostName: podcast.hostName || "",
                  });
                  setIsEditingContact(true);
                }}
                className="text-sm text-[#0a9396] hover:text-[#006073]"
              >
                Edit
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => updateContactMutation.mutate()}
                  disabled={updateContactMutation.isPending}
                  className="text-sm text-[#0a9396] hover:text-[#0a9396]"
                >
                  {updateContactMutation.isPending ? "Saving..." : "Save"}
                </button>
                <button
                  onClick={() => {
                    setIsEditingContact(false);
                    setEmailFinderResult(null);
                  }}
                  className="text-sm text-[#006073]"
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
                  className="border border-[#94d2bd] rounded px-3 py-2 text-sm text-[#02121a]"
                />
                <input
                  type="email"
                  value={contactForm.primaryEmail}
                  onChange={(e) => setContactForm({ ...contactForm, primaryEmail: e.target.value })}
                  placeholder="Email address"
                  className="border border-[#94d2bd] rounded px-3 py-2 text-sm text-[#02121a]"
                />
              </div>
              {/* Find Email Button */}
              <button
                onClick={() => findEmailMutation.mutate(false)}
                disabled={isFindingEmail}
                className="inline-flex items-center gap-2 px-3 py-1.5 border border-[#94d2bd] text-[#0a9396] rounded hover:bg-[#d4f0e7] text-sm"
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
                <div className="space-y-3">
                  {/* Main result */}
                  <div className={cn(
                    "text-sm p-3 rounded border",
                    emailFinderResult.success ? "bg-[#d4f0e7] border-[#94d2bd] text-[#006073]" : "bg-[#f5edd8] border-[#ead7a5] text-[#b02013]"
                  )}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">{emailFinderResult.message}</span>
                      {emailFinderResult.confidence !== undefined && emailFinderResult.confidence > 0 && (
                        <span className={cn(
                          "text-xs px-2 py-0.5 rounded-full font-medium",
                          emailFinderResult.confidence >= 0.8 ? "bg-[#94d2bd] text-[#006073]" :
                          emailFinderResult.confidence >= 0.5 ? "bg-[#ead7a5] text-[#b02013]" :
                          "bg-[#f5edd8] text-[#b02013]"
                        )}>
                          {Math.round(emailFinderResult.confidence * 100)}% confidence
                        </span>
                      )}
                    </div>

                    {/* Source Details - How it was found */}
                    {emailFinderResult.sourceDetails && (
                      <div className="mt-2 pt-2 border-t border-[#94d2bd]/50 space-y-2">
                        <div className="flex items-start gap-2">
                          <span className={cn(
                            "text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0",
                            emailFinderResult.sourceDetails.reliability === "high" ? "bg-green-200 text-[#006073]" :
                            emailFinderResult.sourceDetails.reliability === "medium" ? "bg-[#ead7a5] text-[#b02013]" :
                            "bg-[#ead7a5] text-[#b02013]"
                          )}>
                            {emailFinderResult.sourceDetails.reliability === "high" ? "HIGH" :
                             emailFinderResult.sourceDetails.reliability === "medium" ? "MEDIUM" : "LOW"} reliability
                          </span>
                          <span className="text-xs font-medium">{emailFinderResult.sourceDetails.method}</span>
                        </div>
                        <p className="text-xs opacity-90">{emailFinderResult.sourceDetails.description}</p>

                        {emailFinderResult.sourceDetails.pageChecked && (
                          <a
                            href={emailFinderResult.sourceDetails.pageChecked}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs underline opacity-75 block"
                          >
                            View source page
                          </a>
                        )}

                        {emailFinderResult.sourceDetails.verificationTips && emailFinderResult.sourceDetails.verificationTips.length > 0 && (
                          <details className="text-xs">
                            <summary className="cursor-pointer opacity-75 hover:opacity-100">Verification tips</summary>
                            <ul className="mt-1 space-y-0.5 pl-3">
                              {emailFinderResult.sourceDetails.verificationTips.map((tip, i) => (
                                <li key={i} className="opacity-80">• {tip}</li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </div>
                    )}

                    {/* Fallback source URL if no sourceDetails */}
                    {!emailFinderResult.sourceDetails && emailFinderResult.sourceUrl && (
                      <a
                        href={emailFinderResult.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs underline opacity-75 mt-1 block"
                      >
                        View source
                      </a>
                    )}
                  </div>

                  {/* Alternate emails */}
                  {emailFinderResult.alternateEmails && emailFinderResult.alternateEmails.length > 0 && (
                    <div className="bg-[#f5edd8] border border-[#94d2bd] p-3 rounded">
                      <p className="text-xs font-medium text-[#006073] mb-2">Other emails found:</p>
                      <div className="space-y-2">
                        {emailFinderResult.alternateEmails.map((alt, i) => (
                          <div key={i} className="flex items-start justify-between gap-2 text-sm p-2 bg-white rounded border border-[#94d2bd]">
                            <div className="flex-1 min-w-0">
                              <span className="text-[#02121a] font-medium">{alt.email}</span>
                              {alt.sourceDetails && (
                                <p className="text-xs text-[#006073] mt-0.5">
                                  {alt.sourceDetails.method}
                                  <span className={cn(
                                    "ml-1 px-1 py-0.5 rounded text-[10px]",
                                    alt.sourceDetails.reliability === "high" ? "bg-[#94d2bd] text-[#0a9396]" :
                                    alt.sourceDetails.reliability === "medium" ? "bg-[#ead7a5] text-[#bb3f03]" :
                                    "bg-[#f5edd8] text-[#bb3f03]"
                                  )}>
                                    {alt.sourceDetails.reliability}
                                  </span>
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className="text-xs text-[#006073]">
                                {Math.round(alt.confidence * 100)}%
                              </span>
                              <button
                                onClick={() => useAlternateEmail(alt.email)}
                                className="text-xs text-[#0a9396] hover:text-[#006073] font-medium"
                              >
                                Use this
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Suggestions when not found */}
                  {!emailFinderResult.success && emailFinderResult.suggestions && emailFinderResult.suggestions.length > 0 && (
                    <div className="bg-[#d4f0e7] border border-[#94d2bd] p-3 rounded">
                      <p className="text-xs font-medium text-[#006073] mb-2">Suggestions:</p>
                      <ul className="text-xs text-[#0a9396] space-y-1">
                        {emailFinderResult.suggestions.slice(0, 4).map((suggestion, i) => (
                          <li key={i}>• {suggestion}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Discovered website */}
                  {emailFinderResult.discoveredWebsiteUrl && (
                    <div className="text-xs text-[#0a9396] bg-[#d4f0e7] border border-[#94d2bd] p-2 rounded">
                      Discovered website: <a href={emailFinderResult.discoveredWebsiteUrl} target="_blank" rel="noopener noreferrer" className="underline font-medium">{emailFinderResult.discoveredWebsiteUrl}</a>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-[#006073]">
                <Mail className="h-4 w-4 text-[#94d2bd]" />
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
                    findEmailMutation.mutate(false);
                  }}
                  disabled={isFindingEmail}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#0a9396] text-white rounded hover:bg-[#006073] text-sm"
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
        <div className="bg-white border border-[#94d2bd] rounded-lg p-8 text-center">
          <div className="w-16 h-16 bg-[#94d2bd] rounded-full flex items-center justify-center mx-auto mb-4">
            <Sparkles className="h-8 w-8 text-[#0a9396]" />
          </div>
          <h2 className="text-xl font-semibold text-[#02121a] mb-2">
            Ready to Analyze
          </h2>
          <p className="text-[#006073] mb-6 max-w-md mx-auto">
            AI will evaluate if this podcast is a good fit for your outreach.
          </p>
          <button
            onClick={() => analyzeMutation.mutate()}
            disabled={analyzeMutation.isPending}
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#0a9396] text-white rounded-lg hover:bg-[#006073] disabled:opacity-50 text-lg"
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
            <p className="mt-4 text-[#9d2227] text-sm">{analyzeMutation.error.message}</p>
          )}
        </div>
      ) : isSkipped ? (
        // Analyzed as NOT a fit
        <div className="bg-white border border-[#94d2bd] rounded-lg overflow-hidden">
          <div className="bg-[#fce8e9] px-6 py-4 border-b border-[#9d2227]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#fce8e9] rounded-full flex items-center justify-center">
                  <X className="h-6 w-6 text-[#9d2227]" />
                </div>
                <div>
                  <h3 className="font-semibold text-[#9d2227]">Not a Fit</h3>
                  <p className="text-sm text-[#9d2227]">AI determined this podcast isn&apos;t suitable for outreach</p>
                </div>
              </div>
              {analysis?.fitScore !== undefined && (
                <span className="px-3 py-1 bg-[#fce8e9] text-[#9d2227] rounded-full text-sm font-medium">
                  Score: {analysis.fitScore}/100
                </span>
              )}
            </div>
          </div>
          <div className="p-6">
            <p className="text-[#006073] mb-4">{analysis?.fitReason}</p>

            {/* Criteria Results */}
            {analysis?.criteriaResults?.length > 0 && (
              <div className="mb-4">
                <p className="text-sm font-medium text-[#006073] mb-2">Criteria Evaluation:</p>
                <div className="space-y-1">
                  {analysis.criteriaResults.map((result: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      {result.met ? (
                        <CheckCircle className="h-4 w-4 text-[#0a9396] flex-shrink-0" />
                      ) : (
                        <X className="h-4 w-4 text-[#b02013] flex-shrink-0" />
                      )}
                      <span className={result.met ? "text-[#006073]" : "text-[#9d2227]"}>
                        {result.criterion}
                      </span>
                      {result.note && (
                        <span className="text-[#94d2bd]">- {result.note}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {analysis?.redFlags?.length > 0 && (
              <div className="mb-4">
                <p className="text-sm font-medium text-[#006073] mb-2">Red Flags:</p>
                <div className="flex flex-wrap gap-2">
                  {analysis.redFlags.map((flag: string, i: number) => (
                    <span key={i} className="px-2 py-1 bg-[#fce8e9] text-[#9d2227] rounded text-sm">
                      {flag}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <button
              onClick={() => reanalyzeMutation.mutate()}
              disabled={reanalyzeMutation.isPending}
              className="inline-flex items-center gap-2 px-4 py-2 border border-[#94d2bd] text-[#006073] rounded-lg hover:bg-[#f5edd8]"
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
        <div className="bg-white border border-[#94d2bd] rounded-lg overflow-hidden">
          <div className="bg-[#d4f0e7] px-6 py-4 border-b border-[#94d2bd]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#94d2bd] rounded-full flex items-center justify-center">
                <Send className="h-6 w-6 text-[#006073]" />
              </div>
              <div>
                <h3 className="font-semibold text-[#02121a]">Outreach Started</h3>
                <p className="text-sm text-[#006073]">
                  This podcast is in your outreach pipeline
                </p>
              </div>
            </div>
          </div>
          <div className="p-6">
            <Link
              href="/outreach"
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#0a9396] text-white rounded-lg hover:bg-[#006073]"
            >
              <Send className="h-4 w-4" />
              View in Outreach
            </Link>
          </div>
        </div>
      ) : isReady || isGoodFit ? (
        // Good fit - show action buttons
        <div className="bg-white border border-[#94d2bd] rounded-lg overflow-hidden">
          {/* Analysis Summary */}
          <div className="bg-[#d4f0e7] px-6 py-4 border-b border-[#94d2bd]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#94d2bd] rounded-full flex items-center justify-center">
                  <CheckCircle className="h-6 w-6 text-[#0a9396]" />
                </div>
                <div>
                  <h3 className="font-semibold text-[#02121a]">Good Fit</h3>
                  <p className="text-sm text-[#0a9396]">{analysis?.fitReason}</p>
                </div>
              </div>
              {analysis?.fitScore !== undefined && (
                <span className="px-3 py-1 bg-[#94d2bd] text-[#006073] rounded-full text-sm font-medium whitespace-nowrap">
                  Score: {analysis.fitScore}/100
                </span>
              )}
            </div>
            {analysis?.suggestedAngle && (
              <div className="mt-3 pt-3 border-t border-[#94d2bd]/50">
                <span className="inline-block px-4 py-2 bg-[#94d2bd] text-[#006073] rounded-lg text-sm font-medium leading-relaxed">
                  {analysis.suggestedAngle}
                </span>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="p-6">
            <h3 className="font-semibold text-[#02121a] mb-4">Ready for Outreach</h3>

            {/* Email Status */}
            {!podcast.primaryEmail && (
              <div className="flex items-center gap-2 text-[#cb6701] mb-4 p-3 bg-[#f5edd8] rounded-lg">
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
                    ? "bg-[#0a9396] text-white hover:bg-[#006073] disabled:opacity-50"
                    : "bg-[#94d2bd] text-[#006073] cursor-not-allowed"
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
            </div>

            {startOutreachMutation.isError && (
              <p className="mt-4 text-[#9d2227] text-sm">
                {startOutreachMutation.error.message}
              </p>
            )}
          </div>
        </div>
      ) : null}

      {/* Show Description if available */}
      {podcast.showDescription && (
        <div className="bg-white border border-[#94d2bd] rounded-lg p-6 mt-6">
          <h3 className="font-semibold text-[#02121a] mb-3">About the Show</h3>
          <p className="text-[#006073] text-sm whitespace-pre-wrap">{podcast.showDescription}</p>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; color: string }> = {
    NOT_CONTACTED: { label: "New", color: "bg-[#ead7a5] text-[#006073]" },
    READY: { label: "Ready", color: "bg-[#94d2bd] text-[#0a9396]" },
    READY_TO_DRAFT: { label: "Ready", color: "bg-[#94d2bd] text-[#0a9396]" },
    DRAFTED: { label: "Ready", color: "bg-[#94d2bd] text-[#0a9396]" },
    QA_APPROVED: { label: "Ready", color: "bg-[#94d2bd] text-[#0a9396]" },
    SKIPPED: { label: "Skipped", color: "bg-[#fce8e9] text-[#9d2227]" },
    SENT: { label: "In Outreach", color: "bg-[#94d2bd] text-[#006073]" },
    REPLIED: { label: "Replied", color: "bg-[#94d2bd] text-[#006073]" },
    CLOSED: { label: "Closed", color: "bg-[#ead7a5] text-[#006073]" },
  };

  const { label, color } = config[status] || config.NOT_CONTACTED;

  return (
    <span className={cn("px-3 py-1 rounded-full text-sm font-medium", color)}>
      {label}
    </span>
  );
}
