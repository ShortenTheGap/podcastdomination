/**
 * Email Verification Service
 * 
 * Verifies email addresses before sending to reduce bounces.
 * Supports multiple providers: ZeroBounce (primary), MillionVerifier, Abstract API
 * 
 * Usage:
 *   const result = await verifyEmail("test@example.com");
 *   if (result.isValid) { // safe to send }
 */

export interface EmailVerificationResult {
  email: string;
  isValid: boolean;
  isDeliverable: boolean;
  isCatchAll: boolean;
  isDisposable: boolean;
  isRoleBased: boolean;
  isFreeProvider: boolean;
  confidence: number; // 0-100
  status: "valid" | "invalid" | "catch_all" | "unknown" | "disposable" | "role_based";
  reason: string;
  provider: string;
  rawResponse?: Record<string, unknown>;
}

export interface VerificationProvider {
  name: string;
  verify: (email: string) => Promise<EmailVerificationResult>;
}

// ============================================
// ZEROBOUNCE PROVIDER (Recommended)
// ============================================

async function verifyWithZeroBounce(email: string): Promise<EmailVerificationResult> {
  const apiKey = process.env.ZEROBOUNCE_API_KEY;
  
  if (!apiKey) {
    throw new Error("ZEROBOUNCE_API_KEY not configured");
  }

  const response = await fetch(
    `https://api.zerobounce.net/v2/validate?api_key=${apiKey}&email=${encodeURIComponent(email)}`
  );

  if (!response.ok) {
    throw new Error(`ZeroBounce API error: ${response.statusText}`);
  }

  const data = await response.json();

  // ZeroBounce status codes
  // valid, invalid, catch-all, unknown, spamtrap, abuse, do_not_mail
  const status = data.status?.toLowerCase() || "unknown";
  const subStatus = data.sub_status?.toLowerCase() || "";

  let isValid = false;
  let isDeliverable = false;
  let confidence = 0;
  let reason = data.sub_status || data.status || "Unknown";

  switch (status) {
    case "valid":
      isValid = true;
      isDeliverable = true;
      confidence = 95;
      reason = "Email is valid and deliverable";
      break;
    case "catch-all":
    case "catch_all":
      isValid = true;
      isDeliverable = true; // Usually deliverable but can't guarantee
      confidence = 70;
      reason = "Catch-all domain - email may or may not exist";
      break;
    case "unknown":
      isValid = false;
      isDeliverable = false;
      confidence = 30;
      reason = subStatus || "Could not verify email";
      break;
    case "invalid":
      isValid = false;
      isDeliverable = false;
      confidence = 5;
      reason = subStatus || "Email is invalid";
      break;
    case "spamtrap":
    case "abuse":
    case "do_not_mail":
      isValid = false;
      isDeliverable = false;
      confidence = 0;
      reason = `Do not email: ${status}`;
      break;
    default:
      isValid = false;
      confidence = 20;
      reason = `Unknown status: ${status}`;
  }

  return {
    email,
    isValid,
    isDeliverable,
    isCatchAll: status === "catch-all" || status === "catch_all",
    isDisposable: subStatus === "disposable",
    isRoleBased: subStatus === "role_based_catch_all" || subStatus === "role_based",
    isFreeProvider: data.free_email === "true" || data.free_email === true,
    confidence,
    status: mapStatus(status),
    reason,
    provider: "zerobounce",
    rawResponse: data,
  };
}

// ============================================
// MILLIONVERIFIER PROVIDER (Alternative)
// ============================================

async function verifyWithMillionVerifier(email: string): Promise<EmailVerificationResult> {
  const apiKey = process.env.MILLIONVERIFIER_API_KEY;
  
  if (!apiKey) {
    throw new Error("MILLIONVERIFIER_API_KEY not configured");
  }

  const response = await fetch(
    `https://api.millionverifier.com/api/v3/?api=${apiKey}&email=${encodeURIComponent(email)}`
  );

  if (!response.ok) {
    throw new Error(`MillionVerifier API error: ${response.statusText}`);
  }

  const data = await response.json();

  // MillionVerifier result codes: ok, catch_all, unknown, invalid, disposable
  const result = data.result?.toLowerCase() || "unknown";
  
  let isValid = false;
  let isDeliverable = false;
  let confidence = 0;

  switch (result) {
    case "ok":
      isValid = true;
      isDeliverable = true;
      confidence = 95;
      break;
    case "catch_all":
      isValid = true;
      isDeliverable = true;
      confidence = 70;
      break;
    case "unknown":
      isValid = false;
      isDeliverable = false;
      confidence = 30;
      break;
    case "invalid":
    case "disposable":
      isValid = false;
      isDeliverable = false;
      confidence = 5;
      break;
    default:
      confidence = 20;
  }

  return {
    email,
    isValid,
    isDeliverable,
    isCatchAll: result === "catch_all",
    isDisposable: result === "disposable",
    isRoleBased: data.role === true,
    isFreeProvider: data.free === true,
    confidence,
    status: mapStatus(result),
    reason: result === "ok" ? "Email is valid" : `Result: ${result}`,
    provider: "millionverifier",
    rawResponse: data,
  };
}

// ============================================
// ABSTRACT API PROVIDER (Alternative)
// ============================================

async function verifyWithAbstract(email: string): Promise<EmailVerificationResult> {
  const apiKey = process.env.ABSTRACT_API_KEY;
  
  if (!apiKey) {
    throw new Error("ABSTRACT_API_KEY not configured");
  }

  const response = await fetch(
    `https://emailvalidation.abstractapi.com/v1/?api_key=${apiKey}&email=${encodeURIComponent(email)}`
  );

  if (!response.ok) {
    throw new Error(`Abstract API error: ${response.statusText}`);
  }

  const data = await response.json();

  const deliverability = data.deliverability || "UNKNOWN";
  const isDeliverable = deliverability === "DELIVERABLE";
  const isCatchAll = data.is_catchall_email?.value === true;
  
  let confidence = 50;
  let isValid = false;

  if (isDeliverable) {
    isValid = true;
    confidence = data.quality_score ? Math.round(parseFloat(data.quality_score) * 100) : 90;
  } else if (deliverability === "UNDELIVERABLE") {
    isValid = false;
    confidence = 10;
  }

  return {
    email,
    isValid,
    isDeliverable,
    isCatchAll,
    isDisposable: data.is_disposable_email?.value === true,
    isRoleBased: data.is_role_email?.value === true,
    isFreeProvider: data.is_free_email?.value === true,
    confidence,
    status: isValid ? "valid" : "invalid",
    reason: deliverability,
    provider: "abstract",
    rawResponse: data,
  };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function mapStatus(providerStatus: string): EmailVerificationResult["status"] {
  const statusMap: Record<string, EmailVerificationResult["status"]> = {
    "valid": "valid",
    "ok": "valid",
    "invalid": "invalid",
    "catch-all": "catch_all",
    "catch_all": "catch_all",
    "unknown": "unknown",
    "disposable": "disposable",
    "role_based": "role_based",
    "role_based_catch_all": "role_based",
  };
  
  return statusMap[providerStatus] || "unknown";
}

// Basic syntax validation (no API call)
function isValidEmailSyntax(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Check if domain has MX records (basic check)
async function hasMxRecords(domain: string): Promise<boolean> {
  try {
    // Using DNS over HTTPS (Cloudflare)
    const response = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${domain}&type=MX`,
      {
        headers: { Accept: "application/dns-json" },
      }
    );
    
    if (!response.ok) return false;
    
    const data = await response.json();
    return data.Answer && data.Answer.length > 0;
  } catch {
    return true; // Assume true if check fails
  }
}

// ============================================
// MAIN VERIFICATION FUNCTION
// ============================================

/**
 * Verify an email address using available providers
 * Falls back through providers if one fails
 */
export async function verifyEmail(email: string): Promise<EmailVerificationResult> {
  // Basic syntax check first
  if (!isValidEmailSyntax(email)) {
    return {
      email,
      isValid: false,
      isDeliverable: false,
      isCatchAll: false,
      isDisposable: false,
      isRoleBased: false,
      isFreeProvider: false,
      confidence: 0,
      status: "invalid",
      reason: "Invalid email syntax",
      provider: "syntax_check",
    };
  }

  // Try providers in order of preference
  const providers: VerificationProvider[] = [
    { name: "zerobounce", verify: verifyWithZeroBounce },
    { name: "millionverifier", verify: verifyWithMillionVerifier },
    { name: "abstract", verify: verifyWithAbstract },
  ];

  for (const provider of providers) {
    try {
      const result = await provider.verify(email);
      console.log(`[EmailVerifier] ${provider.name}: ${email} -> ${result.status} (${result.confidence}%)`);
      return result;
    } catch (error) {
      console.warn(`[EmailVerifier] ${provider.name} failed:`, error instanceof Error ? error.message : error);
      continue;
    }
  }

  // All providers failed - do basic MX check
  console.log("[EmailVerifier] All providers failed, falling back to MX check");
  
  const domain = email.split("@")[1];
  const hasMx = await hasMxRecords(domain);

  return {
    email,
    isValid: hasMx,
    isDeliverable: hasMx,
    isCatchAll: false,
    isDisposable: false,
    isRoleBased: false,
    isFreeProvider: false,
    confidence: hasMx ? 50 : 10,
    status: hasMx ? "unknown" : "invalid",
    reason: hasMx ? "MX records found but could not verify deliverability" : "No MX records found",
    provider: "mx_check",
  };
}

/**
 * Batch verify multiple emails
 * Respects rate limits and processes in sequence
 */
export async function verifyEmailBatch(
  emails: string[],
  delayMs: number = 1000
): Promise<Map<string, EmailVerificationResult>> {
  const results = new Map<string, EmailVerificationResult>();
  
  for (const email of emails) {
    const result = await verifyEmail(email);
    results.set(email, result);
    
    // Rate limit between requests
    if (delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  return results;
}

/**
 * Quick check if email is likely valid (for UI feedback)
 * Returns true if confidence >= 70%
 */
export async function isEmailLikelyValid(email: string): Promise<boolean> {
  try {
    const result = await verifyEmail(email);
    return result.confidence >= 70;
  } catch {
    // If verification fails, assume valid to not block sends
    return true;
  }
}


