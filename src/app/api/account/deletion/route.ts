import { NextResponse, after } from 'next/server';
import { revalidateLocalized } from '@/lib/api/revalidate';
import { crossOriginCookieWrite } from '@/lib/api/sameOrigin';
import { getCurrentUser } from '@/lib/auth';
import { revokeSessions } from '@/lib/auth/firebase/server';
import { getAdminDb } from '@/lib/db/firestore/admin';
import {
  cancelAccountDeletion,
  getAccountDeletion,
  holdAnonymousCards,
  releaseHeldCards,
  scheduleAccountDeletion,
  type AccountDeletion,
} from '@/lib/account/deletion';

function unauthorized() {
  return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
}

function body(deletion: AccountDeletion | null) {
  return {
    deletion: deletion
      ? { requestedAt: deletion.requestedAt.toISOString(), purgeAfter: deletion.purgeAfter.toISOString() }
      : null,
  };
}

/** Whether the signed-in account is scheduled for deletion (drives the undo banner). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  return NextResponse.json(body(await getAccountDeletion(getAdminDb(), user.id)));
}

/**
 * Schedule deletion, hold its published anonymous cards in its trash
 * (holdAnonymousCards; cancelling brings them back), and revoke the account's sessions (revokeSessions): no
 * device can renew its sign-in, so every one — this one too — is signed out
 * within the hour its current ID token has left. Until then writes and these
 * account routes refuse it at once, reads within REVOCATION_CACHE_MS, and
 * Firestore (which a device can reach directly) not before it expires.
 * Signing back in within the grace period can still cancel. An account that
 * signs in with Apple has revoked its Apple token just before, from the
 * client (lib/auth/firebase/appleToken.ts, the iOS app's
 * AppleTokenRevocation): that takes a session this revokes.
 */
export async function POST(req: Request) {
  // A write with the session cookie from another origin (a same-site subdomain too) is never the caller's own page.
  if (crossOriginCookieWrite(req)) return NextResponse.json({ error: 'This request did not come from the site' }, { status: 403 });

  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const db = getAdminDb();
  const deletion = await scheduleAccountDeletion(db, user.id);
  // Its anonymous cards go out of sight now, not beside the profile at the purge (holdAnonymousCards).
  const stale = await holdAnonymousCards(db, user.id);
  await revokeSessions(user.id);
  if (stale.length) after(() => revalidateLocalized(stale));
  return NextResponse.json(body(deletion));
}

/** Cancel a scheduled deletion. */
export async function DELETE(req: Request) {
  // A write with the session cookie from another origin (a same-site subdomain too) is never the caller's own page.
  if (crossOriginCookieWrite(req)) return NextResponse.json({ error: 'This request did not come from the site' }, { status: 403 });

  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const db = getAdminDb();
  await cancelAccountDeletion(db, user.id);
  const stale = await releaseHeldCards(db, user.id);
  if (stale.length) after(() => revalidateLocalized(stale));
  return NextResponse.json(body(null));
}
