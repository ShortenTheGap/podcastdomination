"use client";

import { useState } from "react";
import { Check, X, AlertCircle } from "lucide-react";
import { QA_CHECKLIST, CLAIM_RULES } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface QAChecklistProps {
  draft: {
    subject: string;
    body: string;
    tier: string;
    tier2Anchor: string;
    tier1AddOnLine?: string;
    hostName?: string;
    stopRule: string;
  };
  onApprove: () => void;
  onReject: (reason: string) => void;
}

export function QAChecklist({ draft, onApprove, onReject }: QAChecklistProps) {
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [rejectionReason, setRejectionReason] = useState("");

  // Auto-detect issues
  const autoChecks = analyzeEmail(draft);

  const allRequiredPassed = QA_CHECKLIST.filter((item) => item.required).every(
    (item) => checkedItems[item.id] || autoChecks[item.id]?.passed
  );

  const handleToggle = (id: string) => {
    setCheckedItems((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="border rounded-lg p-4 space-y-4">
      <h3 className="font-semibold">QA Checklist</h3>

      <div className="space-y-2">
        {QA_CHECKLIST.map((item) => {
          const autoResult = autoChecks[item.id];
          const isChecked = checkedItems[item.id] || autoResult?.passed;
          const hasIssue = autoResult && !autoResult.passed;

          return (
            <div
              key={item.id}
              className={cn(
                "flex items-start gap-3 p-2 rounded",
                hasIssue && "bg-red-50",
                isChecked && !hasIssue && "bg-green-50"
              )}
            >
              <button
                onClick={() => handleToggle(item.id)}
                className={cn(
                  "mt-0.5 w-5 h-5 rounded border flex items-center justify-center",
                  isChecked
                    ? "bg-green-500 border-green-500"
                    : "border-gray-300",
                  hasIssue && "bg-red-500 border-red-500"
                )}
              >
                {isChecked && !hasIssue && (
                  <Check className="h-3 w-3 text-white" />
                )}
                {hasIssue && <X className="h-3 w-3 text-white" />}
              </button>

              <div className="flex-1">
                <p
                  className={cn(
                    "text-sm",
                    !item.required && "text-muted-foreground"
                  )}
                >
                  {item.label}
                  {item.required && <span className="text-red-500 ml-1">*</span>}
                </p>

                {hasIssue && autoResult.details && (
                  <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {autoResult.details}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Action buttons */}
      <div className="flex gap-3 pt-4 border-t">
        <button
          onClick={onApprove}
          disabled={!allRequiredPassed}
          className={cn(
            "flex-1 py-2 rounded font-medium",
            allRequiredPassed
              ? "bg-green-600 text-white hover:bg-green-700"
              : "bg-gray-200 text-gray-700 cursor-not-allowed"
          )}
        >
          Approve & Ready to Send
        </button>

        <button
          onClick={() => {
            const reason = rejectionReason || "Failed QA checks";
            onReject(reason);
          }}
          className="px-4 py-2 border rounded font-medium hover:bg-muted"
        >
          Needs Revision
        </button>
      </div>
    </div>
  );
}

function analyzeEmail(
  draft: QAChecklistProps["draft"]
): Record<string, { passed: boolean; details?: string }> {
  const results: Record<string, { passed: boolean; details?: string }> = {};
  const combinedText = `${draft.subject} ${draft.body}`.toLowerCase();

  // Check 1: First person voice
  const hasFirstPerson = /\b(i |i'm|my |me |i've|i'll)\b/i.test(draft.body);
  const hasThirdPerson = /\b(joey|he |his |him )\b/i.test(draft.body);
  results.voice = {
    passed: hasFirstPerson && !hasThirdPerson,
    details: hasThirdPerson
      ? "Found third-person references to Joey"
      : undefined,
  };

  // Check 2: No listening language
  const foundForbidden = CLAIM_RULES.FORBIDDEN_PHRASES.filter((phrase) =>
    combinedText.includes(phrase.toLowerCase())
  );
  results.noListening = {
    passed: foundForbidden.length === 0,
    details:
      foundForbidden.length > 0 ? `Found: "${foundForbidden[0]}"` : undefined,
  };

  // Check 3: Tier 2 met
  results.tier2Met = {
    passed:
      (draft.tier === "TIER_2" || draft.tier === "TIER_1") && !!draft.tier2Anchor,
    details:
      draft.tier !== "TIER_2" && draft.tier !== "TIER_1"
        ? "Not Tier 1 or Tier 2"
        : undefined,
  };

  // Check 4: Anchor validity (basic check)
  results.anchorValid = {
    passed: !!draft.tier2Anchor && draft.tier2Anchor.length > 10,
  };

  // Check 5: Tier 1 validity (if present)
  if (draft.tier1AddOnLine) {
    const hasConnection = CLAIM_RULES.TIER_1_ALLOWED.some((phrase) =>
      draft.tier1AddOnLine!
        .toLowerCase()
        .includes(phrase.toLowerCase().substring(0, 10))
    );
    results.tier1Valid = {
      passed: hasConnection,
      details: !hasConnection
        ? "Tier 1 add-on doesn't use approved phrasing"
        : undefined,
    };
  } else {
    results.tier1Valid = { passed: true };
  }

  // Check 6: Max anchors
  const tier2InBody =
    draft.tier2Anchor &&
    draft.body.includes(draft.tier2Anchor.substring(0, 20));
  const tier1InBody =
    draft.tier1AddOnLine &&
    draft.body.includes(draft.tier1AddOnLine.substring(0, 20));
  const anchorCount = (tier2InBody ? 1 : 0) + (tier1InBody ? 1 : 0);
  results.maxAnchors = {
    passed: anchorCount <= 2,
    details: anchorCount > 2 ? "More than 2 anchors detected" : undefined,
  };

  // Check 7: Host name verification
  results.nameVerified = {
    passed:
      !draft.hostName ||
      draft.body.toLowerCase().includes(draft.hostName.toLowerCase()) ||
      draft.body.includes("team,") ||
      draft.body.includes("Team,"),
  };

  // Check 8: No false relationship
  const falseRelationship =
    /\b(friend|we've talked|following you for years|big fan)\b/i.test(
      draft.body
    );
  results.noFalseRelationship = {
    passed: !falseRelationship,
    details: falseRelationship
      ? "Found potential false familiarity claim"
      : undefined,
  };

  // Check 9: No stop rules
  results.noStopRules = {
    passed: draft.stopRule === "NONE",
    details:
      draft.stopRule !== "NONE"
        ? `Active stop rule: ${draft.stopRule}`
        : undefined,
  };

  // Check 10: Deliverability
  const hasAttachment = /\[attachment\]|\bpdf\b|\bdoc\b/i.test(draft.body);
  const linkCount = (draft.body.match(/https?:\/\//g) || []).length;
  results.deliverability = {
    passed: !hasAttachment && linkCount <= 1,
    details: hasAttachment
      ? "Attachment references detected"
      : linkCount > 1
        ? "Multiple links detected"
        : undefined,
  };

  return results;
}
