"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  Podcast,
  PodcastWithRelations,
  PipelineFilters,
  DiscoveryRequest,
  DiscoveryResult,
  AngleResult,
  DraftResult,
  SendEmailResult,
  Angle,
  OutreachStatus,
} from "@/types";

// Fetch all podcasts
export function usePodcasts(status?: OutreachStatus[]) {
  return useQuery<PodcastWithRelations[]>({
    queryKey: ["podcasts", status],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (status?.length) params.set("status", status.join(","));
      const res = await fetch(`/api/podcasts?${params}`);
      if (!res.ok) throw new Error("Failed to fetch podcasts");
      return res.json();
    },
  });
}

// Fetch single podcast with relations
export function usePodcast(id: string) {
  return useQuery<PodcastWithRelations>({
    queryKey: ["podcasts", id],
    queryFn: async () => {
      const res = await fetch(`/api/podcasts/${id}`);
      if (!res.ok) throw new Error("Failed to fetch podcast");
      return res.json();
    },
    enabled: !!id,
  });
}

// Fetch pipeline data (podcasts organized by status)
export function usePipeline(filters?: PipelineFilters) {
  return useQuery<PodcastWithRelations[]>({
    queryKey: ["pipeline", filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.search) params.set("search", filters.search);
      if (filters?.status?.length) params.set("status", filters.status.join(","));
      if (filters?.tier?.length) params.set("tier", filters.tier.join(","));
      if (filters?.angle?.length) params.set("angle", filters.angle.join(","));

      const res = await fetch(`/api/podcasts?${params}`);
      if (!res.ok) throw new Error("Failed to fetch pipeline");
      return res.json();
    },
  });
}

// Discovery search
export function useDiscovery() {
  const queryClient = useQueryClient();

  return useMutation<{ results: DiscoveryResult[]; count: number }, Error, DiscoveryRequest>({
    mutationFn: async (request) => {
      const res = await fetch("/api/discovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      if (!res.ok) throw new Error("Discovery failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["podcasts"] });
    },
  });
}

// Import discovered podcast
export function useImportPodcast() {
  const queryClient = useQueryClient();

  return useMutation<Podcast, Error, DiscoveryResult>({
    mutationFn: async (podcast) => {
      // Map DiscoveryResult to API-compatible format (exclude extra fields like dedupeKey, riskSignals)
      const payload = {
        showName: podcast.showName,
        hostName: podcast.hostName,
        showDescription: podcast.showDescription,
        primaryPlatformUrl: podcast.primaryPlatformUrl,
        applePodcastUrl: podcast.applePodcastUrl,
        websiteUrl: podcast.websiteUrl,
        spotifyUrl: podcast.spotifyUrl,
        recentEpisodeTitles: podcast.recentEpisodeTitles || [],
        recentGuests: podcast.recentGuests || [],
        primaryEmail: podcast.primaryEmail,
        primaryEmailSourceUrl: podcast.primaryEmailSourceUrl,
        backupEmail: podcast.backupEmail,
        backupEmailSourceUrl: podcast.backupEmailSourceUrl,
        discoverySource: podcast.discoverySource,
        discoveryBatch: new Date().toISOString().slice(0, 7),
      };

      const res = await fetch("/api/podcasts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        if (res.status === 409) {
          throw new Error("This podcast is already in your pipeline");
        }
        throw new Error(errorData.error || "Failed to import podcast");
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["podcasts"] });
      queryClient.invalidateQueries({ queryKey: ["pipeline"] });
    },
  });
}

// Update podcast
export function useUpdatePodcast() {
  const queryClient = useQueryClient();

  return useMutation<
    PodcastWithRelations,
    Error,
    { id: string; data: Partial<Podcast> }
  >({
    mutationFn: async ({ id, data }) => {
      const res = await fetch(`/api/podcasts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update podcast");
      return res.json();
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["podcasts"] });
      queryClient.invalidateQueries({ queryKey: ["podcasts", id] });
      queryClient.invalidateQueries({ queryKey: ["pipeline"] });
    },
  });
}

// Generate angles for a podcast
export function useGenerateAngles() {
  const queryClient = useQueryClient();

  return useMutation<AngleResult, Error, { podcastId: string; guestProfile?: string }>({
    mutationFn: async ({ podcastId, guestProfile }) => {
      const res = await fetch("/api/ai/analyze-angle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ podcastId, guestProfile }),
      });
      if (!res.ok) throw new Error("Failed to generate angles");
      return res.json();
    },
    onSuccess: (_, { podcastId }) => {
      queryClient.invalidateQueries({ queryKey: ["podcasts", podcastId] });
    },
  });
}

// Generate email draft
export function useGenerateDraft() {
  const queryClient = useQueryClient();

  return useMutation<DraftResult, Error, { podcastId: string; angle: Angle }>({
    mutationFn: async (data) => {
      const res = await fetch("/api/ai/generate-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to generate draft");
      return res.json();
    },
    onSuccess: (_, { podcastId }) => {
      queryClient.invalidateQueries({ queryKey: ["podcasts", podcastId] });
      queryClient.invalidateQueries({ queryKey: ["pipeline"] });
      queryClient.invalidateQueries({ queryKey: ["drafts"] });
    },
  });
}

// Fetch drafts pending review
export function useDrafts(status?: string, qaStatus?: string) {
  return useQuery<PodcastWithRelations[]>({
    queryKey: ["drafts", status, qaStatus],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (qaStatus) params.set("qaStatus", qaStatus);
      const res = await fetch(`/api/draft?${params}`);
      if (!res.ok) throw new Error("Failed to fetch drafts");
      return res.json();
    },
  });
}

// Update draft
export function useUpdateDraft() {
  const queryClient = useQueryClient();

  return useMutation<
    PodcastWithRelations,
    Error,
    { podcastId: string; emailSubject?: string; emailDraft?: string; status?: OutreachStatus }
  >({
    mutationFn: async (data) => {
      const res = await fetch("/api/draft", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update draft");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["drafts"] });
      queryClient.invalidateQueries({ queryKey: ["pipeline"] });
    },
  });
}

// Send email
export function useSendEmail() {
  const queryClient = useQueryClient();

  return useMutation<SendEmailResult, Error, { podcastId: string; useBackupEmail?: boolean }>({
    mutationFn: async ({ podcastId, useBackupEmail }) => {
      const res = await fetch("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ podcastId, useBackupEmail }),
      });
      if (!res.ok) throw new Error("Failed to send email");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pipeline"] });
      queryClient.invalidateQueries({ queryKey: ["podcasts"] });
    },
  });
}

// Fetch sent emails
export function useSentEmails(status?: string) {
  return useQuery<PodcastWithRelations[]>({
    queryKey: ["sent", status],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      const res = await fetch(`/api/send?${params}`);
      if (!res.ok) throw new Error("Failed to fetch sent emails");
      return res.json();
    },
  });
}

// Recommendations feed (Best Match or Momentum)
export function useRecommendations() {
  const queryClient = useQueryClient();

  return useMutation<
    { results: DiscoveryResult[]; count: number; type: string },
    Error,
    { type: "best_match" | "momentum"; limit?: number; searchTerms?: string[] }
  >({
    mutationFn: async ({ type, limit = 10, searchTerms }) => {
      const res = await fetch("/api/discovery/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, limit, searchTerms }),
      });
      if (!res.ok) throw new Error("Failed to fetch recommendations");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["podcasts"] });
    },
  });
}
