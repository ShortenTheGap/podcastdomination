// File-based persistent storage for campaigns
// This ensures data survives server restarts

import { promises as fs } from "fs";
import path from "path";

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

// Storage file path - in the project's data directory
const DATA_DIR = path.join(process.cwd(), "data");
const CAMPAIGNS_FILE = path.join(DATA_DIR, "campaigns.json");

// In-memory cache for performance
let campaignsCache: StoredCampaign[] | null = null;
let cacheLoaded = false;

// Ensure data directory exists
async function ensureDataDir(): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch {
    // Directory may already exist
  }
}

// Load campaigns from file
async function loadFromFile(): Promise<StoredCampaign[]> {
  try {
    await ensureDataDir();
    const data = await fs.readFile(CAMPAIGNS_FILE, "utf-8");
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return [];
  } catch (error) {
    // File doesn't exist or is invalid - return empty array
    console.log("[Storage] No existing campaigns file, starting fresh");
    return [];
  }
}

// Save campaigns to file
async function saveToFile(campaigns: StoredCampaign[]): Promise<void> {
  try {
    await ensureDataDir();
    await fs.writeFile(CAMPAIGNS_FILE, JSON.stringify(campaigns, null, 2), "utf-8");
    console.log(`[Storage] Saved ${campaigns.length} campaigns to file`);
  } catch (error) {
    console.error("[Storage] Failed to save campaigns:", error);
    throw error;
  }
}

// Get all campaigns (with file persistence)
export async function getCampaigns(): Promise<StoredCampaign[]> {
  if (!cacheLoaded) {
    campaignsCache = await loadFromFile();
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
  const campaigns = await getCampaigns();
  const index = campaigns.findIndex((c) => c.id === id);

  if (index !== -1) {
    campaignsCache![index] = {
      ...campaigns[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    await saveToFile(campaignsCache!);
    console.log(`[Storage] Updated campaign ${id}:`, Object.keys(updates));
    return true;
  }

  console.log(`[Storage] Campaign ${id} not found for update`);
  return false;
}

// Add a new campaign
export async function addCampaign(campaign: StoredCampaign): Promise<void> {
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

  await saveToFile(campaignsCache!);
  console.log(`[Storage] Added/updated campaign ${campaign.id}`);
}

// Bulk save/sync all campaigns (replaces entire dataset)
export async function syncCampaigns(campaigns: StoredCampaign[]): Promise<void> {
  campaignsCache = campaigns.map((c) => ({
    ...c,
    updatedAt: new Date().toISOString(),
  }));
  cacheLoaded = true;
  await saveToFile(campaignsCache);
  console.log(`[Storage] Synced ${campaigns.length} campaigns`);
}

// Delete a campaign
export async function deleteCampaign(id: string): Promise<boolean> {
  const campaigns = await getCampaigns();
  const index = campaigns.findIndex((c) => c.id === id);

  if (index !== -1) {
    campaignsCache!.splice(index, 1);
    await saveToFile(campaignsCache!);
    console.log(`[Storage] Deleted campaign ${id}`);
    return true;
  }

  return false;
}

// Clear cache (useful for testing)
export function clearCache(): void {
  campaignsCache = null;
  cacheLoaded = false;
}

// Initialize with default data if empty
export async function initializeWithDefaults(defaults: StoredCampaign[]): Promise<void> {
  const existing = await getCampaigns();
  if (existing.length === 0) {
    await syncCampaigns(defaults);
    console.log(`[Storage] Initialized with ${defaults.length} default campaigns`);
  }
}
