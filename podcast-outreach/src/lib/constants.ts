// Pipeline stages
export const PIPELINE_STAGES = [
  { id: "discovered", label: "Discovered", color: "gray" },
  { id: "researched", label: "Researched", color: "blue" },
  { id: "drafted", label: "Drafted", color: "yellow" },
  { id: "review", label: "In Review", color: "orange" },
  { id: "sent", label: "Sent", color: "purple" },
  { id: "replied", label: "Replied", color: "green" },
  { id: "booked", label: "Booked", color: "emerald" },
  { id: "rejected", label: "Rejected", color: "red" },
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number]["id"];

// Podcast categories
export const PODCAST_CATEGORIES = [
  "Business",
  "Technology",
  "Marketing",
  "Entrepreneurship",
  "Finance",
  "Health & Wellness",
  "Personal Development",
  "Leadership",
  "Sales",
  "Startups",
  "AI & Machine Learning",
  "SaaS",
  "E-commerce",
  "Real Estate",
  "Investing",
] as const;

// Discovery sources
export const DISCOVERY_SOURCES = [
  { id: "apple", label: "Apple Podcasts", icon: "apple" },
  { id: "spotify", label: "Spotify", icon: "spotify" },
  { id: "youtube", label: "YouTube", icon: "youtube" },
  { id: "manual", label: "Manual Entry", icon: "edit" },
  { id: "import", label: "CSV Import", icon: "upload" },
] as const;

// Email types
export const EMAIL_TYPES = [
  { id: "initial", label: "Initial Pitch" },
  { id: "followup1", label: "Follow-up #1" },
  { id: "followup2", label: "Follow-up #2" },
  { id: "followup3", label: "Final Follow-up" },
] as const;

// Follow-up schedule (days after previous email)
export const FOLLOWUP_SCHEDULE = {
  followup1: 5,
  followup2: 7,
  followup3: 14,
} as const;

// Priority levels
export const PRIORITY_LEVELS = [
  { value: 0, label: "Normal", color: "gray" },
  { value: 1, label: "High", color: "yellow" },
  { value: 2, label: "Very High", color: "orange" },
  { value: 3, label: "Critical", color: "red" },
] as const;

// Default guest profile (should be customized in settings)
export const DEFAULT_GUEST_PROFILE = `
Expert in [YOUR FIELD]
Key topics: [TOPIC 1], [TOPIC 2], [TOPIC 3]
Previous appearances: [NOTABLE PODCASTS]
Unique angle: [WHAT MAKES YOU DIFFERENT]
`.trim();

// Rate limits for APIs
export const RATE_LIMITS = {
  appleApi: { requests: 20, windowMs: 60000 },
  spotifyApi: { requests: 30, windowMs: 60000 },
  gmailSend: { requests: 100, windowMs: 86400000 }, // 100/day
  aiGeneration: { requests: 50, windowMs: 3600000 }, // 50/hour
} as const;

// Email validation rules
export const EMAIL_RULES = {
  minLength: 100,
  maxLength: 2000,
  requiredElements: [
    "personalization", // Reference to specific episode/content
    "value_proposition", // What you offer
    "call_to_action", // Clear next step
  ],
  forbiddenPhrases: [
    "to whom it may concern",
    "dear sir/madam",
    "I hope this email finds you well",
    "just following up",
    "circling back",
  ],
} as const;
