import { etagOf, noneMatchHits } from '@/lib/api/v1/cache';
import { clientConfigOf, type ClientConfigEnv } from '@/server/domain/clientConfig';

export const dynamic = 'force-dynamic';

/**
 * Shared by everyone and changed only by a redeploy with new environment
 * variables, so the CDN may keep it a minute: an app asks at every launch.
 * (Every other v1 answer is per viewer and never public: lib/api/v1/cache.)
 */
const CACHE = 'public, s-maxage=60';

/**
 * GET /api/v1/client-config — what the apps ask at launch, signed in or not:
 * the builds that must (`minBuild`) or should (`recommendedBuild`) update,
 * and which paths to take (`features`), from CLIENT_* variables
 * (src/server/domain/clientConfig.ts, .env.example).
 */
export function GET(req: Request): Response {
  const json = JSON.stringify(clientConfigOf(process.env as ClientConfigEnv));
  const etag = etagOf(json);
  const headers = new Headers({ 'Cache-Control': CACHE, ETag: etag });
  if (noneMatchHits(req.headers.get('If-None-Match'), etag)) return new Response(null, { status: 304, headers });
  headers.set('Content-Type', 'application/json');
  return new Response(json, { status: 200, headers });
}
