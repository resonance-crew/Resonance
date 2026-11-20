import { noPenName } from '@/lib/api/v1/conversations';
import { ApiFailure } from '@/lib/api/v1/http';
import type { ServerCtx } from '@/server/ctx';
import { inviteOpen, inviteReason, pairKey, penName } from '@/server/domain/graph';

// Accepting a legacy invite as an application service. Why each step: the
// comment of src/lib/api/v1/invites.ts `acceptInvite` (the legacy facade,
// which calls this on ctxFor(db)).

export interface AcceptedInvite {
  /** connections/{id}: the two user ids, sorted, joined by "_". */
  connectionId: string;
  /** The sender's bell row, for its push (never returned to the client); null when nothing rang. */
  notificationId: string | null;
}

/** See src/lib/api/v1/invites.ts `acceptInvite`. */
export async function acceptInviteIn(ctx: ServerCtx, uid: string, inviteId: string): Promise<AcceptedInvite> {
  const accepted = await ctx.uow.run(
    async (tx): Promise<AcceptedInvite | 'expired'> => {
      const invite = await tx.graph.getInvite(inviteId);
      const other = invite ? invite.fromUserId : null;
      if (!invite || invite.toUserId !== uid || typeof other !== 'string' || !other || other.includes('/') || other === uid) {
        throw new ApiFailure('not_found', 'No such invite.');
      }
      const pair = pairKey(uid, other);
      if (invite.status === 'accepted') return { connectionId: pair, notificationId: null };
      if (invite.status !== 'pending') throw new ApiFailure('conflict', 'This invite is no longer open.');
      if (!inviteOpen(invite.expiresAt, ctx.clock.now())) {
        tx.graph.setInviteStatus(inviteId, 'expired');
        return 'expired';
      }

      const r = await tx.graph.readPair(uid, other);
      // The pen name before the blocks, as on every path that reaches someone.
      if (!penName(r.me)) throw noPenName();
      // One answer for both directions: the recipient must not learn they were blocked.
      if (r.blockOut || r.blockIn) throw new ApiFailure('blocked', 'You cannot connect with this person.');

      tx.graph.setInviteStatus(inviteId, 'accepted');
      if (r.connected) tx.graph.addReason([uid, other], r.origins, inviteReason(inviteId));
      else tx.graph.connect([uid, other], inviteReason(inviteId), { extra: { inviteId } });
      tx.graph.answerLetters(uid, other, r.requestHeld);
      const notificationId = tx.graph.ringInviteAccepted(other, { inviteId, fromUserId: uid, fromHandle: String(r.me?.handle ?? '') });
      return { connectionId: pair, notificationId };
    },
    { label: 'acceptInvite' },
  );
  if (accepted === 'expired') throw new ApiFailure('conflict', 'This invite has expired.');
  return accepted;
}
