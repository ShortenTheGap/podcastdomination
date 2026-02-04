"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface EmailVerificationBadgeProps {
  email: string;
  podcastId?: string;
  className?: string;
  showVerifyButton?: boolean;
}

interface VerificationResult {
  isValid: boolean;
  confidence: number;
  status: string;
  reason: string;
}

export function EmailVerificationBadge({
  email,
  podcastId,
  className,
  showVerifyButton = true,
}: EmailVerificationBadgeProps) {
  const [isVerifying, setIsVerifying] = useState(false);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleVerify = async () => {
    setIsVerifying(true);
    setError(null);
    
    try {
      const response = await fetch("/api/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          podcastId,
          updatePodcast: !!podcastId,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Verification failed");
      }

      const data = await response.json();
      setResult({
        isValid: data.isValid,
        confidence: data.confidence,
        status: data.status,
        reason: data.reason,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setIsVerifying(false);
    }
  };

  // Determine badge color based on result
  const getBadgeColor = () => {
    if (!result) return "bg-zinc-700 text-zinc-300";
    if (result.confidence >= 80) return "bg-emerald-500/20 text-emerald-400";
    if (result.confidence >= 50) return "bg-yellow-500/20 text-yellow-400";
    return "bg-red-500/20 text-red-400";
  };

  const getStatusIcon = () => {
    if (!result) return null;
    if (result.confidence >= 80) {
      return (
        <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
            clipRule="evenodd"
          />
        </svg>
      );
    }
    if (result.confidence >= 50) {
      return (
        <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
            clipRule="evenodd"
          />
        </svg>
      );
    }
    return (
      <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
          clipRule="evenodd"
        />
      </svg>
    );
  };

  if (error) {
    return (
      <span className={cn("inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium bg-red-500/20 text-red-400", className)}>
        Error: {error}
      </span>
    );
  }

  if (result) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium",
          getBadgeColor(),
          className
        )}
        title={result.reason}
      >
        {getStatusIcon()}
        {result.confidence}% valid
      </span>
    );
  }

  if (!showVerifyButton) {
    return null;
  }

  return (
    <button
      onClick={handleVerify}
      disabled={isVerifying}
      className={cn(
        "inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium transition-colors",
        "bg-zinc-700 text-zinc-300 hover:bg-zinc-600",
        isVerifying && "opacity-50 cursor-not-allowed",
        className
      )}
    >
      {isVerifying ? (
        <>
          <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
              fill="none"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          Verifying...
        </>
      ) : (
        <>
          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          Verify
        </>
      )}
    </button>
  );
}


