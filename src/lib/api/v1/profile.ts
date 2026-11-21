import type { AuthUser } from '@/lib/auth/types';
import { createProfileIn, handleAvailableIn, updateProfileIn } from '@/server/app/profile';
import { ctxFor } from '@/server/infra/firestore/ctx';
import type { AdminDb } from '@/server/infra/firestore/db';
import type { CreateProfileInput, MeBody, UpdateProfileInput } from './schemas';

// Profile writes, for the web and the apps alike. A pen name is reserved in
// the same transaction as the profile that takes it (handles/{name}, see
// lib/db/firestore/handles), so two people can't take the same name at once.
// The services are src/server/app/profile.ts; these are their legacy facades
// on a given Firestore.

export function handleAvailable(db: AdminDb, uid: string, handle: string): Promise<boolean> {
  return handleAvailableIn(ctxFor(db), uid, handle);
}

/**
 * Onboarding (the web's signup profile step, createCurrentUserProfile): the
 * same fields and defaults. Idempotent — an account that already has a
 * profile gets it back unchanged, so a retried request is harmless.
 *
 * Except a profile without a pen name (one made before onboarding asked for
 * one): it takes the name chosen now, reserved in the same transaction, with
 * the region and writing language just chosen — and keeps everything else.
 * Reaching anyone takes a pen name (hasPenName), so the web sends such a
 * profile back here to choose one. `named` says the profile has a new name.
 */
export function createProfile(db: AdminDb, user: AuthUser, input: CreateProfileInput): Promise<{ me: MeBody; created: boolean; named: boolean }> {
  return createProfileIn(ctxFor(db), user, input);
}

/**
 * The settings page's profile fields (updateProfile on the web). Only the
 * fields sent change; a new pen name must be free (case-insensitively) and
 * stamps handleChangedAt, like the web. A rename moves the reservation: the
 * new name's is written and the old one's released (a change of case keeps
 * the same reservation, with the name as now written). Returns the previous
 * pen name when it changed, so the caller can refresh the old profile page too.
 */
export function updateProfile(db: AdminDb, uid: string, input: UpdateProfileInput): Promise<{ me: MeBody; previousHandle: string | null }> {
  return updateProfileIn(ctxFor(db), uid, input);
}
