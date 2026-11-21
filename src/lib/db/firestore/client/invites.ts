'use client';

import type { Invite } from '@/lib/db/types';
import type { InviteListBody } from '@/lib/api/v1/schemas';
import { getFirebaseClientAuth } from '@/lib/auth/firebase/client';
import { callApi } from './api';
import { rememberPeople } from './reads';
import { pokeSignal } from './signals';

function requireUid(): string {
  const uid = getFirebaseClientAuth().currentUser?.uid;
  if (!uid) throw new Error('Not signed in');
  return uid;
}

/**
 * Accept an invite, through the server (POST /api/v1/invites/{id}/accept):
 * in one transaction it marks the invite accepted, connects
 * the two — keeping a connection a resonance or a note already made — and
 * rings the sender's "invite accepted" bell, which it also pushes. It
 * re-checks what the rules can't: that the invite is yours and still open,
 * and that no block stands between you. Answers the connection's id; a retry
 * after success answers it again and rings nothing.
 */
export async function acceptInvite(inviteId: string): Promise<string> {
  requireUid();
  const { connectionId } = await callApi<{ connectionId: string }>(
    `/api/v1/invites/${encodeURIComponent(inviteId)}/accept`,
    { method: 'POST' },
  );
  return connectionId;
}

/** The recipient says no (POST /api/v1/invites/{id}/decline): the invite closes, no connection, no notification. */
export async function declineInvite(inviteId: string): Promise<void> {
  requireUid();
  await callApi(`/api/v1/invites/${encodeURIComponent(inviteId)}/decline`, { method: 'POST' });
  pokeSignal('graph');
}

/**
 * The invites still waiting for the signed-in viewer's answer, newest first:
 * pending and not yet past their "respond by" date. One past it the server
 * refuses (409) and closes as expired, but until someone taps Accept it is
 * still `pending` — so the date is checked here too, on the invites the
 * server lists (GET /api/v1/invites?box=incoming: a few at most, none are
 * sent any more). One without a date was
 * never sent by a writer of ours, and is as closed as the server finds it.
 */
export async function listIncomingPendingInvites(now: Date = new Date()): Promise<Invite[]> {
  const uid = getFirebaseClientAuth().currentUser?.uid;
  if (!uid) return [];
  const body = await callApi<InviteListBody>('/api/v1/invites?box=incoming');
  rememberPeople(body.invites.map((i) => i.from));
  return body.invites
    .map(
      (i): Invite => ({
        id: i.id,
        fromUserId: i.fromUserId,
        toUserId: uid,
        message: i.message,
        referenceCardId: i.referenceCardId ?? undefined,
        status: 'pending',
        expiresAt: new Date(i.expiresAt),
        createdAt: i.createdAt ? new Date(i.createdAt) : new Date(0),
      }),
    )
    .filter((i) => i.expiresAt.getTime() > now.getTime());
}
