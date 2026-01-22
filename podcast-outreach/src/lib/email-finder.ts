/**
 * Robust Multi-Source Email Finder
 *
 * This module provides comprehensive email finding capabilities using multiple
 * methods in parallel to maximize the chances of finding valid contact emails.
 *
 * Methods (in priority order):
 * 1. Website scraping - Visit podcast website and extract emails
 * 2. RSS feed parsing - Extract <itunes:email> from podcast feed
 * 3. Apple Podcasts API - Get website URL if missing
 * 4. Hunter.io API - Domain search and email finder
 * 5. Pattern generation - Generate common email patterns
 */

// Email finding result
export interface EmailFinderResult {
  email: string | null;
  source: EmailSource;
  sourceUrl?: string;
  confidence: number; // 0.0 to 1.0
  message: string;
  sourceDetails?: EmailSourceDetails; // Detailed info about how email was found
  alternateEmails?: Array<{
    email: string;
    source: EmailSource;
    sourceUrl?: string;
    confidence: number;
    sourceDetails?: EmailSourceDetails;
  }>;
  discoveredWebsiteUrl?: string; // If we found a website URL that wasn't provided
}

// Detailed information about how an email was discovered
export interface EmailSourceDetails {
  method: string; // Human-readable method name
  description: string; // Detailed description of how it was found
  extractionType?: string; // e.g., "mailto_link", "text_regex", "itunes_tag", etc.
  pageChecked?: string; // The specific page where it was found
  reliability: "high" | "medium" | "low"; // Reliability indicator
  verificationTips?: string[]; // Tips for verifying this email
}

export type EmailSource =
  | "database"
  | "website_scrape"
  | "rss_feed"
  | "apple_podcasts"
  | "hunter_io"
  | "pattern_generated"
  | "not_found";

// Input parameters
export interface EmailFinderInput {
  podcastId?: string;
  hostName?: string;
  showName?: string;
  websiteUrl?: string;
  applePodcastUrl?: string;
  rssUrl?: string;
  existingEmail?: string; // Skip if already have email
}

// Configuration
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,7}\b/gi;
const MAILTO_REGEX = /href=["']mailto:([^"'?]+)/gi;

// Pages to check on podcast websites (in priority order)
const CONTACT_PATHS = [
  "/contact",
  "/contact-us",
  "/be-a-guest",
  "/guest",
  "/become-a-guest",
  "/guests",
  "/booking",
  "/book",
  "/schedule",
  "/about",
  "/about-us",
  "/podcast",
  "/connect",
  "/reach-out",
  "/media",
  "/press",
  "/sponsor",
  "/advertise",
  "", // Homepage last
];

// Emails to filter out (not useful contacts)
const INVALID_EMAIL_PATTERNS = [
  /noreply/i,
  /no-reply/i,
  /donotreply/i,
  /do-not-reply/i,
  /mailer-daemon/i,
  /postmaster@/i,
  /webmaster@/i,
  /hostmaster@/i,
  /abuse@/i,
  /spam@/i,
  /privacy@/i,
  /legal@/i,
  /terms@/i,
  /unsubscribe@/i,
  /bounce@/i,
  /notifications@/i,
  /alerts@/i,
  /system@/i,
  /auto@/i,
  /admin@/i,
  /root@/i,
  /@example\.(com|org|net)/i,
  /@test\.(com|org|net)/i,
  /@localhost/i,
  /\.(png|jpg|jpeg|gif|svg|webp|ico)$/i, // Image file extensions (false positives)
  /@wix\./i,
  /@squarespace\./i,
  /@sentry\./i,
  /@cloudflare\./i,
  /@mailchimp\./i,
  /@convertkit\./i,
  /@hubspot\./i,
];

// Email patterns that indicate good contact emails (higher priority)
const PREFERRED_EMAIL_PATTERNS = [
  /booking/i,
  /guest/i,
  /podcast/i,
  /media/i,
  /press/i,
  /inquir/i,
  /contact/i,
  /hello/i,
  /^hi@/i,
  /interview/i,
  /collab/i,
  /partnerships/i,
];

// Personal email domains (good for host contact)
const PERSONAL_EMAIL_DOMAINS = [
  "gmail.com",
  "yahoo.com",
  "outlook.com",
  "hotmail.com",
  "icloud.com",
  "me.com",
  "protonmail.com",
  "proton.me",
  "hey.com",
  "fastmail.com",
];

/**
 * Main email finder function - uses multiple methods in parallel
 */
export async function findEmail(input: EmailFinderInput): Promise<EmailFinderResult> {
  console.log("[EmailFinder] Starting multi-source email search...");
  console.log("[EmailFinder] Input:", JSON.stringify({
    hostName: input.hostName,
    showName: input.showName,
    websiteUrl: input.websiteUrl,
    applePodcastUrl: input.applePodcastUrl,
    rssUrl: input.rssUrl,
  }));

  // If already have email, return it
  if (input.existingEmail) {
    return {
      email: input.existingEmail,
      source: "database",
      confidence: 1.0,
      message: "Email already exists in database",
    };
  }

  const allFoundEmails: Array<{
    email: string;
    source: EmailSource;
    sourceUrl?: string;
    confidence: number;
    extractionType?: string;
  }> = [];

  let discoveredWebsiteUrl: string | undefined;

  // Step 1: If no website URL, try to discover it from Apple Podcasts
  let websiteUrl = input.websiteUrl;
  if (!websiteUrl && input.applePodcastUrl) {
    console.log("[EmailFinder] No website URL - trying Apple Podcasts lookup...");
    const appleResult = await getApplePodcastInfo(input.applePodcastUrl);
    if (appleResult?.websiteUrl) {
      websiteUrl = appleResult.websiteUrl;
      discoveredWebsiteUrl = websiteUrl;
      console.log("[EmailFinder] Discovered website from Apple Podcasts:", websiteUrl);
    }
    if (appleResult?.feedUrl && !input.rssUrl) {
      input.rssUrl = appleResult.feedUrl;
      console.log("[EmailFinder] Discovered RSS feed from Apple Podcasts:", appleResult.feedUrl);
    }
  }

  // Step 2: If still no website, try to find it from show name
  if (!websiteUrl && input.showName) {
    console.log("[EmailFinder] Attempting to find website from show name...");
    const searchedUrl = await findWebsiteFromShowName(input.showName);
    if (searchedUrl) {
      websiteUrl = searchedUrl;
      discoveredWebsiteUrl = searchedUrl;
      console.log("[EmailFinder] Found website from search:", searchedUrl);
    }
  }

  // Run multiple methods in parallel for speed
  const promises: Promise<void>[] = [];

  // Method 1: Scrape website for emails
  if (websiteUrl) {
    promises.push(
      scrapeWebsiteForEmails(websiteUrl).then((results) => {
        allFoundEmails.push(...results);
      }).catch((err) => {
        console.error("[EmailFinder] Website scrape error:", err.message);
      })
    );
  }

  // Method 2: Parse RSS feed for emails
  if (input.rssUrl) {
    promises.push(
      parseRssFeedForEmail(input.rssUrl).then((results) => {
        allFoundEmails.push(...results);
      }).catch((err) => {
        console.error("[EmailFinder] RSS parse error:", err.message);
      })
    );
  } else if (websiteUrl) {
    // Try to find RSS feed from website
    promises.push(
      findAndParseRssFeed(websiteUrl).then((results) => {
        allFoundEmails.push(...results);
      }).catch((err) => {
        console.error("[EmailFinder] RSS discovery error:", err.message);
      })
    );
  }

  // Method 3: Hunter.io (if configured)
  const hunterApiKey = process.env.HUNTER_API_KEY;
  if (hunterApiKey && websiteUrl) {
    promises.push(
      searchHunterIo(websiteUrl, input.hostName, hunterApiKey).then((results) => {
        allFoundEmails.push(...results);
      }).catch((err) => {
        console.error("[EmailFinder] Hunter.io error:", err.message);
      })
    );
  }

  // Wait for all methods to complete
  await Promise.allSettled(promises);

  console.log("[EmailFinder] Total emails found:", allFoundEmails.length);

  // Deduplicate and rank results
  const rankedEmails = rankEmails(allFoundEmails, input.hostName);
  console.log("[EmailFinder] Ranked emails:", rankedEmails.length);

  if (rankedEmails.length > 0) {
    const best = rankedEmails[0];
    return {
      email: best.email,
      source: best.source,
      sourceUrl: best.sourceUrl,
      confidence: best.confidence,
      message: `Email found via ${formatSource(best.source)}`,
      sourceDetails: getSourceDetails(best.source, best.extractionType, best.sourceUrl),
      alternateEmails: rankedEmails.slice(1, 3).map(alt => ({
        ...alt,
        sourceDetails: getSourceDetails(alt.source, alt.extractionType, alt.sourceUrl),
      })),
      discoveredWebsiteUrl,
    };
  }

  // Method 4: Generate email patterns as last resort
  if (websiteUrl && input.hostName) {
    const patterns = generateEmailPatterns(websiteUrl, input.hostName);
    if (patterns.length > 0) {
      return {
        email: patterns[0].email,
        source: "pattern_generated",
        confidence: 0.3,
        message: "Generated email pattern (unverified). Consider verifying before sending.",
        alternateEmails: patterns.slice(1, 3),
        discoveredWebsiteUrl,
      };
    }
  }

  // Nothing found
  let message = "Could not find email automatically.";
  if (!websiteUrl && !input.applePodcastUrl) {
    message = "No website URL or Apple Podcast link available. Try adding the podcast's website or social media links.";
  } else if (!websiteUrl) {
    message = "Could not discover website URL. Try manually entering the podcast's website.";
  }

  return {
    email: null,
    source: "not_found",
    confidence: 0,
    message,
    discoveredWebsiteUrl,
  };
}

/**
 * Scrape website for email addresses
 */
async function scrapeWebsiteForEmails(websiteUrl: string): Promise<Array<{
  email: string;
  source: EmailSource;
  sourceUrl: string;
  confidence: number;
}>> {
  console.log("[EmailFinder] Scraping website:", websiteUrl);
  const foundEmails: Array<{
    email: string;
    source: EmailSource;
    sourceUrl: string;
    confidence: number;
  }> = [];

  const baseUrl = new URL(websiteUrl);
  const pagesChecked = new Set<string>();

  // Check multiple pages in parallel (batch of 3 to avoid rate limiting)
  for (let i = 0; i < CONTACT_PATHS.length; i += 3) {
    const batch = CONTACT_PATHS.slice(i, i + 3);
    const batchPromises = batch.map(async (path) => {
      const pageUrl = new URL(path, baseUrl).toString();
      if (pagesChecked.has(pageUrl)) return;
      pagesChecked.add(pageUrl);

      try {
        const emails = await scrapePageForEmails(pageUrl);
        foundEmails.push(...emails);
      } catch (err) {
        // Page doesn't exist or error - that's fine
      }
    });

    await Promise.allSettled(batchPromises);

    // If we found good emails, don't need to check more pages
    if (foundEmails.some(e => e.confidence >= 0.8)) {
      console.log("[EmailFinder] Found high-confidence email, stopping website scan");
      break;
    }
  }

  return foundEmails;
}

/**
 * Scrape a single page for emails
 */
async function scrapePageForEmails(pageUrl: string): Promise<Array<{
  email: string;
  source: EmailSource;
  sourceUrl: string;
  confidence: number;
  extractionType: string;
}>> {
  const results: Array<{
    email: string;
    source: EmailSource;
    sourceUrl: string;
    confidence: number;
    extractionType: string;
  }> = [];

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

    const response = await fetch(pageUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; PodcastOutreach/1.0; +https://podcastoutreach.com)",
        "Accept": "text/html,application/xhtml+xml",
      },
    });

    clearTimeout(timeout);

    if (!response.ok) return results;

    const html = await response.text();

    // Method 1: mailto links (highest confidence)
    const mailtoMatches = html.matchAll(/href=["']mailto:([^"'?]+)/gi);
    for (const match of mailtoMatches) {
      const email = match[1].toLowerCase().trim();
      if (isValidContactEmail(email)) {
        results.push({
          email,
          source: "website_scrape",
          sourceUrl: pageUrl,
          confidence: 0.95, // mailto links are very reliable
          extractionType: "mailto_link",
        });
      }
    }

    // Method 2: Regex pattern matching on page text
    const textContent = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "") // Remove scripts
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "") // Remove styles
      .replace(/<[^>]+>/g, " "); // Remove HTML tags

    const emailMatches = textContent.matchAll(EMAIL_REGEX);
    for (const match of emailMatches) {
      const email = match[0].toLowerCase().trim();
      if (isValidContactEmail(email)) {
        // Check if it's already found via mailto
        if (!results.some(r => r.email === email)) {
          results.push({
            email,
            source: "website_scrape",
            sourceUrl: pageUrl,
            confidence: 0.7, // Text matches are less certain
            extractionType: "text_regex",
          });
        }
      }
    }
  } catch (err) {
    // Timeout or other error - skip this page
  }

  return results;
}

/**
 * Parse RSS feed for email (itunes:email tag)
 */
async function parseRssFeedForEmail(feedUrl: string): Promise<Array<{
  email: string;
  source: EmailSource;
  sourceUrl: string;
  confidence: number;
  extractionType: string;
}>> {
  console.log("[EmailFinder] Parsing RSS feed:", feedUrl);
  const results: Array<{
    email: string;
    source: EmailSource;
    sourceUrl: string;
    confidence: number;
    extractionType: string;
  }> = [];

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(feedUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; PodcastOutreach/1.0)",
        "Accept": "application/rss+xml, application/xml, text/xml",
      },
    });

    clearTimeout(timeout);

    if (!response.ok) return results;

    const xml = await response.text();

    // Look for itunes:email or itunes:owner > itunes:email
    const itunesEmailMatch = xml.match(/<itunes:email>([^<]+)<\/itunes:email>/i);
    if (itunesEmailMatch) {
      const email = itunesEmailMatch[1].toLowerCase().trim();
      if (isValidContactEmail(email)) {
        results.push({
          email,
          source: "rss_feed",
          sourceUrl: feedUrl,
          confidence: 0.9, // RSS itunes:email is official
          extractionType: "itunes_email",
        });
      }
    }

    // Also check for regular email in channel
    const managerEmailMatch = xml.match(/<managingEditor>([^<]+)<\/managingEditor>/i);
    if (managerEmailMatch) {
      const emailText = managerEmailMatch[1];
      const emailMatch = emailText.match(EMAIL_REGEX);
      if (emailMatch) {
        const email = emailMatch[0].toLowerCase().trim();
        if (isValidContactEmail(email) && !results.some(r => r.email === email)) {
          results.push({
            email,
            source: "rss_feed",
            sourceUrl: feedUrl,
            confidence: 0.85,
            extractionType: "managing_editor",
          });
        }
      }
    }

    // Check webMaster field
    const webMasterMatch = xml.match(/<webMaster>([^<]+)<\/webMaster>/i);
    if (webMasterMatch) {
      const emailText = webMasterMatch[1];
      const emailMatch = emailText.match(EMAIL_REGEX);
      if (emailMatch) {
        const email = emailMatch[0].toLowerCase().trim();
        if (isValidContactEmail(email) && !results.some(r => r.email === email)) {
          results.push({
            email,
            source: "rss_feed",
            sourceUrl: feedUrl,
            confidence: 0.8,
            extractionType: "webmaster",
          });
        }
      }
    }
  } catch (err) {
    console.error("[EmailFinder] RSS feed error:", err);
  }

  return results;
}

/**
 * Find RSS feed from website and parse it
 */
async function findAndParseRssFeed(websiteUrl: string): Promise<Array<{
  email: string;
  source: EmailSource;
  sourceUrl: string;
  confidence: number;
}>> {
  // Try common RSS feed paths
  const feedPaths = ["/feed", "/rss", "/podcast.xml", "/feed.xml", "/rss.xml", "/podcast/feed"];
  const baseUrl = new URL(websiteUrl);

  for (const path of feedPaths) {
    const feedUrl = new URL(path, baseUrl).toString();
    try {
      const results = await parseRssFeedForEmail(feedUrl);
      if (results.length > 0) {
        return results;
      }
    } catch {
      // Feed doesn't exist at this path
    }
  }

  // Try to find feed link in homepage HTML
  try {
    const response = await fetch(websiteUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; PodcastOutreach/1.0)",
      },
    });

    if (response.ok) {
      const html = await response.text();
      // Look for RSS link tags
      const feedLinkMatch = html.match(/<link[^>]+type=["']application\/rss\+xml["'][^>]+href=["']([^"']+)["']/i);
      if (feedLinkMatch) {
        const feedUrl = new URL(feedLinkMatch[1], websiteUrl).toString();
        return parseRssFeedForEmail(feedUrl);
      }
    }
  } catch {
    // Couldn't find feed
  }

  return [];
}

/**
 * Get Apple Podcast info (website URL, RSS feed)
 */
async function getApplePodcastInfo(applePodcastUrl: string): Promise<{
  websiteUrl?: string;
  feedUrl?: string;
} | null> {
  try {
    // Extract podcast ID from URL
    const idMatch = applePodcastUrl.match(/id(\d+)/);
    if (!idMatch) return null;

    const podcastId = idMatch[1];
    const lookupUrl = `https://itunes.apple.com/lookup?id=${podcastId}&entity=podcast`;

    const response = await fetch(lookupUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; PodcastOutreach/1.0)",
      },
    });

    if (!response.ok) return null;

    const data = await response.json();
    const podcast = data.results?.[0];

    if (!podcast) return null;

    return {
      websiteUrl: podcast.collectionViewUrl ? undefined : podcast.artistViewUrl, // Use artist URL as fallback
      feedUrl: podcast.feedUrl,
    };
  } catch (err) {
    console.error("[EmailFinder] Apple Podcasts lookup error:", err);
    return null;
  }
}

/**
 * Try to find website from show name using search
 */
async function findWebsiteFromShowName(showName: string): Promise<string | null> {
  try {
    // Use iTunes search API
    const searchQuery = encodeURIComponent(showName);
    const searchUrl = `https://itunes.apple.com/search?term=${searchQuery}&media=podcast&limit=3`;

    const response = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; PodcastOutreach/1.0)",
      },
    });

    if (!response.ok) return null;

    const data = await response.json();
    const podcasts = data.results || [];

    // Find best match by name
    const normalizedShowName = showName.toLowerCase().trim();
    for (const podcast of podcasts) {
      const podcastName = (podcast.collectionName || "").toLowerCase().trim();
      if (podcastName === normalizedShowName || podcastName.includes(normalizedShowName)) {
        // Try to get website from feed
        if (podcast.feedUrl) {
          const websiteFromFeed = await getWebsiteFromFeed(podcast.feedUrl);
          if (websiteFromFeed) return websiteFromFeed;
        }
        // Use artist URL as fallback
        if (podcast.artistViewUrl && !podcast.artistViewUrl.includes("itunes.apple.com")) {
          return podcast.artistViewUrl;
        }
      }
    }
  } catch (err) {
    console.error("[EmailFinder] Show name search error:", err);
  }

  return null;
}

/**
 * Get website URL from RSS feed
 */
async function getWebsiteFromFeed(feedUrl: string): Promise<string | null> {
  try {
    const response = await fetch(feedUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; PodcastOutreach/1.0)",
        "Accept": "application/rss+xml, application/xml, text/xml",
      },
    });

    if (!response.ok) return null;

    const xml = await response.text();

    // Look for link in channel
    const linkMatch = xml.match(/<channel>[\s\S]*?<link>([^<]+)<\/link>/i);
    if (linkMatch) {
      const link = linkMatch[1].trim();
      // Make sure it's not a feed URL
      if (!link.includes("/feed") && !link.includes("/rss") && !link.endsWith(".xml")) {
        return link;
      }
    }

    // Look for itunes:new-feed-url or other website indicators
    const websiteMatch = xml.match(/<url>([^<]+)<\/url>/);
    if (websiteMatch) {
      const url = websiteMatch[1].trim();
      if (url.startsWith("http") && !url.includes("feed")) {
        return url;
      }
    }
  } catch {
    // Couldn't parse feed
  }

  return null;
}

/**
 * Search Hunter.io for emails
 */
async function searchHunterIo(
  websiteUrl: string,
  hostName: string | undefined,
  apiKey: string
): Promise<Array<{
  email: string;
  source: EmailSource;
  sourceUrl: string;
  confidence: number;
}>> {
  const results: Array<{
    email: string;
    source: EmailSource;
    sourceUrl: string;
    confidence: number;
  }> = [];

  try {
    const domain = new URL(websiteUrl).hostname.replace(/^www\./, "");

    // Skip common hosting/podcast platform domains that won't have useful results
    const skipDomains = [
      "anchor.fm", "buzzsprout.com", "podbean.com", "libsyn.com",
      "spreaker.com", "captivate.fm", "transistor.fm", "simplecast.com",
      "megaphone.fm", "apple.com", "spotify.com", "podcasts.apple.com"
    ];

    if (skipDomains.some(skip => domain.includes(skip))) {
      console.log("[EmailFinder] Skipping Hunter.io for hosting platform domain:", domain);
      return results;
    }

    // Method 1: Domain search
    const domainSearchUrl = `https://api.hunter.io/v2/domain-search?domain=${domain}&api_key=${apiKey}&limit=10`;
    console.log("[EmailFinder] Calling Hunter.io domain-search for:", domain);

    const domainResponse = await fetch(domainSearchUrl);
    const domainData = await domainResponse.json();

    if (!domainResponse.ok) {
      console.error("[EmailFinder] Hunter.io domain-search error:", {
        status: domainResponse.status,
        statusText: domainResponse.statusText,
        error: domainData?.errors || domainData?.error || domainData,
      });
    } else {
      console.log("[EmailFinder] Hunter.io domain-search response:", {
        domain,
        emailsFound: domainData.data?.emails?.length || 0,
        webmail: domainData.data?.webmail,
        pattern: domainData.data?.pattern,
      });

      const emails = domainData.data?.emails || [];

      for (const emailData of emails) {
        if (emailData.value && isValidContactEmail(emailData.value)) {
          let confidence = 0.75;

          // Boost confidence based on Hunter.io's own confidence score
          if (emailData.confidence) {
            confidence = Math.max(0.6, emailData.confidence / 100);
          }

          // Boost confidence if name matches host
          if (hostName) {
            const hostFirstName = hostName.split(" ")[0]?.toLowerCase();
            if (
              emailData.first_name?.toLowerCase() === hostFirstName ||
              emailData.value?.toLowerCase().includes(hostFirstName)
            ) {
              confidence = Math.min(0.95, confidence + 0.15);
            }
          }

          // Boost for certain positions/types
          if (emailData.position?.toLowerCase().includes("host") ||
              emailData.position?.toLowerCase().includes("founder") ||
              emailData.position?.toLowerCase().includes("owner")) {
            confidence = Math.min(0.95, confidence + 0.1);
          }

          results.push({
            email: emailData.value.toLowerCase(),
            source: "hunter_io",
            sourceUrl: `https://hunter.io/search/${domain}`,
            confidence,
          });
        }
      }
    }

    // Method 2: Email finder (if we have host name and no results yet or low confidence results)
    const hasHighConfidenceResult = results.some(r => r.confidence >= 0.8);
    if (!hasHighConfidenceResult && hostName) {
      const nameParts = hostName.trim().split(" ");
      if (nameParts.length >= 2) {
        const firstName = nameParts[0];
        const lastName = nameParts[nameParts.length - 1];

        const finderUrl = `https://api.hunter.io/v2/email-finder?domain=${domain}&first_name=${encodeURIComponent(firstName)}&last_name=${encodeURIComponent(lastName)}&api_key=${apiKey}`;
        console.log("[EmailFinder] Calling Hunter.io email-finder for:", firstName, lastName, "@", domain);

        const finderResponse = await fetch(finderUrl);
        const finderData = await finderResponse.json();

        if (!finderResponse.ok) {
          console.error("[EmailFinder] Hunter.io email-finder error:", {
            status: finderResponse.status,
            error: finderData?.errors || finderData?.error || finderData,
          });
        } else if (finderData.data?.email && isValidContactEmail(finderData.data.email)) {
          console.log("[EmailFinder] Hunter.io email-finder found:", finderData.data.email, "score:", finderData.data.score);

          // Check if this email already exists in results
          const existingIndex = results.findIndex(r => r.email === finderData.data.email.toLowerCase());
          const newConfidence = finderData.data.score ? finderData.data.score / 100 : 0.7;

          if (existingIndex >= 0) {
            // Update confidence if email-finder gives higher score
            results[existingIndex].confidence = Math.max(results[existingIndex].confidence, newConfidence);
          } else {
            results.push({
              email: finderData.data.email.toLowerCase(),
              source: "hunter_io",
              sourceUrl: `https://hunter.io/search/${domain}`,
              confidence: newConfidence,
            });
          }
        } else {
          console.log("[EmailFinder] Hunter.io email-finder: no email found for", firstName, lastName);
        }
      }
    }
  } catch (err) {
    console.error("[EmailFinder] Hunter.io error:", err);
  }

  return results;
}

/**
 * Generate email patterns (last resort)
 */
function generateEmailPatterns(
  websiteUrl: string,
  hostName: string
): Array<{
  email: string;
  source: EmailSource;
  confidence: number;
}> {
  const results: Array<{
    email: string;
    source: EmailSource;
    confidence: number;
  }> = [];

  try {
    const domain = new URL(websiteUrl).hostname.replace(/^www\./, "");
    const nameParts = hostName.toLowerCase().trim().split(/\s+/);

    if (nameParts.length >= 1) {
      const firstName = nameParts[0];
      const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : "";

      // Common patterns (most common first)
      const patterns = [
        { pattern: `${firstName}@${domain}`, confidence: 0.35 },
        { pattern: `hello@${domain}`, confidence: 0.3 },
        { pattern: `contact@${domain}`, confidence: 0.3 },
        { pattern: `podcast@${domain}`, confidence: 0.3 },
      ];

      if (lastName) {
        patterns.unshift(
          { pattern: `${firstName}.${lastName}@${domain}`, confidence: 0.4 },
          { pattern: `${firstName}${lastName}@${domain}`, confidence: 0.35 },
          { pattern: `${firstName[0]}${lastName}@${domain}`, confidence: 0.3 },
        );
      }

      for (const { pattern, confidence } of patterns) {
        results.push({
          email: pattern,
          source: "pattern_generated",
          confidence,
        });
      }
    }
  } catch {
    // URL parsing error
  }

  return results;
}

/**
 * Check if email is a valid contact email
 */
function isValidContactEmail(email: string): boolean {
  const lowerEmail = email.toLowerCase();

  // Check against invalid patterns
  for (const pattern of INVALID_EMAIL_PATTERNS) {
    if (pattern.test(lowerEmail)) {
      return false;
    }
  }

  // Basic format check
  if (!EMAIL_REGEX.test(email)) {
    return false;
  }

  // Check minimum length
  if (email.length < 6 || email.length > 254) {
    return false;
  }

  return true;
}

/**
 * Rank found emails by quality
 */
function rankEmails(
  emails: Array<{
    email: string;
    source: EmailSource;
    sourceUrl?: string;
    confidence: number;
    extractionType?: string;
  }>,
  hostName?: string
): Array<{
  email: string;
  source: EmailSource;
  sourceUrl?: string;
  confidence: number;
  extractionType?: string;
}> {
  // Deduplicate by email address
  const unique = new Map<string, typeof emails[0]>();
  for (const e of emails) {
    const existing = unique.get(e.email);
    if (!existing || e.confidence > existing.confidence) {
      unique.set(e.email, e);
    }
  }

  let ranked = Array.from(unique.values());

  // Boost scores based on email patterns
  ranked = ranked.map((e) => {
    let boost = 0;

    // Preferred patterns get a boost
    for (const pattern of PREFERRED_EMAIL_PATTERNS) {
      if (pattern.test(e.email)) {
        boost += 0.1;
        break;
      }
    }

    // Personal email domains get a boost (likely the host)
    const domain = e.email.split("@")[1];
    if (domain && PERSONAL_EMAIL_DOMAINS.includes(domain)) {
      boost += 0.05;
    }

    // If host name matches email, big boost
    if (hostName) {
      const firstName = hostName.toLowerCase().split(" ")[0];
      if (e.email.toLowerCase().includes(firstName)) {
        boost += 0.15;
      }
    }

    return {
      ...e,
      confidence: Math.min(1.0, e.confidence + boost),
    };
  });

  // Sort by confidence (highest first)
  ranked.sort((a, b) => b.confidence - a.confidence);

  return ranked;
}

/**
 * Format source for display
 */
function formatSource(source: EmailSource): string {
  switch (source) {
    case "database":
      return "database";
    case "website_scrape":
      return "website scan";
    case "rss_feed":
      return "podcast RSS feed";
    case "apple_podcasts":
      return "Apple Podcasts";
    case "hunter_io":
      return "Hunter.io";
    case "pattern_generated":
      return "pattern generation";
    default:
      return source;
  }
}

/**
 * Get detailed source information for UI display
 */
export function getSourceDetails(
  source: EmailSource,
  extractionType?: string,
  pageUrl?: string
): EmailSourceDetails {
  switch (source) {
    case "database":
      return {
        method: "Database Record",
        description: "Email was previously saved in your database",
        reliability: "high",
        verificationTips: ["This email has been used before or manually entered"],
      };

    case "website_scrape":
      if (extractionType === "mailto_link") {
        return {
          method: "Website mailto: Link",
          description: `Found via a clickable email link on the podcast's website`,
          extractionType: "mailto_link",
          pageChecked: pageUrl,
          reliability: "high",
          verificationTips: [
            "This email was found in a mailto: link, indicating it's meant for public contact",
            "The podcast actively displays this email for visitors to use",
          ],
        };
      }
      return {
        method: "Website Text Extraction",
        description: `Found by scanning text content on the podcast's website`,
        extractionType: "text_regex",
        pageChecked: pageUrl,
        reliability: "medium",
        verificationTips: [
          "Email was found in page text - may be for general contact",
          "Verify this is the right contact for podcast booking",
          "Consider checking if there's a dedicated booking/guest page",
        ],
      };

    case "rss_feed":
      if (extractionType === "itunes_email") {
        return {
          method: "Podcast RSS Feed (iTunes Tag)",
          description: "Found in the official <itunes:email> tag of the podcast's RSS feed",
          extractionType: "itunes_email",
          pageChecked: pageUrl,
          reliability: "high",
          verificationTips: [
            "This is the official contact email registered with Apple Podcasts",
            "Podcast hosts configure this email specifically for listener contact",
          ],
        };
      }
      if (extractionType === "managing_editor") {
        return {
          method: "RSS Feed (Managing Editor)",
          description: "Found in the RSS feed's <managingEditor> field",
          extractionType: "managing_editor",
          pageChecked: pageUrl,
          reliability: "medium",
          verificationTips: [
            "This email is for the person managing the RSS feed",
            "May be technical staff rather than the host - verify before sending",
          ],
        };
      }
      return {
        method: "Podcast RSS Feed",
        description: "Found in the podcast's RSS feed metadata",
        extractionType: extractionType || "rss_field",
        pageChecked: pageUrl,
        reliability: "medium",
        verificationTips: [
          "Email was found in RSS feed metadata",
          "Verify this reaches the right person for booking",
        ],
      };

    case "hunter_io":
      return {
        method: "Hunter.io Email Database",
        description: "Found via Hunter.io's professional email database, which indexes publicly available emails",
        extractionType: "hunter_domain_search",
        reliability: "medium",
        verificationTips: [
          "Hunter.io aggregates emails from public sources like LinkedIn, websites, etc.",
          "Confidence depends on how many sources verified this email",
          "Consider sending a verification email first if confidence is low",
        ],
      };

    case "apple_podcasts":
      return {
        method: "Apple Podcasts API",
        description: "Discovered through Apple Podcasts' public API metadata",
        extractionType: "apple_api",
        reliability: "medium",
        verificationTips: [
          "This information came from Apple's podcast directory",
          "May need additional verification",
        ],
      };

    case "pattern_generated":
      return {
        method: "Email Pattern Generation",
        description: "Generated based on common email patterns using the host's name and domain",
        extractionType: "pattern_guess",
        reliability: "low",
        verificationTips: [
          "⚠️ This email is a guess and has NOT been verified",
          "Common patterns like firstname@domain.com are often correct",
          "Consider using an email verification service before sending",
          "Alternatively, reach out via social media to confirm the email",
        ],
      };

    case "not_found":
    default:
      return {
        method: "Not Found",
        description: "Could not automatically discover an email address",
        reliability: "low",
        verificationTips: [
          "Try searching the podcast's social media profiles",
          "Look for a contact form on their website",
          "Check their LinkedIn for contact information",
        ],
      };
  }
}
