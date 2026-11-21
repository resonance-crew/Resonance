// Pure: what GET /api/v1/client-config answers, from the environment it is
// handed (the route passes process.env). No I/O.

import type { ClientConfigBody, ClientFeaturesBody } from '@/lib/api/v1/schemas';

/**
 * The paths an app build takes when the environment says nothing: the
 * Phase 2 /api/v1 paths on, but drafts (the writer's autosave, the riskiest
 * to move) still on Firestore until the owner turns them on.
 */
export const DEFAULT_FEATURES: Readonly<ClientFeaturesBody> = {
  signals: true,
  apiSocial: true,
  apiInbox: true,
  apiBell: true,
  apiThoughtMap: true,
  apiDrafts: false,
};

/** The variables read (documented in .env.example). */
export interface ClientConfigEnv {
  /** Builds below this must update (iOS CFBundleVersion). 0 or unset: none must. */
  CLIENT_MIN_BUILD_IOS?: string;
  /** …Android versionCode. */
  CLIENT_MIN_BUILD_ANDROID?: string;
  /** Builds below this are asked to update. */
  CLIENT_RECOMMENDED_BUILD_IOS?: string;
  CLIENT_RECOMMENDED_BUILD_ANDROID?: string;
  /** A JSON object of flags laid over DEFAULT_FEATURES (`{"apiDrafts":true}`); only known flags with boolean values count. */
  CLIENT_FEATURES?: string;
}

/** A build number as set: a whole number ≥ 0, else 0 (a typo never locks anyone out). */
function build(v: string | undefined): number {
  const t = v?.trim() ?? '';
  return /^\d{1,9}$/.test(t) ? Number(t) : 0;
}

function features(json: string | undefined): ClientFeaturesBody {
  const out = { ...DEFAULT_FEATURES };
  if (!json?.trim()) return out;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return out;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return out;
  for (const key of Object.keys(DEFAULT_FEATURES) as (keyof ClientFeaturesBody)[]) {
    const v = (parsed as Record<string, unknown>)[key];
    if (typeof v === 'boolean') out[key] = v;
  }
  return out;
}

/**
 * The apps' launch config: the builds that must (minBuild) and should
 * (recommendedBuild) update, and the feature flags. A recommended build is
 * never below the minimum. Anything malformed falls back to the default, so
 * a bad variable can only ever let builds in, never shut them out.
 */
export function clientConfigOf(env: ClientConfigEnv): ClientConfigBody {
  const minBuild = { ios: build(env.CLIENT_MIN_BUILD_IOS), android: build(env.CLIENT_MIN_BUILD_ANDROID) };
  return {
    minBuild,
    recommendedBuild: {
      ios: Math.max(minBuild.ios, build(env.CLIENT_RECOMMENDED_BUILD_IOS)),
      android: Math.max(minBuild.android, build(env.CLIENT_RECOMMENDED_BUILD_ANDROID)),
    },
    features: features(env.CLIENT_FEATURES),
  };
}
