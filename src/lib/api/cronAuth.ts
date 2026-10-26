import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Whether a request is Vercel Cron's: `Authorization: Bearer $CRON_SECRET`.
 * With the secret unset nobody is (a cron route never runs for a guess).
 * Compared in constant time (as digests, so the lengths match too).
 */
export function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const digest = (s: string) => createHash('sha256').update(s).digest();
  return timingSafeEqual(digest(req.headers.get('authorization') ?? ''), digest(`Bearer ${secret}`));
}
