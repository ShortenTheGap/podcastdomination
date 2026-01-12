"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  Podcast,
  PodcastWithRelations,
  OutreachWithRelations,
  PipelineFilters,
  DiscoveryRequest,
  DiscoveryResult,
} from "@/types";

// Fetch all podcasts
export function usePodcasts() {
  return useQuery<Podcast[]>({
    queryKey: ["podcasts"],
    queryFn: async () => {
      const res = await fetch("/api/podcasts");
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

// Fetch pipeline data
export function usePipeline(filters?: PipelineFilters) {
  return useQuery<OutreachWithRelations[]>({
    queryKey: ["pipeline", filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.search) params.set("search", filters.search);
      if (filters?.category) params.set("category", filters.category);
      if (filters?.priority !== undefined)
        params.set("priority", String(filters.priority));

      const res = await fetch(`/api/podcasts/pipeline?${params}`);
      if (!res.ok) throw new Error("Failed to fetch pipeline");
      return res.json();
    },
  });
}

// Discovery search
export function useDiscovery() {
  const queryClient = useQueryClient();

  return useMutation<DiscoveryResult[], Error, DiscoveryRequest>({
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
      const res = await fetch("/api/podcasts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(podcast),
      });
      if (!res.ok) throw new Error("Failed to import podcast");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["podcasts"] });
      queryClient.invalidateQueries({ queryKey: ["pipeline"] });
    },
  });
}

// Update outreach status
export function useUpdateOutreach() {
  const queryClient = useQueryClient();

  return useMutation<
    OutreachWithRelations,
    Error,
    { id: string; data: Partial<OutreachWithRelations> }
  >({
    mutationFn: async ({ id, data }) => {
      const res = await fetch(`/api/podcasts/outreach/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update outreach");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pipeline"] });
    },
  });
}

// Generate angles for a podcast
export function useGenerateAngles() {
  const queryClient = useQueryClient();

  return useMutation<
    { angles: Array<{ title: string; description: string }> },
    Error,
    { podcastId: string }
  >({
    mutationFn: async ({ podcastId }) => {
      const res = await fetch("/api/ai/analyze-angle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ podcastId }),
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

  return useMutation<
    { subject: string; body: string },
    Error,
    { podcastId: string; angleId: string; contactId?: string }
  >({
    mutationFn: async (data) => {
      const res = await fetch("/api/ai/generate-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to generate draft");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pipeline"] });
    },
  });
}

// Send email
export function useSendEmail() {
  const queryClient = useQueryClient();

  return useMutation<{ messageId: string }, Error, { outreachId: string }>({
    mutationFn: async ({ outreachId }) => {
      const res = await fetch("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outreachId }),
      });
      if (!res.ok) throw new Error("Failed to send email");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pipeline"] });
    },
  });
}
