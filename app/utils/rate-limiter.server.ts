import crypto from "crypto";
import { SecurityAudit } from "./security-audit.server";

interface RateLimitRecord {
  count: number;
  resetTime: number;
  blocked: boolean;
}

export class RateLimiter {
  private static cache = new Map<string, RateLimitRecord>();

  static async checkLimit(
    identifier: string,
    maxRequests = 5,
    windowMs = 60000,
    blockDurationMs = 300000 // 5 minutos de bloqueo
  ): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
    const now = Date.now();
    const key = crypto.createHash('sha256').update(identifier).digest('hex');
    let record = this.cache.get(key);
    if (!record || now > record.resetTime) {
      record = {
        count: 0,
        resetTime: now + windowMs,
        blocked: false
      };
    }
    if (record.blocked) {
      if (now > record.resetTime) {
        record.blocked = false;
        record.count = 0;
        record.resetTime = now + windowMs;
      } else {
        return {
          allowed: false,
          remaining: 0,
          resetTime: record.resetTime
        };
      }
    }
    record.count++;
    if (record.count > maxRequests) {
      record.blocked = true;
      record.resetTime = now + blockDurationMs;
      SecurityAudit.log({
        shopId: identifier,
        action: 'RATE_LIMIT_EXCEEDED',
        success: false,
        details: {
          requests: record.count,
          limit: maxRequests,
          blockedUntil: new Date(record.resetTime).toISOString()
        }
      });
      this.cache.set(key, record);
      return {
        allowed: false,
        remaining: 0,
        resetTime: record.resetTime
      };
    }
    this.cache.set(key, record);
    return {
      allowed: true,
      remaining: maxRequests - record.count,
      resetTime: record.resetTime
    };
  }

  static cleanup() {
    const now = Date.now();
    for (const [key, record] of this.cache.entries()) {
      if (now > record.resetTime && !record.blocked) {
        this.cache.delete(key);
      }
    }
  }
} 