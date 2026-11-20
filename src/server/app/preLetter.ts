import en from '@/messages/en.json';
import zhTW from '@/messages/zh-TW.json';
import { clientBuild, isPreLetterBuild, preferredLanguage } from '@/lib/api/v1/clientBuild';
import { NoteLimitReached } from '@/lib/api/v1/conversations';
import { ApiFailure } from '@/lib/api/v1/http';
import { ANONYMOUS_VISIBILITY_MESSAGE } from '@/lib/db/firestore/cardContent';
import { deviceLocale, type DeviceLocale } from '@/lib/push/devices';
import type { ServerCtx } from '@/server/ctx';

// What the app builds made before letters still need from the server, as
// application services. Why: the module comment of src/lib/api/v1/preLetter.ts
// (the legacy facades, which call these on ctxFor(db)).

/**
 * See src/lib/api/v1/preLetter.ts `letterReadsAsConnection`; `requestFrom` is
 * who wrote the letter waiting in the two's conversation (conversations
 * `openRequest(…)?.from`), or null.
 */
export async function letterReadsAsConnectionIn(ctx: ServerCtx, viewerId: string, writerId: string, requestFrom: string | null): Promise<boolean> {
  if (viewerId === writerId || requestFrom !== writerId) return false;
  return !(await ctx.data.graph.hasBlocked(writerId, viewerId));
}

/** The web's and the newer apps' own words for the two refusals below, in each language. */
const WORDS: Record<DeviceLocale, { waitForReply: string; anonymousAudience: string }> = {
  en: { waitForReply: en.card.note.waitForReply, anonymousAudience: en.write.publishPanel.anonymousVisibility },
  'zh-TW': { waitForReply: zhTW.card.note.waitForReply, anonymousAudience: zhTW.write.publishPanel.anonymousVisibility },
};

/** See src/lib/api/v1/preLetter.ts `refusalForPreLetterBuild`. */
export async function refusalForPreLetterBuildIn(ctx: ServerCtx, uid: string, req: Request, e: unknown): Promise<unknown> {
  if (!isPreLetterBuild(req)) return e;
  if (e instanceof NoteLimitReached) return new ApiFailure('forbidden', WORDS[await appLocale(ctx, uid, req)].waitForReply);
  if (e instanceof ApiFailure && e.code === 'invalid_request' && e.message === ANONYMOUS_VISIBILITY_MESSAGE) {
    return new ApiFailure('invalid_request', WORDS[await appLocale(ctx, uid, req)].anonymousAudience);
  }
  return e;
}

/**
 * The language a request's app speaks: the one it last registered for pushes
 * on this platform, else the language the request asks for, else the
 * profile's primaryLocale. A read that fails falls back to the language
 * asked for (else English), so the refusal still goes out.
 */
async function appLocale(ctx: ServerCtx, uid: string, req: Request): Promise<DeviceLocale> {
  const asked = preferredLanguage(req.headers.get('accept-language'));
  try {
    const platform = clientBuild(req.headers.get('user-agent'))?.platform;
    const registered = await ctx.data.graph.deviceLocale(uid, platform);
    if (registered != null) return deviceLocale(registered);
    if (asked) return deviceLocale(asked);
    return deviceLocale(await ctx.data.graph.primaryLocale(uid));
  } catch {
    return deviceLocale(asked);
  }
}
