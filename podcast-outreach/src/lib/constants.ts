// ============================================
// MASTER SYSTEM RULES
// These are the "laws" that can never be broken
// ============================================

export const CLAIM_RULES = {
  // HARD GLOBAL RULE: Never imply listening
  FORBIDDEN_PHRASES: [
    "I listened to your episode",
    "I was listening to you",
    "I heard your episode",
    "I read the transcript",
    "I reviewed the transcription",
    "according to the transcript",
    "based on the description",
    "based on the titles",
    "reviewing your catalog",
    "according to your bio",
    "based on your trailer",
  ],

  // Tier 2 - Allowed general phrases
  TIER_2_ALLOWED: [
    "I can see your show focuses heavily on",
    "I like the approach you take toward",
    "Your style tends to be very",
    "I've seen you've had guests like",
    "I noticed your show covers",
  ],

  // Tier 1 Add-on - Allowed connection phrases
  TIER_1_ALLOWED: [
    "Also, I noticed that",
    "It also caught my attention that",
    "I connected with that because",
    "I related because",
    "And one more thing, I related to",
  ],
} as const;

export const STOP_RULE_DEFINITIONS = {
  NONE: "No stop rule applied",
  POLITICS: "Recurring or polarizing politics",
  EXPLICIT: "Explicit/sexual content or recurring vulgarity",
  PAID_GUEST: "Pay-to-appear or selling guest slots",
  FRAUD_PSEUDOSCIENCE: "Fraud signals, conspiracies, dangerous claims",
  NO_GUESTS: "Solo show or explicitly no interviews",
  TIER_3_INSUFFICIENT: "Does not meet Tier 2 evidence requirements",
  NO_CONTACT_ROUTE: "No reliable email or suspicious contact",
  BOUNCE: "Hard bounce or repeated bounce",
  OPT_OUT: "Explicit opt-out or 'don't contact me'",
  SPAM_COMPLAINT: "Complaint or spam signal",
} as const;

export const QA_CHECKLIST = [
  { id: "voice", label: "Email is in Joey's voice, first person", required: true },
  { id: "noListening", label: "No listening language or transcript/description mentions", required: true },
  { id: "tier2Met", label: "Tier 2 requirements are met", required: true },
  { id: "anchorValid", label: "Tier 2 anchor is general or mentions verified guest", required: true },
  { id: "tier1Valid", label: "If Tier 1 add-on exists, it's strong, broad, non-invasive", required: false },
  { id: "maxAnchors", label: "Maximum 2 total anchors", required: true },
  { id: "nameVerified", label: "Host name is verified or uses neutral greeting", required: true },
  { id: "noFalseRelationship", label: "No invented relationship or false familiarity", required: true },
  { id: "noStopRules", label: "No active Stop Rules", required: true },
  { id: "deliverability", label: "Simple text, no attachments, minimal links", required: true },
] as const;

export const SENDING_RULES = {
  DAILY_CAP: 10,
  FOLLOW_UP_DELAY_DAYS: 7, // Days to wait before follow-up
  ESCALATION_DELAY_DAYS: 7, // Days to wait before trying backup email
  CLOSE_NO_RESPONSE_DAYS: 14, // Days after last touch to close as no response
  MAX_FOLLOW_UPS: 1,
  MAX_BACKUP_ATTEMPTS: 1,
  MIN_HOURS_BETWEEN_SENDS: 1,
  PAUSE_TRIGGERS: {
    BOUNCE_THRESHOLD: 3,
    NEGATIVE_REPLY_THRESHOLD: 5,
    REPLY_RATE_FLOOR: 0.05, // Pause if below 5%
  },
} as const;

export const JOEY_PROFILE_DEFAULT = {
  positioningStatements: [
    "Evidence-based fat loss and body recomposition",
    "PhD-level scientific approach",
    "Sustainable habits over quick fixes",
    "Practical, measurable results",
  ],
  credibilityAssets: [
    "PhD in relevant field",
    "Proven client results",
    "Fit4Life Academy founder",
  ],
  personalTraits: [
    "Cuban immigrant",
    "Born in Miami",
    "Dedicated father",
    "Disciplined training approach",
  ],
  connectionHooks: [
    "Balancing training with parenting and work demands",
    "Evidence over hype",
    "Anti-BS approach to fitness",
    "Sustainable long-term transformation",
  ],
} as const;

export const DISCOVERY_CONFIG = {
  TRANSCRIPT_EPISODE_SCOPE: 3, // Check last 3 episodes
  TRANSCRIPT_EPISODE_SCOPE_EXPANDED: 5, // Expand to 5 if needed
  MAX_EPISODE_TITLES: 10,
  SEED_GUEST_LIMITS: {
    FITNESS_FAT_LOSS: 15,
    GENERAL_HEALTH_LONGEVITY: 10,
    ENTREPRENEUR_CEO: 10,
    DAD_PARENTING: 5,
  },
} as const;

// ============================================
// PIPELINE & UI CONSTANTS
// ============================================

export const OUTREACH_STATUS_CONFIG = [
  { id: "NOT_CONTACTED", label: "Not Contacted", color: "gray" },
  { id: "READY_TO_DRAFT", label: "Ready to Draft", color: "blue" },
  { id: "DRAFTED", label: "Drafted", color: "yellow" },
  { id: "QA_APPROVED", label: "QA Approved", color: "green" },
  { id: "SENT", label: "Sent", color: "purple" },
  { id: "FOLLOW_UP_DUE", label: "Follow-up Due", color: "orange" },
  { id: "FOLLOW_UP_SENT", label: "Follow-up Sent", color: "purple" },
  { id: "ESCALATION_DUE", label: "Escalation Due", color: "orange" },
  { id: "ESCALATED", label: "Escalated", color: "purple" },
  { id: "REPLIED", label: "Replied", color: "emerald" },
  { id: "CLOSED", label: "Closed", color: "gray" },
] as const;

export const TIER_CONFIG = [
  { id: "PENDING", label: "Pending Review", color: "gray" },
  { id: "TIER_1", label: "Tier 1 - Strong Match", color: "emerald" },
  { id: "TIER_2", label: "Tier 2 - Good Match", color: "blue" },
  { id: "TIER_3", label: "Tier 3 - No Send", color: "red" },
] as const;

export const OUTCOME_CONFIG = [
  { id: "OPEN", label: "Open", color: "gray" },
  { id: "BOOKED", label: "Booked", color: "emerald" },
  { id: "DECLINED", label: "Declined", color: "red" },
  { id: "NO_RESPONSE", label: "No Response", color: "yellow" },
  { id: "SUPPRESSED", label: "Suppressed", color: "gray" },
  { id: "BOUNCED", label: "Bounced", color: "red" },
  { id: "OPT_OUT", label: "Opted Out", color: "red" },
] as const;

export const ANGLE_CONFIG = [
  { id: "FAT_LOSS", label: "Fat Loss", category: "FITNESS_FAT_LOSS" },
  { id: "GENERAL_HEALTH", label: "General Health", category: "GENERAL_HEALTH_LONGEVITY" },
  { id: "LONGEVITY", label: "Longevity", category: "GENERAL_HEALTH_LONGEVITY" },
  { id: "DADS_PARENTING", label: "Dads & Parenting", category: "DAD_PARENTING" },
  { id: "CEO_PERFORMANCE", label: "CEO Performance", category: "ENTREPRENEUR_CEO" },
  { id: "PERSONAL_DEVELOPMENT", label: "Personal Development", category: "ENTREPRENEUR_CEO" },
  { id: "EVIDENCE_BASED_NUTRITION", label: "Evidence-Based Nutrition", category: "FITNESS_FAT_LOSS" },
  { id: "BODY_RECOMPOSITION", label: "Body Recomposition", category: "FITNESS_FAT_LOSS" },
] as const;

export const SEED_CATEGORY_CONFIG = [
  { id: "FITNESS_FAT_LOSS", label: "Fitness & Fat Loss", limit: 15 },
  { id: "GENERAL_HEALTH_LONGEVITY", label: "General Health & Longevity", limit: 10 },
  { id: "ENTREPRENEUR_CEO", label: "Entrepreneur & CEO", limit: 10 },
  { id: "DAD_PARENTING", label: "Dad & Parenting", limit: 5 },
] as const;

// ============================================
// TYPE EXPORTS
// ============================================

export type StopRuleKey = keyof typeof STOP_RULE_DEFINITIONS;
export type QAChecklistItem = (typeof QA_CHECKLIST)[number];
export type OutreachStatusId = (typeof OUTREACH_STATUS_CONFIG)[number]["id"];
export type TierId = (typeof TIER_CONFIG)[number]["id"];
export type OutcomeId = (typeof OUTCOME_CONFIG)[number]["id"];
export type AngleId = (typeof ANGLE_CONFIG)[number]["id"];
export type SeedCategoryId = (typeof SEED_CATEGORY_CONFIG)[number]["id"];

// ============================================
// BACKWARD COMPATIBILITY (for existing pages)
// ============================================

// Map old pipeline stages to new outreach status
export const PIPELINE_STAGES = OUTREACH_STATUS_CONFIG;
export type PipelineStage = OutreachStatusId;

// Podcast categories derived from seed categories
export const PODCAST_CATEGORIES = [
  "Fitness & Fat Loss",
  "General Health & Longevity",
  "Entrepreneur & CEO",
  "Dad & Parenting",
  "Evidence-Based Nutrition",
  "Body Recomposition",
  "Personal Development",
] as const;

// Discovery sources
export const DISCOVERY_SOURCES = [
  { id: "seed_guest", label: "Seed Guest Search", icon: "users" },
  { id: "category", label: "Category Search", icon: "folder" },
  { id: "apple", label: "Apple Podcasts", icon: "apple" },
  { id: "spotify", label: "Spotify", icon: "music" },
  { id: "manual", label: "Manual Entry", icon: "edit" },
  { id: "import", label: "CSV Import", icon: "upload" },
] as const;
