// Type definitions for Podcast Outreach
// These match the Prisma schema but are defined locally for build reliability

// Enums (matching Prisma schema)
export type Tier = "PENDING" | "TIER_1" | "TIER_2" | "TIER_3";

export type StopRule =
  | "NONE"
  | "POLITICS"
  | "EXPLICIT"
  | "PAID_GUEST"
  | "FRAUD_PSEUDOSCIENCE"
  | "NO_GUESTS"
  | "TIER_3_INSUFFICIENT"
  | "NO_CONTACT_ROUTE"
  | "BOUNCE"
  | "OPT_OUT"
  | "SPAM_COMPLAINT";

export type OutreachStatus =
  | "NOT_CONTACTED"
  | "READY_TO_DRAFT"
  | "DRAFTED"
  | "QA_APPROVED"
  | "SENT"
  | "FOLLOW_UP_DUE"
  | "FOLLOW_UP_SENT"
  | "ESCALATION_DUE"
  | "ESCALATED"
  | "REPLIED"
  | "CLOSED";

export type QAStatus = "NOT_READY" | "PENDING_REVIEW" | "PASS" | "NEEDS_REVISION";

export type NextAction = "DRAFT" | "QA" | "SEND" | "FOLLOW_UP" | "ESCALATE" | "CLOSE" | "NONE";

export type Outcome =
  | "OPEN"
  | "BOOKED"
  | "DECLINED"
  | "NO_RESPONSE"
  | "SUPPRESSED"
  | "BOUNCED"
  | "OPT_OUT";

export type ReplyType =
  | "POSITIVE"
  | "NEUTRAL"
  | "NEGATIVE"
  | "NOT_NOW"
  | "NEEDS_TOPICS"
  | "NEEDS_MEDIA_KIT"
  | "PAID_ONLY";

export type Angle =
  | "FAT_LOSS"
  | "GENERAL_HEALTH"
  | "LONGEVITY"
  | "DADS_PARENTING"
  | "CEO_PERFORMANCE"
  | "PERSONAL_DEVELOPMENT"
  | "EVIDENCE_BASED_NUTRITION"
  | "BODY_RECOMPOSITION";

export type TouchType = "PRIMARY" | "FOLLOW_UP" | "BACKUP";

export type SeedCategory =
  | "FITNESS_FAT_LOSS"
  | "GENERAL_HEALTH_LONGEVITY"
  | "ENTREPRENEUR_CEO"
  | "DAD_PARENTING";

// Core entity types
export interface Podcast {
  id: string;
  dedupeKey: string;
  showName: string;
  hostName: string | null;
  showDescription: string | null;
  websiteUrl: string | null;
  applePodcastUrl: string | null;
  spotifyUrl: string | null;
  primaryPlatformUrl: string;
  primaryEmail: string | null;
  primaryEmailSourceUrl: string | null;
  backupEmail: string | null;
  backupEmailSourceUrl: string | null;
  tier: Tier;
  tier2Anchor: string | null;
  tier2EvidenceUrl: string | null;
  tier1AddOnLine: string | null;
  tier1TranscriptUrl: string | null;
  evidenceNotes: string | null;
  recentEpisodeTitles: string[];
  recentGuests: string[];
  transcriptContent: string | null;
  stopRule: StopRule;
  suppressed: boolean;
  suppressedAt: Date | null;
  suppressionEvidence: string | null;
  status: OutreachStatus;
  emailDraft: string | null;
  emailSubject: string | null;
  selectedAngle: Angle | null;
  selectedLeadMagnet: string | null;
  qaStatus: QAStatus;
  qaChecklist: Record<string, boolean> | null;
  qaApprovedAt: Date | null;
  qaApprovedBy: string | null;
  sentPrimaryAt: Date | null;
  followUpSentAt: Date | null;
  sentBackupAt: Date | null;
  replyReceivedAt: Date | null;
  replyType: ReplyType | null;
  nextAction: NextAction | null;
  nextActionDate: Date | null;
  outcome: Outcome;
  discoverySource: string | null;
  discoveryBatch: string | null;
  isNew: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Touch {
  id: string;
  podcastId: string;
  type: TouchType;
  contactUsed: string;
  sentAt: Date;
  emailBody: string;
  emailSubject: string;
  opened: boolean;
  openedAt: Date | null;
  replied: boolean;
  repliedAt: Date | null;
  bounced: boolean;
  bouncedAt: Date | null;
  createdAt: Date;
}

export interface Note {
  id: string;
  podcastId: string;
  content: string;
  author: string;
  createdAt: Date;
}

export interface SeedGuest {
  id: string;
  name: string;
  category: SeedCategory;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
}

export interface LeadMagnet {
  id: string;
  name: string;
  description: string;
  url: string;
  matchAngles: Angle[];
  ctaSnippet: string;
  isDefault: boolean;
  createdAt: Date;
}

export interface JoeyProfile {
  id: string;
  positioningStatements: string[];
  credibilityAssets: string[];
  anglePillars: Angle[];
  allowedTopics: string[];
  noGoTopics: string[];
  personalTraits: string[];
  connectionHooks: string[];
  safeConnectionStatements: string[];
  updatedAt: Date;
}

export interface SystemConfig {
  id: string;
  dailySendCap: number;
  followUpWindowDays: number;
  maxFollowUps: number;
  maxBackupAttempts: number;
  transcriptEpisodeScope: number;
  updatedAt: Date;
}

// Extended types with relations
export type PodcastWithRelations = Podcast & {
  touches?: Touch[];
  notes?: Note[];
  _count?: {
    touches: number;
    notes: number;
  };
};

export type TouchWithPodcast = Touch & {
  podcast: Podcast;
};

// API request/response types
export interface DiscoveryRequest {
  type: "seed_guest" | "category";
  query: string;
  category?: string; // Optional category for seed_guest searches
  limit?: number;
}

export interface DiscoveryResult {
  showName: string;
  hostName: string | null;
  showDescription: string | null;
  primaryPlatformUrl: string;
  applePodcastUrl: string | null;
  websiteUrl: string | null;
  spotifyUrl: string | null;
  dedupeKey: string;
  recentEpisodeTitles: string[];
  recentGuests: string[];
  primaryEmail: string | null;
  primaryEmailSourceUrl: string | null;
  backupEmail: string | null;
  backupEmailSourceUrl: string | null;
  discoverySource: string;
  riskSignals: string[];
  // Additional display fields from Apple Podcasts
  artworkUrl?: string | null;
  genre?: string | null;
  genres?: string[];
  episodeCount?: number;
  lastReleaseDate?: string | null;
  country?: string | null;
  contentRating?: string | null;
  feedUrl?: string | null;
}

export interface AngleGenerationRequest {
  podcastId: string;
  guestProfile?: string;
}

export interface AngleResult {
  angle: Angle;
  confidence: number;
  reasoning: string;
  tier2Anchor: string;
  tier1Opportunity?: string;
}

export interface DraftGenerationRequest {
  podcastId: string;
  angle: Angle;
}

export interface DraftResult {
  emailSubject: string;
  emailDraft: string;
  angle: Angle;
  tier2Anchor: string;
  tier1AddOnLine?: string;
}

export interface SendEmailRequest {
  podcastId: string;
  useBackupEmail?: boolean;
  scheduledAt?: string;
}

export interface SendEmailResult {
  success: boolean;
  touchId: string;
  messageId: string;
  threadId: string;
  type: TouchType;
}

// Pipeline types
export interface PipelineColumn {
  id: OutreachStatus;
  label: string;
  color: string;
  items: PodcastWithRelations[];
}

export interface PipelineFilters {
  search?: string;
  status?: OutreachStatus[];
  tier?: Tier[];
  angle?: Angle[];
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
  byStatus: Record<OutreachStatus, number>;
  byTier: Record<Tier, number>;
  byAngle: Record<Angle, number>;
  avgTimeToReply: number;
  avgTimeToBook: number;
}

// QA types
export interface QAChecklistItem {
  id: string;
  label: string;
  required: boolean;
  checked?: boolean;
}

export interface QAChecklistState {
  [key: string]: boolean;
}

// Settings/Profile types
export interface JoeyProfileUpdate {
  positioningStatements?: string[];
  credibilityAssets?: string[];
  anglePillars?: Angle[];
  allowedTopics?: string[];
  noGoTopics?: string[];
  personalTraits?: string[];
  connectionHooks?: string[];
  safeConnectionStatements?: string[];
}

export interface SystemConfigUpdate {
  dailySendCap?: number;
  followUpWindowDays?: number;
  maxFollowUps?: number;
  maxBackupAttempts?: number;
  transcriptEpisodeScope?: number;
}

// Seed Guest types
export interface SeedGuestCreate {
  name: string;
  category: SeedCategory;
  notes?: string;
}

// Lead Magnet types
export interface LeadMagnetCreate {
  name: string;
  description: string;
  url: string;
  matchAngles: Angle[];
  ctaSnippet: string;
  isDefault?: boolean;
}
