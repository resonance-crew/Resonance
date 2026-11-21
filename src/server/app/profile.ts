import { ApiFailure } from '@/lib/api/v1/http';
import { HINTS_SEEN_MAX, type CreateProfileInput, type MeBody, type UpdateProfileInput } from '@/lib/api/v1/schemas';
import type { AuthUser } from '@/lib/auth/types';
import { avatarColorFor } from '@/lib/design/avatarColors';
import type { ServerCtx } from '@/server/ctx';
import { hasPenNameRow } from '@/server/domain/cardsWrite';
import type { ProfilePatch } from '@/server/ports/repos/users';
import { getMe } from './cardsRead';

// Profile writes, for the web and the apps alike (src/lib/api/v1/profile.ts keeps the legacy
// `(db, …)` exports). A pen name is reserved in the same transaction as the profile that takes it,
// so two people can't take the same name at once.

const taken = () => new ApiFailure('conflict', 'That pen name is taken.');

/** Whether `uid` may take `handle`. */
export function handleAvailableIn(ctx: ServerCtx, uid: string, handle: string): Promise<boolean> {
  return ctx.data.users.handleAvailable(uid, handle);
}

/**
 * Onboarding: the profile, made once (a retried request gets it back
 * unchanged) — or, for a profile without a pen name, the name chosen now with
 * the region and writing language beside it (`named`). src/lib/api/v1/profile.ts createProfile.
 */
export async function createProfileIn(ctx: ServerCtx, user: AuthUser, input: CreateProfileInput): Promise<{ me: MeBody; created: boolean; named: boolean }> {
  const outcome = await ctx.uow.run(async (tx): Promise<'kept' | 'named' | 'created'> => {
    const [existing, isTaken] = await Promise.all([tx.users.getProfile(user.id), tx.users.handleTakenByOther(user.id, input.handle)]);
    if (existing && hasPenNameRow(existing)) return 'kept';
    if (isTaken) throw taken();
    const initials = input.handle.slice(0, 2).toUpperCase();
    if (existing) {
      const kept = existing.initials;
      tx.users.nameProfile(user.id, {
        handle: input.handle,
        region: input.region,
        primaryLocale: input.primaryLocale,
        ...(typeof kept === 'string' && kept.trim() ? {} : { initials }),
      });
      tx.users.reserveHandle(user.id, input.handle);
      return 'named';
    }
    tx.users.createProfile(user.id, {
      handle: input.handle,
      bio: '',
      region: input.region,
      primaryLocale: input.primaryLocale,
      autoTranslateTo: input.primaryLocale === 'zh-TW' ? ['en'] : ['zh-TW'],
      // No one is verified yet: the badge waits for a real verification process (a verified sign-in email is not one).
      verified: false,
      phoneHash: '',
      avatarSeed: String(Math.abs([...user.id].reduce((sum, ch) => sum + ch.charCodeAt(0), 0))),
      initials,
      // Their avatar's own colour until they upload a photo, one of a few, by uid (lib/design/avatarColors).
      accentColor: avatarColorFor(user.id),
    });
    tx.users.reserveHandle(user.id, input.handle);
    return 'created';
  }, { label: 'createProfile' });
  return { me: await getMe(ctx, user.id), created: outcome === 'created', named: outcome !== 'kept' };
}

const badRequest = (path: string, message: string) => new ApiFailure('invalid_request', message, [{ path, message }]);

/**
 * The profile photo a PATCH names, as the URL stored: `avatarKey` — a key of
 * our storage, made its public URL — or `avatarUrl`, which must be one of
 * our stored pictures (MediaUrlResolver.isOurs): what the rules' storedFile
 * asks of a client's own write, so an avatar is never a picture elsewhere
 * (a tracking pixel). Null when neither is sent.
 */
function avatarOf(ctx: ServerCtx, input: UpdateProfileInput): string | null {
  if (input.avatarKey != null) {
    let url: string;
    try {
      url = ctx.media.publicUrl(input.avatarKey);
    } catch {
      throw badRequest('avatarKey', 'Pictures cannot be stored here.');
    }
    if (ctx.media.keyOf(url) !== input.avatarKey) throw badRequest('avatarKey', 'Not one of our pictures.');
    return url;
  }
  if (input.avatarUrl != null) {
    if (!ctx.media.isOurs(input.avatarUrl)) throw badRequest('avatarUrl', 'Not one of our pictures.');
    return input.avatarUrl;
  }
  return null;
}

/**
 * The hint counts to write: each sent count that raises the stored one (a
 * count never falls — two devices showing a hint count it the larger way),
 * null when none does. The merged map keeps to the rules' size
 * (HINTS_SEEN_MAX), or the request is refused.
 */
export function mergedHints(stored: unknown, sent: Record<string, number>): Record<string, number> | null {
  const before = stored && typeof stored === 'object' && !Array.isArray(stored) ? (stored as Record<string, unknown>) : {};
  const keys = new Set([...Object.keys(before), ...Object.keys(sent)]);
  if (keys.size > HINTS_SEEN_MAX) throw badRequest('hintsSeen', `At most ${HINTS_SEEN_MAX} hints are counted.`);
  const raised: Record<string, number> = {};
  for (const [key, count] of Object.entries(sent)) {
    const was = before[key];
    if (!(typeof was === 'number' && was >= count)) raised[key] = count;
  }
  return Object.keys(raised).length ? raised : null;
}

/**
 * The settings page's profile fields: only those sent change; a new pen name
 * must be free and moves the reservation (the old one released into a hold
 * for this account). Answers the previous pen name when it changed. src/lib/api/v1/profile.ts updateProfile.
 */
export async function updateProfileIn(ctx: ServerCtx, uid: string, input: UpdateProfileInput): Promise<{ me: MeBody; previousHandle: string | null }> {
  const previousHandle = await ctx.uow.run(async (tx) => {
    const row = await tx.users.getProfile(uid);
    if (!row) throw new ApiFailure('not_found', 'This account has no profile yet.');
    const current = String(row.handle ?? '');
    const patch: ProfilePatch = {};
    let renamed: string | null = null;
    if (input.handle != null && input.handle !== current) {
      const [isTaken, releases] = await Promise.all([
        tx.users.handleTakenByOther(uid, input.handle),
        tx.users.ownsReleasableReservation(uid, current, input.handle),
      ]);
      if (isTaken) throw taken();
      patch.handle = input.handle;
      renamed = current;
      // Release the old name — only ever this account's own reservation — into a hold for this account:
      // links that named it by the old name must not reach someone who took it at once.
      if (releases) tx.users.releaseHandle(uid, current);
      tx.users.reserveHandle(uid, input.handle);
    }
    if (input.bio != null) patch.bio = input.bio;
    if (input.region != null) patch.region = input.region;
    if (input.primaryLocale != null) patch.primaryLocale = input.primaryLocale;
    const avatarUrl = avatarOf(ctx, input);
    if (avatarUrl != null) patch.avatarUrl = avatarUrl;
    if (input.autoTranslateTo != null) patch.autoTranslateTo = [...new Set(input.autoTranslateTo)];
    if (input.hintsSeen != null) {
      const hints = mergedHints(row.hintsSeen, input.hintsSeen);
      if (hints) patch.hintsSeen = hints;
    }
    tx.users.patchProfile(uid, patch);
    return renamed;
  }, { label: 'updateProfile' });
  return { me: await getMe(ctx, uid), previousHandle };
}
