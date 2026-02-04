/**
 * Settings Library - Manages API keys and configuration in the database
 * 
 * Features:
 * - Encrypted storage for sensitive values (API keys)
 * - Fallback to environment variables if not in database
 * - Caching to reduce database queries
 * - Category-based organization
 */

import { db } from "./db";
import crypto from "crypto";

// Encryption key derived from a secret (use env var in production)
const ENCRYPTION_KEY = process.env.SETTINGS_ENCRYPTION_KEY || 
  crypto.createHash("sha256").update(process.env.DATABASE_URL || "default-key").digest();

const IV_LENGTH = 16;
const ALGORITHM = "aes-256-cbc";

// In-memory cache with TTL
const cache = new Map<string, { value: string | null; expiresAt: number }>();
const CACHE_TTL = 60 * 1000; // 1 minute

/**
 * Encrypt a value using AES-256-CBC
 */
function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return `${iv.toString("hex")}:${encrypted}`;
}

/**
 * Decrypt a value encrypted with AES-256-CBC
 */
function decrypt(encryptedText: string): string {
  try {
    const [ivHex, encrypted] = encryptedText.split(":");
    if (!ivHex || !encrypted) return encryptedText; // Return as-is if not encrypted
    
    const iv = Buffer.from(ivHex, "hex");
    const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch {
    // If decryption fails, return as-is (might not be encrypted)
    return encryptedText;
  }
}

/**
 * Mask a sensitive value for display (e.g., "sk-ant-***...***abc")
 */
export function maskValue(value: string): string {
  if (!value || value.length < 8) return "***";
  const prefix = value.slice(0, 6);
  const suffix = value.slice(-4);
  return `${prefix}...${suffix}`;
}

/**
 * Get a setting value - checks database first, then falls back to environment variable
 * 
 * @param key - The setting key (e.g., "ANTHROPIC_API_KEY")
 * @param defaultValue - Optional default value if not found
 * @returns The setting value or null
 */
export async function getSetting(key: string, defaultValue?: string): Promise<string | null> {
  // Check cache first
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  try {
    // Check database
    const setting = await db.setting.findUnique({
      where: { key },
    });

    if (setting) {
      const value = setting.isSecret ? decrypt(setting.value) : setting.value;
      cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL });
      return value;
    }
  } catch (error) {
    console.error(`Error fetching setting ${key}:`, error);
  }

  // Fallback to environment variable
  const envValue = process.env[key] || defaultValue || null;
  cache.set(key, { value: envValue, expiresAt: Date.now() + CACHE_TTL });
  return envValue;
}

/**
 * Set a setting value in the database
 * 
 * @param key - The setting key
 * @param value - The value to store
 * @param options - Additional options (isSecret, description, category)
 */
export async function setSetting(
  key: string,
  value: string,
  options: {
    isSecret?: boolean;
    description?: string;
    category?: string;
  } = {}
): Promise<void> {
  const { isSecret = true, description, category = "general" } = options;

  const storedValue = isSecret ? encrypt(value) : value;

  await db.setting.upsert({
    where: { key },
    update: {
      value: storedValue,
      isSecret,
      description,
      category,
    },
    create: {
      key,
      value: storedValue,
      isSecret,
      description,
      category,
    },
  });

  // Update cache
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL });
}

/**
 * Delete a setting from the database
 */
export async function deleteSetting(key: string): Promise<void> {
  await db.setting.delete({
    where: { key },
  }).catch(() => null); // Ignore if not found

  cache.delete(key);
}

/**
 * Get all settings (with masked values for secrets)
 */
export async function getAllSettings(): Promise<Array<{
  key: string;
  value: string;
  maskedValue: string;
  isSecret: boolean;
  description: string | null;
  category: string;
  updatedAt: Date;
  source: "database" | "environment";
}>> {
  const settings: Array<{
    key: string;
    value: string;
    maskedValue: string;
    isSecret: boolean;
    description: string | null;
    category: string;
    updatedAt: Date;
    source: "database" | "environment";
  }> = [];

  // Get all database settings
  const dbSettings = await db.setting.findMany({
    orderBy: [{ category: "asc" }, { key: "asc" }],
  });

  for (const setting of dbSettings) {
    const value = setting.isSecret ? decrypt(setting.value) : setting.value;
    settings.push({
      key: setting.key,
      value: setting.isSecret ? "" : value, // Don't expose secret values
      maskedValue: setting.isSecret ? maskValue(value) : value,
      isSecret: setting.isSecret,
      description: setting.description,
      category: setting.category,
      updatedAt: setting.updatedAt,
      source: "database",
    });
  }

  // Add environment variables that aren't in database
  const knownKeys = [
    { key: "ANTHROPIC_API_KEY", category: "ai", description: "Claude AI API key" },
    { key: "OPENAI_API_KEY", category: "ai", description: "OpenAI API key (optional)" },
    { key: "ZEROBOUNCE_API_KEY", category: "email", description: "Email verification API key" },
    { key: "RESEND_API_KEY", category: "email", description: "Resend email API key" },
    { key: "HUNTER_API_KEY", category: "discovery", description: "Hunter.io email finder API key" },
    { key: "PODCAST_INDEX_API_KEY", category: "discovery", description: "PodcastIndex API key" },
    { key: "LISTEN_NOTES_API_KEY", category: "discovery", description: "ListenNotes API key" },
  ];

  const existingKeys = new Set(settings.map((s) => s.key));

  for (const { key, category, description } of knownKeys) {
    if (!existingKeys.has(key) && process.env[key]) {
      const value = process.env[key] || "";
      settings.push({
        key,
        value: "",
        maskedValue: maskValue(value),
        isSecret: true,
        description,
        category,
        updatedAt: new Date(),
        source: "environment",
      });
    }
  }

  return settings;
}

/**
 * Clear the settings cache
 */
export function clearCache(): void {
  cache.clear();
}

/**
 * Check if a setting exists (in database or environment)
 */
export async function hasSetting(key: string): Promise<boolean> {
  const value = await getSetting(key);
  return value !== null && value !== "";
}

// Common setting keys for type safety
export const SETTING_KEYS = {
  // AI Services
  ANTHROPIC_API_KEY: "ANTHROPIC_API_KEY",
  OPENAI_API_KEY: "OPENAI_API_KEY",
  
  // Email Services
  ZEROBOUNCE_API_KEY: "ZEROBOUNCE_API_KEY",
  RESEND_API_KEY: "RESEND_API_KEY",
  MILLIONVERIFIER_API_KEY: "MILLIONVERIFIER_API_KEY",
  
  // Discovery Services
  HUNTER_API_KEY: "HUNTER_API_KEY",
  PODCAST_INDEX_API_KEY: "PODCAST_INDEX_API_KEY",
  PODCAST_INDEX_API_SECRET: "PODCAST_INDEX_API_SECRET",
  LISTEN_NOTES_API_KEY: "LISTEN_NOTES_API_KEY",
  
  // Configuration
  DAILY_EMAIL_LIMIT: "DAILY_EMAIL_LIMIT",
  FOLLOW_UP_DELAY_DAYS: "FOLLOW_UP_DELAY_DAYS",
} as const;

export type SettingKey = typeof SETTING_KEYS[keyof typeof SETTING_KEYS];

