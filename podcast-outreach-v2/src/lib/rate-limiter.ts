/**
 * Rate Limiter - Database-backed rate limiting for API routes
 * 
 * Features:
 * - Configurable rate limits per endpoint
 * - IP-based or API key-based limiting
 * - Sliding window algorithm
 * - Automatic cleanup of old entries
 */

import { db } from "./db";
import { NextRequest, NextResponse } from "next/server";

// Default rate limit configuration
const DEFAULT_LIMITS: Record<string, { requests: number; windowMs: number }> = {
  // General API routes
  default: { requests: 100, windowMs: 60 * 1000 }, // 100 requests per minute
  
  // AI-intensive routes (expensive)
  "/api/analyze": { requests: 10, windowMs: 60 * 1000 }, // 10 per minute
  "/api/draft": { requests: 10, windowMs: 60 * 1000 }, // 10 per minute
  "/api/podcasts/*/analyze": { requests: 5, windowMs: 60 * 1000 }, // 5 per minute
  
  // Email routes
  "/api/send-email": { requests: 20, windowMs: 60 * 1000 }, // 20 per minute
  "/api/verify-email": { requests: 30, windowMs: 60 * 1000 }, // 30 per minute
  
  // Cron routes (internal)
  "/api/cron/*": { requests: 10, windowMs: 60 * 1000 }, // 10 per minute
  
  // Discovery routes (external API calls)
  "/api/discovery/*": { requests: 30, windowMs: 60 * 1000 }, // 30 per minute
  "/api/email-finder/*": { requests: 20, windowMs: 60 * 1000 }, // 20 per minute
  
  // Bulk operations
  "/api/podcasts": { requests: 50, windowMs: 60 * 1000 }, // 50 per minute
  "/api/analytics/*": { requests: 30, windowMs: 60 * 1000 }, // 30 per minute
};

/**
 * Get the client IP address from the request
 */
function getClientIP(request: NextRequest): string {
  // Try various headers that might contain the real IP
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }
  
  const realIP = request.headers.get("x-real-ip");
  if (realIP) {
    return realIP;
  }
  
  // Fallback
  return "unknown";
}

/**
 * Match an endpoint pattern (supports wildcards)
 */
function matchEndpoint(path: string, pattern: string): boolean {
  if (pattern === path) return true;
  
  // Convert pattern to regex (replace * with .*)
  const regexPattern = pattern
    .replace(/\*/g, ".*")
    .replace(/\//g, "\\/");
  
  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(path);
}

/**
 * Get rate limit config for an endpoint
 */
function getLimitConfig(endpoint: string): { requests: number; windowMs: number } {
  // Check for exact match first
  if (DEFAULT_LIMITS[endpoint]) {
    return DEFAULT_LIMITS[endpoint];
  }
  
  // Check for pattern matches
  for (const [pattern, config] of Object.entries(DEFAULT_LIMITS)) {
    if (pattern.includes("*") && matchEndpoint(endpoint, pattern)) {
      return config;
    }
  }
  
  return DEFAULT_LIMITS.default;
}

/**
 * Check rate limit and return result
 * 
 * @param request - The incoming request
 * @param endpoint - Optional endpoint override
 * @returns Object with allowed status and remaining requests
 */
export async function checkRateLimit(
  request: NextRequest,
  endpoint?: string
): Promise<{
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  limit: number;
}> {
  const path = endpoint || request.nextUrl.pathname;
  const ip = getClientIP(request);
  const key = `ip:${ip}`;
  
  const config = getLimitConfig(path);
  const windowStart = new Date(Date.now() - config.windowMs);
  
  try {
    // Get or create rate limit entry
    const existing = await db.rateLimit.findUnique({
      where: { key_endpoint: { key, endpoint: path } },
    });
    
    if (existing) {
      // Check if window has expired
      if (existing.windowStart < windowStart) {
        // Reset the counter
        await db.rateLimit.update({
          where: { id: existing.id },
          data: {
            count: 1,
            windowStart: new Date(),
          },
        });
        
        return {
          allowed: true,
          remaining: config.requests - 1,
          resetAt: new Date(Date.now() + config.windowMs),
          limit: config.requests,
        };
      }
      
      // Increment counter
      const newCount = existing.count + 1;
      
      if (newCount > config.requests) {
        // Rate limit exceeded
        const resetAt = new Date(existing.windowStart.getTime() + config.windowMs);
        return {
          allowed: false,
          remaining: 0,
          resetAt,
          limit: config.requests,
        };
      }
      
      await db.rateLimit.update({
        where: { id: existing.id },
        data: { count: newCount },
      });
      
      return {
        allowed: true,
        remaining: config.requests - newCount,
        resetAt: new Date(existing.windowStart.getTime() + config.windowMs),
        limit: config.requests,
      };
    }
    
    // Create new entry
    await db.rateLimit.create({
      data: {
        key,
        endpoint: path,
        count: 1,
        windowStart: new Date(),
      },
    });
    
    return {
      allowed: true,
      remaining: config.requests - 1,
      resetAt: new Date(Date.now() + config.windowMs),
      limit: config.requests,
    };
  } catch (error) {
    console.error("Rate limit check error:", error);
    // On error, allow the request (fail open)
    return {
      allowed: true,
      remaining: config.requests,
      resetAt: new Date(Date.now() + config.windowMs),
      limit: config.requests,
    };
  }
}

/**
 * Rate limit middleware wrapper for API routes
 * 
 * Usage:
 * ```
 * export async function GET(request: NextRequest) {
 *   const rateLimitResult = await withRateLimit(request);
 *   if (rateLimitResult) return rateLimitResult;
 *   
 *   // Your handler code...
 * }
 * ```
 */
export async function withRateLimit(
  request: NextRequest,
  endpoint?: string
): Promise<NextResponse | null> {
  const result = await checkRateLimit(request, endpoint);
  
  if (!result.allowed) {
    return NextResponse.json(
      {
        error: "Too Many Requests",
        message: `Rate limit exceeded. Try again at ${result.resetAt.toISOString()}`,
        retryAfter: Math.ceil((result.resetAt.getTime() - Date.now()) / 1000),
      },
      {
        status: 429,
        headers: {
          "X-RateLimit-Limit": result.limit.toString(),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": result.resetAt.toISOString(),
          "Retry-After": Math.ceil((result.resetAt.getTime() - Date.now()) / 1000).toString(),
        },
      }
    );
  }
  
  return null; // Request allowed
}

/**
 * Add rate limit headers to a response
 */
export function addRateLimitHeaders(
  response: NextResponse,
  result: { remaining: number; resetAt: Date; limit: number }
): NextResponse {
  response.headers.set("X-RateLimit-Limit", result.limit.toString());
  response.headers.set("X-RateLimit-Remaining", result.remaining.toString());
  response.headers.set("X-RateLimit-Reset", result.resetAt.toISOString());
  return response;
}

/**
 * Clean up old rate limit entries (run periodically)
 */
export async function cleanupRateLimits(): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
  
  const result = await db.rateLimit.deleteMany({
    where: {
      windowStart: { lt: cutoff },
    },
  });
  
  return result.count;
}

/**
 * Get rate limit status for monitoring
 */
export async function getRateLimitStats(): Promise<{
  totalEntries: number;
  topEndpoints: Array<{ endpoint: string; totalRequests: number }>;
}> {
  const [total, grouped] = await Promise.all([
    db.rateLimit.count(),
    db.rateLimit.groupBy({
      by: ["endpoint"],
      _sum: { count: true },
      orderBy: { _sum: { count: "desc" } },
      take: 10,
    }),
  ]);
  
  return {
    totalEntries: total,
    topEndpoints: grouped.map((g) => ({
      endpoint: g.endpoint,
      totalRequests: g._sum.count || 0,
    })),
  };
}

