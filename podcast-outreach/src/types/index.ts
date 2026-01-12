import type { Podcast, Episode, Contact, Angle, Outreach } from "@prisma/client";

// Re-export Prisma types
export type { Podcast, Episode, Contact, Angle, Outreach };

// Extended types with relations
export type PodcastWithRelations = Podcast & {
  contacts: Contact[];
  episodes: Episode[];
  outreach: Outreach[];
  angles: Angle[];
};

export type OutreachWithRelations = Outreach & {
  podcast: Podcast;
  contact: Contact | null;
  angle: Angle | null;
};

// API request/response types
export interface DiscoveryRequest {
  source: "apple" | "spotify" | "youtube" | "manual";
  query?: string;
  category?: string;
  limit?: number;
}

export interface DiscoveryResult {
  id: string;
  name: string;
  description: string;
  website?: string;
  imageUrl?: string;
  episodeCount: number;
  source: string;
  sourceId: string;
}

export interface AngleGenerationRequest {
  podcastId: string;
  guestProfile?: string;
}

export interface DraftGenerationRequest {
  podcastId: string;
  angleId: string;
  contactId?: string;
  templateId?: string;
}

export interface SendEmailRequest {
  outreachId: string;
  scheduledAt?: string;
}

// Pipeline types
export interface PipelineColumn {
  id: string;
  label: string;
  color: string;
  items: OutreachWithRelations[];
}

export interface PipelineFilters {
  search?: string;
  category?: string;
  priority?: number;
  dateRange?: {
    start: Date;
    end: Date;
  };
}

// Analytics types
export interface AnalyticsData {
  period: string;
  sent: number;
  opened: number;
  replied: number;
  booked: number;
  openRate: number;
  replyRate: number;
  bookingRate: number;
}

export interface PipelineStats {
  total: number;
  byStage: Record<string, number>;
  byCategory: Record<string, number>;
  avgTimeToReply: number;
  avgTimeToBook: number;
}

// Settings types
export interface GuestProfile {
  name: string;
  title: string;
  company: string;
  bio: string;
  topics: string[];
  credentials: string[];
  previousAppearances: string[];
  uniqueAngle: string;
  photoUrl?: string;
  websiteUrl?: string;
  linkedinUrl?: string;
  twitterUrl?: string;
}

export interface EmailSettings {
  senderName: string;
  senderEmail: string;
  signature: string;
  followUpEnabled: boolean;
  followUpSchedule: {
    followup1: number;
    followup2: number;
    followup3: number;
  };
}

export interface AppSettings {
  guestProfile: GuestProfile;
  emailSettings: EmailSettings;
  gmailConnected: boolean;
  aiProvider: "anthropic" | "openai";
}
