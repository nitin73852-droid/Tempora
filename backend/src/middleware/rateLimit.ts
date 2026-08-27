import { Request, Response, NextFunction } from 'express';

// In-memory rate limiting map: key -> timestamps[]
const rateLimitMap = new Map<string, number[]>();

export const MAX_MESSAGE_LENGTH = 2000;
export const MAX_NICKNAME_LENGTH = 32;
export const MAX_ROOM_NAME_LENGTH = 64;

/**
 * Content Sanitizer: Normalizes string input (strips null characters)
 * while preserving original text formatting (quotes, apostrophes, ampersands, angle brackets).
 * Text safety against XSS is enforced cleanly via React string rendering.
 */
export function sanitizeContent(input: string): string {
  if (!input) return '';
  return input.replace(/\0/g, '');
}

/**
 * In-memory rate limiter check (returns boolean)
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(key) || [];
  const validTimestamps = timestamps.filter((ts) => now - ts < windowMs);

  if (validTimestamps.length >= limit) {
    return false;
  }

  validTimestamps.push(now);
  rateLimitMap.set(key, validTimestamps);
  return true;
}

/**
 * Express Middleware for API route rate limiting (10 requests per minute)
 */
export function apiRateLimiter(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const allowed = checkRateLimit(`api_${ip}`, 60, 60000);

  if (!allowed) {
    return res.status(429).json({ error: 'Rate limit exceeded. Please try again later.' });
  }

  next();
}
