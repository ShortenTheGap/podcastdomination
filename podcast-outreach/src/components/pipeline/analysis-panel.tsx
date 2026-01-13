"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sparkles,
  Check,
  X,
  AlertTriangle,
  ChevronDown,
  ExternalLink,
  Edit2,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AnalysisResult {
  tier: "TIER_2" | "TIER_3";
  tierConfidence: number;
  tierReasoning: string;
  primaryAngle: string;
  secondaryAngle: string | null;
  angleReasoning: string;
  tier2Anchor: string | null;
  tier2AnchorEvidence: string | null;
  tier1Possible: boolean;
  tier1AddOnLine: string | null;
  tier1Connection: string | null;
  stopRuleFlags: string[];
  stopRuleDetails: string | null;
  evidenceQuality: {
    hasDescription: boolean;
    hasEpisodeTitles: boolean;
    hasGuestList: boolean;
    hasTranscript: boolean;
    hasHostBio: boolean;
  };
  suggestedHostGreeting: string;
  overallAssessment: string;
}

interface Podcast {
  id: string;
  showName: string;
  hostName: string | null;
  tier: string;
  status: string;
  pendingAnalysis: AnalysisResult | null;
  analysisRunAt: string | null;
  tier2Anchor: string | null;
  tier1AddOnLine: string | null;
  selectedAngle: string | null;
  primaryPlatformUrl: string;
}

const ANGLE_OPTIONS = [
  { value: "FAT_LOSS", label: "Fat Loss" },
  { value: "BODY_RECOMPOSITION", label: "Body Recomposition" },
  { value: "GENERAL_HEALTH", label: "General Health" },
  { value: "LONGEVITY", label: "Longevity" },
  { value: "DADS_PARENTING", label: "Dads & Parenting" },
  { value: "CEO_PERFORMANCE", label: "CEO Performance" },
  { value: "EVIDENCE_BASED_NUTRITION", label: "Evidence-Based Nutrition" },
  { value: "PERSONAL_DEVELOPMENT", label: "Personal Development" },
];

export function AnalysisPanel({ podcast }: { podcast: Podcast }) {
  const queryClient = useQueryClient();
  const [editingAnchor, setEditingAnchor] = useState(false);
  const [editingAddOn, setEditingAddOn] = useState(false);
  const [customAnchor, setCustomAnchor] = useState(podcast.tier2Anchor || "");
  const [customAddOn, setCustomAddOn] = useState(podcast.tier1AddOnLine || "");
  const [selectedAngle, setSelectedAngle] = useState(
    podcast.selectedAngle || podcast.pendingAnalysis?.primaryAngle || ""
  );

  const analysis = podcast.pendingAnalysis;

  // Run AI analysis mutation
  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/podcasts/${podcast.id}/analyze`, {
        method: "POST",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to analyze");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["podcast", podcast.id] });
      queryClient.invalidateQueries({ queryKey: ["podcasts"] });
    },
  });

  // Approve Tier 2 mutation (for when AI recommends TIER_2)
  const approveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/podcasts/${podcast.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflowAction: "APPROVE_TIER_2",
          tier: analysis?.tier1Possible ? "TIER_1" : "TIER_2",
          tier2Anchor: customAnchor || analysis?.tier2Anchor,
          tier1AddOnLine: customAddOn || analysis?.tier1AddOnLine,
          selectedAngle: selectedAngle || analysis?.primaryAngle,
        }),
      });
      if (!res.ok) throw new Error("Failed to approve");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["podcast", podcast.id] });
      queryClient.invalidateQueries({ queryKey: ["podcasts"] });
    },
  });

  // Override mutation - approve as TIER_2 when AI recommended TIER_3
  const overrideApproveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/podcasts/${podcast.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflowAction: "APPROVE_TIER_2",
          tier: "TIER_2", // Explicitly set to TIER_2 when overriding
          tier2Anchor: customAnchor || analysis?.tier2Anchor || "Show appears relevant to fitness/health audience",
          selectedAngle: selectedAngle || analysis?.primaryAngle || "FAT_LOSS",
        }),
      });
      if (!res.ok) throw new Error("Failed to override");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["podcast", podcast.id] });
      queryClient.invalidateQueries({ queryKey: ["podcasts"] });
    },
  });

  // Skip Tier 3 mutation
  const skipMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/podcasts/${podcast.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflowAction: "SKIP_TIER_3",
          stopRule:
            analysis?.stopRuleFlags?.[0] || "TIER_3_INSUFFICIENT",
        }),
      });
      if (!res.ok) throw new Error("Failed to skip");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["podcast", podcast.id] });
      queryClient.invalidateQueries({ queryKey: ["podcasts"] });
    },
  });

  // No analysis yet - show the run button
  if (!analysis && !podcast.analysisRunAt) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-6">
        <div className="text-center">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Sparkles className="h-8 w-8 text-blue-600" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">
            AI-Powered Analysis
          </h3>
          <p className="text-slate-500 mb-6 max-w-md mx-auto">
            Run AI analysis to get tier recommendations, suggested angles, and
            ready-to-use anchor statements.
          </p>
          <button
            onClick={() => analyzeMutation.mutate()}
            disabled={analyzeMutation.isPending}
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {analyzeMutation.isPending ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Sparkles className="h-5 w-5" />
                Run AI Analysis
              </>
            )}
          </button>
          {analyzeMutation.isError && (
            <p className="mt-4 text-red-600 text-sm">
              {analyzeMutation.error.message}
            </p>
          )}
        </div>
      </div>
    );
  }

  // Analysis complete - show results
  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      {/* Header with tier recommendation */}
      <div
        className={cn(
          "px-6 py-4 border-b",
          analysis?.tier === "TIER_2"
            ? "bg-green-50 border-green-200"
            : "bg-red-50 border-red-200"
        )}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {analysis?.tier === "TIER_2" ? (
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                <Check className="h-6 w-6 text-green-600" />
              </div>
            ) : (
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <X className="h-6 w-6 text-red-600" />
              </div>
            )}
            <div>
              <h3
                className={cn(
                  "font-semibold",
                  analysis?.tier === "TIER_2"
                    ? "text-green-900"
                    : "text-red-900"
                )}
              >
                {analysis?.tier === "TIER_2"
                  ? "Recommended: Tier 2 (Good Fit)"
                  : "Recommended: Tier 3 (Skip)"}
              </h3>
              <p className="text-sm text-slate-600">
                Confidence: {Math.round((analysis?.tierConfidence || 0) * 100)}%
              </p>
            </div>
          </div>
          <button
            onClick={() => analyzeMutation.mutate()}
            disabled={analyzeMutation.isPending}
            className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1"
          >
            {analyzeMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Re-analyze
          </button>
        </div>
      </div>

      {/* Analysis details */}
      <div className="p-6 space-y-6">
        {/* Reasoning */}
        <div>
          <h4 className="text-sm font-medium text-slate-700 mb-2">Reasoning</h4>
          <p className="text-slate-600">{analysis?.tierReasoning}</p>
        </div>

        {/* Stop rules if any */}
        {analysis?.stopRuleFlags && analysis.stopRuleFlags.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
              <div>
                <h4 className="font-medium text-amber-900">Stop Rules Triggered</h4>
                <p className="text-sm text-amber-700 mt-1">
                  {analysis.stopRuleFlags.join(", ")}
                </p>
                {analysis.stopRuleDetails && (
                  <p className="text-sm text-amber-600 mt-1">
                    {analysis.stopRuleDetails}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Only show these sections for Tier 2 */}
        {analysis?.tier === "TIER_2" && (
          <>
            {/* Angle selection */}
            <div>
              <h4 className="text-sm font-medium text-slate-700 mb-2">
                Recommended Angle
              </h4>
              <div className="flex items-center gap-3">
                <select
                  value={selectedAngle}
                  onChange={(e) => setSelectedAngle(e.target.value)}
                  className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-slate-700"
                >
                  {ANGLE_OPTIONS.map((angle) => (
                    <option key={angle.value} value={angle.value}>
                      {angle.label}
                      {angle.value === analysis.primaryAngle && " (AI recommended)"}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-sm text-slate-500 mt-1">
                {analysis.angleReasoning}
              </p>
            </div>

            {/* Anchor statement */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium text-slate-700">
                  Tier 2 Anchor Statement
                </h4>
                <button
                  onClick={() => setEditingAnchor(!editingAnchor)}
                  className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                >
                  <Edit2 className="h-3 w-3" />
                  {editingAnchor ? "Done" : "Edit"}
                </button>
              </div>
              {editingAnchor ? (
                <textarea
                  value={customAnchor || analysis.tier2Anchor || ""}
                  onChange={(e) => setCustomAnchor(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-700 min-h-[80px]"
                  placeholder="Enter custom anchor statement..."
                />
              ) : (
                <div className="bg-slate-50 rounded-lg p-3 text-slate-700">
                  {customAnchor || analysis.tier2Anchor || "No anchor statement generated"}
                </div>
              )}
              {analysis.tier2AnchorEvidence && (
                <p className="text-sm text-slate-500 mt-1">
                  Evidence: {analysis.tier2AnchorEvidence}
                </p>
              )}
            </div>

            {/* Tier 1 add-on if available */}
            {analysis.tier1Possible && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium text-emerald-900">
                    Tier 1 Potential - Strong Connection Found
                  </h4>
                  <button
                    onClick={() => setEditingAddOn(!editingAddOn)}
                    className="text-sm text-emerald-700 hover:text-emerald-800 flex items-center gap-1"
                  >
                    <Edit2 className="h-3 w-3" />
                    {editingAddOn ? "Done" : "Edit"}
                  </button>
                </div>
                {editingAddOn ? (
                  <textarea
                    value={customAddOn || analysis.tier1AddOnLine || ""}
                    onChange={(e) => setCustomAddOn(e.target.value)}
                    className="w-full border border-emerald-300 rounded-lg px-3 py-2 text-slate-700 min-h-[60px]"
                    placeholder="Enter custom Tier 1 add-on line..."
                  />
                ) : (
                  <p className="text-emerald-800">
                    {customAddOn || analysis.tier1AddOnLine}
                  </p>
                )}
                {analysis.tier1Connection && (
                  <p className="text-sm text-emerald-600 mt-2">
                    Connection: {analysis.tier1Connection}
                  </p>
                )}
              </div>
            )}
          </>
        )}

        {/* Evidence quality indicators */}
        <div>
          <h4 className="text-sm font-medium text-slate-700 mb-2">
            Evidence Quality
          </h4>
          <div className="flex flex-wrap gap-2">
            {Object.entries(analysis?.evidenceQuality || {}).map(([key, value]) => (
              <span
                key={key}
                className={cn(
                  "px-2 py-1 rounded text-xs font-medium",
                  value
                    ? "bg-green-100 text-green-700"
                    : "bg-slate-100 text-slate-500"
                )}
              >
                {key.replace("has", "")}
              </span>
            ))}
          </div>
        </div>

        {/* Overall assessment */}
        <div>
          <h4 className="text-sm font-medium text-slate-700 mb-2">
            Overall Assessment
          </h4>
          <p className="text-slate-600">{analysis?.overallAssessment}</p>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3 pt-4 border-t border-slate-200">
          {analysis?.tier === "TIER_2" ? (
            <>
              <button
                onClick={() => approveMutation.mutate()}
                disabled={approveMutation.isPending}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {approveMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Approve & Continue to Draft
              </button>
              <button
                onClick={() => skipMutation.mutate()}
                disabled={skipMutation.isPending}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50"
              >
                Override: Skip
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => skipMutation.mutate()}
                disabled={skipMutation.isPending}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50"
              >
                {skipMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <X className="h-4 w-4" />
                )}
                Skip This Podcast
              </button>
              <button
                onClick={() => overrideApproveMutation.mutate()}
                disabled={overrideApproveMutation.isPending}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 disabled:opacity-50"
              >
                {overrideApproveMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                ) : null}
                Override: Approve Anyway
              </button>
            </>
          )}
        </div>
      </div>

      {/* Link to podcast */}
      <div className="px-6 py-3 bg-slate-50 border-t border-slate-200">
        <a
          href={podcast.primaryPlatformUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
        >
          <ExternalLink className="h-3 w-3" />
          View Podcast
        </a>
      </div>
    </div>
  );
}
