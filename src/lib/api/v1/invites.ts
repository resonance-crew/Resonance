import type { AdminDb } from '@/server/infra/firestore/db';
import { ctxFor } from '@/server/infra/firestore/ctx';
import { acceptInviteIn, type AcceptedInvite } from '@/server/app/invites';

export type { AcceptedInvite };

// A legacy facade (src/server/README.md): today's export and signature, run
// by the service of src/server/app/invites.ts on a context bound to `db`.

/**
 * Accept a legacy invite (none are sent any more; the pending ones are still
 * answered). What the web's acceptInvite() did from the browser, in one
 * transaction: the invite goes from pending to accepted, the two are
 * connected — naming the invite; a connection they already have (a
 * resonance or an answered note made it since) is kept as it is, the
 * accepted invite one more reason it stands (connectionOrigins: taking a
 * resonance back never ends it then) — and the sender's bell rings "invite
 * accepted", under the recipient's pen name as it is now. Both of them
 * having said yes, it answers any letter waiting in their conversation
 * (`request`, see sendNote): it is deleted, with both people's letters/*
 * counts.
 *
 * Only its recipient may accept it: anyone else's is not_found. A block
 * either way refuses it; one no longer pending (declined, withdrawn,
 * expired) is a conflict. Accepting twice is harmless: the second answers the
 * same connection and rings nothing.
 *
 * An invite was open for a week (`expiresAt`, which every sender — the web's
 * and the API's — wrote beside it, and the inbox shows as "respond by"). One
 * past it is refused as a conflict and closed as `expired`, so the inbox
 * stops offering it; one without a date was never sent by a writer of ours
 * (the old rules let any client create one), and is treated the same.
 */
export function acceptInvite(db: AdminDb, uid: string, inviteId: string): Promise<AcceptedInvite> {
  return acceptInviteIn(ctxFor(db), uid, inviteId);
}
