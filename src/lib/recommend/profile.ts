import { getAdminDb } from '@/lib/db/firestore/admin';
import { buildUserProfileIn, type UserProfile } from '@/server/app/recommendProfile';
import type { AdminDb } from '@/server/infra/firestore/db';
import { ctxFor } from '@/server/infra/firestore/ctx';

/**
 * A reader as the recommender knows them (round 26 §A3) — now
 * src/server/app/recommendProfile.ts. This is its legacy facade.
 */
export { profileOf, type UserProfile } from '@/server/app/recommendProfile';

/** Build and keep a reader's profile (`userProfiles/{uid}`: card ids and weights only). */
export function buildUserProfile(uid: string, opts: { db?: AdminDb; now?: number } = {}): Promise<UserProfile> {
  return buildUserProfileIn(ctxFor(opts.db ?? getAdminDb()), uid, opts.now ?? Date.now());
}
