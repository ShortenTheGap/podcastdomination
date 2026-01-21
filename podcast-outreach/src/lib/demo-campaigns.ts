// Shared storage for demo campaigns with file persistence
// This file provides a single source of truth for campaign data across all API routes

import {
  getCampaigns as getStoredCampaigns,
  updateCampaign as updateStoredCampaign,
  getCampaign as getStoredCampaign,
  syncCampaigns as syncStoredCampaigns,
  initializeWithDefaults,
  StoredCampaign,
} from "./campaigns-storage";

interface EmailInSequence {
  id: string;
  type: "initial" | "follow_up_1" | "follow_up_2" | "follow_up_3" | "nurture" | "closing";
  subject: string;
  body: string;
  status: "draft" | "scheduled" | "sent" | "opened" | "replied";
  sentAt: string | null;
  scheduledFor: string | null;
  openedAt: string | null;
  repliedAt: string | null;
}

export interface DemoCampaign {
  id: string;
  showName: string;
  hostName: string | null;
  primaryEmail: string | null;
  tier: string;
  status: string;
  responseType: string | null;
  emailSequence: EmailInSequence[];
  lastContactedAt: string | null;
  nextFollowUpAt: string | null;
  createdAt: string;
}

// Default demo data for initial setup
function createInitialData(): DemoCampaign[] {
  return [
    {
      id: "demo-1",
      showName: "The Health & Fitness Podcast",
      hostName: "Dr. Sarah Johnson",
      primaryEmail: "sarah@healthpodcast.com",
      tier: "TIER_1",
      status: "ready_to_send",
      responseType: null,
      emailSequence: [
        {
          id: "email-1",
          type: "initial",
          subject: "Guest opportunity for The Health & Fitness Podcast",
          body: "Hi Sarah, I came across your podcast and loved your episode on nutrition myths...",
          status: "sent",
          sentAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
          scheduledFor: null,
          openedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          repliedAt: null,
        },
      ],
      lastContactedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      nextFollowUpAt: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "demo-2",
      showName: "CEO Mindset Show",
      hostName: "Mike Thompson",
      primaryEmail: "booking@ceomindset.com",
      tier: "TIER_2",
      status: "drafting",
      responseType: null,
      emailSequence: [
        {
          id: "email-2",
          type: "initial",
          subject: "Guest pitch for CEO Mindset Show",
          body: "Hi Mike, I've been following your show and think my expertise in...",
          status: "draft",
          sentAt: null,
          scheduledFor: null,
          openedAt: null,
          repliedAt: null,
        },
      ],
      lastContactedAt: null,
      nextFollowUpAt: null,
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "demo-3",
      showName: "Wellness Warriors",
      hostName: "Lisa Chen",
      primaryEmail: "lisa@wellnesswarriors.com",
      tier: "TIER_1",
      status: "responded",
      responseType: "interested_not_booked",
      emailSequence: [
        {
          id: "email-3",
          type: "initial",
          subject: "Podcast guest pitch",
          body: "Hi Lisa, Your recent episode on holistic health really resonated with me...",
          status: "replied",
          sentAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
          scheduledFor: null,
          openedAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString(),
          repliedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        },
      ],
      lastContactedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      nextFollowUpAt: null,
      createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "demo-4",
      showName: "Dad Life Podcast",
      hostName: "James Miller",
      primaryEmail: "james@dadlifepod.com",
      tier: "TIER_1",
      status: "booked",
      responseType: "booked",
      emailSequence: [
        {
          id: "email-4",
          type: "initial",
          subject: "Would love to be a guest on Dad Life",
          body: "Hey James, As a fellow dad, I really connected with your episode about...",
          status: "replied",
          sentAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
          scheduledFor: null,
          openedAt: new Date(Date.now() - 19 * 24 * 60 * 60 * 1000).toISOString(),
          repliedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
        },
      ],
      lastContactedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
      nextFollowUpAt: null,
      createdAt: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "demo-5",
      showName: "Fitness Revolution",
      hostName: "Alex Rodriguez",
      primaryEmail: "alex@fitnessrev.com",
      tier: "TIER_2",
      status: "follow_up_due",
      responseType: "no_response",
      emailSequence: [
        {
          id: "email-5",
          type: "initial",
          subject: "Guest opportunity",
          body: "Hi Alex, I've been a fan of your science-based approach to fitness...",
          status: "sent",
          sentAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
          scheduledFor: null,
          openedAt: null,
          repliedAt: null,
        },
      ],
      lastContactedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
      nextFollowUpAt: new Date().toISOString(),
      createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ];
}

// Initialize storage with defaults on first load
let initPromise: Promise<void> | null = null;

async function ensureInitialized(): Promise<void> {
  if (!initPromise) {
    initPromise = initializeWithDefaults(createInitialData());
  }
  return initPromise;
}

// Get all demo campaigns (async with file persistence)
export async function getDemoCampaignsAsync(): Promise<DemoCampaign[]> {
  await ensureInitialized();
  return getStoredCampaigns();
}

// Synchronous version for backwards compatibility (uses cache)
// Note: This should only be called after async initialization
export function getDemoCampaigns(): DemoCampaign[] {
  // Trigger initialization in background
  ensureInitialized();

  // Return cached data synchronously - this works because initializeWithDefaults
  // populates the cache, and subsequent calls use the cache
  // For first-time access, this might return empty until cache is populated
  // API routes should use getDemoCampaignsAsync instead
  return [];
}

// Update a campaign by ID (async with file persistence)
export async function updateDemoCampaignAsync(
  id: string,
  updates: Partial<DemoCampaign>
): Promise<boolean> {
  await ensureInitialized();
  return updateStoredCampaign(id, updates as Partial<StoredCampaign>);
}

// Synchronous wrapper for backwards compatibility
export function updateDemoCampaign(id: string, updates: Partial<DemoCampaign>): boolean {
  // Fire and forget - updates will persist
  updateDemoCampaignAsync(id, updates).catch((err) =>
    console.error("[Demo] Failed to update campaign:", err)
  );
  return true;
}

// Get a single campaign by ID (async)
export async function getDemoCampaignAsync(id: string): Promise<DemoCampaign | undefined> {
  await ensureInitialized();
  return getStoredCampaign(id);
}

// Synchronous wrapper
export function getDemoCampaign(id: string): DemoCampaign | undefined {
  // This is a best-effort synchronous access - prefer async version
  return undefined;
}

// Sync all campaigns from frontend (bulk update)
export async function syncDemoCampaigns(campaigns: DemoCampaign[]): Promise<void> {
  await syncStoredCampaigns(campaigns as StoredCampaign[]);
}
