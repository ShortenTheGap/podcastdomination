// Shared in-memory storage for demo campaigns
// This file provides a single source of truth for demo data across all API routes

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

// Use globalThis to ensure persistence across hot reloads and module re-imports
const globalForDemo = globalThis as unknown as {
  demoCampaigns: DemoCampaign[] | undefined;
  initialized: boolean | undefined;
};

function createInitialData(): DemoCampaign[] {
  return [
    {
      id: "demo-1",
      showName: "The Health & Fitness Podcast",
      hostName: "Dr. Sarah Johnson",
      primaryEmail: "sarah@healthpodcast.com",
      tier: "TIER_1",
      status: "sent_awaiting",
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

// Get all demo campaigns
export function getDemoCampaigns(): DemoCampaign[] {
  if (!globalForDemo.initialized) {
    globalForDemo.demoCampaigns = createInitialData();
    globalForDemo.initialized = true;
  }
  return globalForDemo.demoCampaigns!;
}

// Update a campaign by ID
export function updateDemoCampaign(id: string, updates: Partial<DemoCampaign>): boolean {
  const campaigns = getDemoCampaigns();
  const index = campaigns.findIndex(c => c.id === id);
  if (index !== -1) {
    globalForDemo.demoCampaigns![index] = { ...campaigns[index], ...updates };
    console.log(`[Demo] Updated campaign ${id}:`, updates);
    return true;
  }
  console.log(`[Demo] Campaign ${id} not found`);
  return false;
}

// Get a single campaign by ID
export function getDemoCampaign(id: string): DemoCampaign | undefined {
  return getDemoCampaigns().find(c => c.id === id);
}
