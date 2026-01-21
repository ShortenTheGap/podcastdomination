// Database-based persistent storage for campaigns
// This ensures data survives Railway deployments and container restarts
// Uses a key-value store pattern with JSON serialization

import { db } from "./db";

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

export interface StoredCampaign {
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
  updatedAt?: string;
}

// Storage key for campaigns data
const CAMPAIGNS_KEY = "outreach-campaigns";

// In-memory cache for performance
let campaignsCache: StoredCampaign[] | null = null;
let cacheLoaded = false;

// Simple write lock to prevent concurrent database writes
let writeLock: Promise<void> = Promise.resolve();

async function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  // Wait for any pending write to complete
  await writeLock;
  // Create a new lock promise
  let releaseLock: () => void;
  writeLock = new Promise((resolve) => {
    releaseLock = resolve;
  });
  try {
    return await fn();
  } finally {
    releaseLock!();
  }
}

// Try to create the KeyValueStore table if it doesn't exist
async function ensureTableExists(): Promise<boolean> {
  try {
    // Try a simple query first
    await db.keyValueStore.findUnique({ where: { key: "__test__" } });
    return true;
  } catch (error) {
    // Table doesn't exist, try to create it with raw SQL
    console.log("[Storage] KeyValueStore table not found, attempting to create...");
    try {
      await db.$executeRaw`
        CREATE TABLE IF NOT EXISTS "KeyValueStore" (
          "key" TEXT NOT NULL,
          "value" TEXT NOT NULL,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "KeyValueStore_pkey" PRIMARY KEY ("key")
        )
      `;
      console.log("[Storage] KeyValueStore table created successfully");
      return true;
    } catch (createError) {
      console.error("[Storage] Failed to create KeyValueStore table:", createError instanceof Error ? createError.message : createError);
      return false;
    }
  }
}

// Track if table exists
let tableExists: boolean | null = null;

// Load campaigns from database
async function loadFromDatabase(): Promise<StoredCampaign[]> {
  try {
    // Ensure table exists (only check once)
    if (tableExists === null) {
      tableExists = await ensureTableExists();
    }

    if (!tableExists) {
      console.warn("[Storage] Database table not available, returning empty array");
      return [];
    }

    // Try to read from KeyValueStore
    const record = await db.keyValueStore.findUnique({
      where: { key: CAMPAIGNS_KEY },
    });

    if (record?.value) {
      const parsed = JSON.parse(record.value);
      if (Array.isArray(parsed)) {
        console.log(`[Storage] Loaded ${parsed.length} campaigns from database`);
        return parsed;
      }
    }
    console.log("[Storage] No campaigns in database, returning empty array");
    return [];
  } catch (error) {
    // Database error - return empty
    console.warn("[Storage] Database read failed:", error instanceof Error ? error.message : error);
    return [];
  }
}

// Save campaigns to database
async function saveToDatabase(campaigns: StoredCampaign[]): Promise<void> {
  try {
    // Ensure table exists (only check once)
    if (tableExists === null) {
      tableExists = await ensureTableExists();
    }

    if (!tableExists) {
      console.warn("[Storage] Database table not available, skipping save");
      return;
    }

    const value = JSON.stringify(campaigns);

    // Upsert - create or update
    await db.keyValueStore.upsert({
      where: { key: CAMPAIGNS_KEY },
      update: { value },
      create: { key: CAMPAIGNS_KEY, value },
    });

    console.log(`[Storage] Saved ${campaigns.length} campaigns to database`);
  } catch (error) {
    // If database fails, log but don't crash
    // The localStorage fallback on frontend will keep data safe
    console.error("[Storage] Database write failed:", error instanceof Error ? error.message : error);
    throw error;
  }
}

// Get all campaigns (with database persistence)
export async function getCampaigns(): Promise<StoredCampaign[]> {
  if (!cacheLoaded) {
    campaignsCache = await loadFromDatabase();
    cacheLoaded = true;
  }
  return campaignsCache || [];
}

// Get a single campaign by ID
export async function getCampaign(id: string): Promise<StoredCampaign | undefined> {
  const campaigns = await getCampaigns();
  return campaigns.find((c) => c.id === id);
}

// Update a single campaign
export async function updateCampaign(
  id: string,
  updates: Partial<StoredCampaign>
): Promise<boolean> {
  return withWriteLock(async () => {
    const campaigns = await getCampaigns();
    const index = campaigns.findIndex((c) => c.id === id);

    if (index !== -1) {
      campaignsCache![index] = {
        ...campaigns[index],
        ...updates,
        updatedAt: new Date().toISOString(),
      };
      await saveToDatabase(campaignsCache!);
      console.log(`[Storage] Updated campaign ${id}:`, Object.keys(updates));
      return true;
    }

    console.log(`[Storage] Campaign ${id} not found for update`);
    return false;
  });
}

// Add a new campaign
export async function addCampaign(campaign: StoredCampaign): Promise<void> {
  return withWriteLock(async () => {
    const campaigns = await getCampaigns();
    const existingIndex = campaigns.findIndex((c) => c.id === campaign.id);

    if (existingIndex !== -1) {
      // Update existing
      campaignsCache![existingIndex] = {
        ...campaign,
        updatedAt: new Date().toISOString(),
      };
    } else {
      // Add new
      campaignsCache!.push({
        ...campaign,
        createdAt: campaign.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    await saveToDatabase(campaignsCache!);
    console.log(`[Storage] Added/updated campaign ${campaign.id}`);
  });
}

// Bulk save/sync all campaigns (replaces entire dataset)
export async function syncCampaigns(campaigns: StoredCampaign[]): Promise<void> {
  return withWriteLock(async () => {
    campaignsCache = campaigns.map((c) => ({
      ...c,
      updatedAt: new Date().toISOString(),
    }));
    cacheLoaded = true;
    await saveToDatabase(campaignsCache);
    console.log(`[Storage] Synced ${campaigns.length} campaigns`);
  });
}

// Delete a campaign
export async function deleteCampaign(id: string): Promise<boolean> {
  return withWriteLock(async () => {
    const campaigns = await getCampaigns();
    const index = campaigns.findIndex((c) => c.id === id);

    if (index !== -1) {
      campaignsCache!.splice(index, 1);
      await saveToDatabase(campaignsCache!);
      console.log(`[Storage] Deleted campaign ${id}`);
      return true;
    }

    return false;
  });
}

// Clear cache (useful for testing)
export function clearCache(): void {
  campaignsCache = null;
  cacheLoaded = false;
}

// Initialize with default data if empty
export async function initializeWithDefaults(defaults: StoredCampaign[]): Promise<void> {
  return withWriteLock(async () => {
    // Re-check inside lock to prevent race condition
    if (!cacheLoaded) {
      campaignsCache = await loadFromDatabase();
      cacheLoaded = true;
    }
    if (campaignsCache!.length === 0) {
      campaignsCache = defaults.map((c) => ({
        ...c,
        updatedAt: new Date().toISOString(),
      }));
      await saveToDatabase(campaignsCache);
      console.log(`[Storage] Initialized with ${defaults.length} default campaigns`);
    }
  });
}
