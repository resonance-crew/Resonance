/**
 * Whether a request writes with the ambient session cookie on behalf of
 * another origin. SameSite=Lax keeps the cookie off cross-site requests, but
 * not off same-site ones — a page on another subdomain of the site (img.,
 * hi., any later one) is same-site — so a cookie-authenticated write must
 * also come from this origin: the browser says so in Sec-Fetch-Site, or,
 * where it doesn't send that, in Origin. A request carrying an
 * `Authorization` header (the apps' Bearer token) is not ambient and is not
 * judged; nor are reads, and nor is a request no browser made (no Origin).
 */
export function crossOriginCookieWrite(req: Request): boolean {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return false;
  if (req.headers.get('authorization')) return false;
  const site = req.headers.get('sec-fetch-site');
  if (site) return site !== 'same-origin' && site !== 'none';
  const origin = req.headers.get('origin');
  if (!origin) return false;
  try {
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? new URL(req.url).host;
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}
