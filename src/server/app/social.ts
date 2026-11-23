import { ApiFailure } from '@/lib/api/v1/http';
import { toAuthor } from '@/lib/api/v1/present';
import type { BlockListBody, ConnectionListBody, InviteListBody, PersonBody, PersonListBody } from '@/lib/api/v1/schemas';
import type { ServerCtx } from '@/server/ctx';
import { inviteOpen } from '@/server/domain/graph';
import type { PersonRow } from '@/server/ports/repos/users';
import { CARD_VISIBILITY_FIELDS } from '@/lib/api/v1/present';
import { visibleCardById } from './cardsRead';
import { touchesFor } from '@/server/domain/realtime';
import { signalWithOwn, type OwnSignals } from './inbox';
import { signal } from './realtime';
import { AUTHOR_FIELDS } from './viewer';

// What the clients read and wrote straight from Firestore until Phase 2 —
// bookmarks, blocks, connections, profiles by id, legacy invites — as
// application services behind /api/v1 (2a-social). Each keeps exactly what
// the rules let a client do (firestore.rules users/{uid}/bookmarks, /blocks,
// connections, invites), re-checked here, and tells the people whose lists
// changed through the signal channel once it has committed.

const PERSON_FIELDS = [...AUTHOR_FIELDS, 'bio', 'joinedAt'] as const;

function personOf(id: string, row: PersonRow | undefined): PersonBody {
  if (!row) return { id, gone: true, author: null, bio: null, joinedAt: null };
  return {
    id,
    gone: false,
    author: toAuthor(id, row),
    bio: typeof row.bio === 'string' && row.bio ? row.bio : null,
    joinedAt: row.joinedAt instanceof Date ? row.joinedAt.toISOString() : null,
  };
}

/**
 * Profiles by id, in the order asked, each once — what a client read with a
 * get each (`users/*` is anyone's to get, never to list), now in one batched
 * read. Someone without a profile (deleted, or never was) is `gone`, with
 * nothing of what they were. A block changes nothing here, as it never did:
 * a profile is public. Nothing here says who wrote which card.
 */
export async function personsIn(ctx: ServerCtx, ids: readonly string[]): Promise<PersonBody[]> {
  const unique = [...new Set(ids)];
  const rows = unique.length ? await ctx.data.users.rowsOf(unique, PERSON_FIELDS) : new Map<string, PersonRow>();
  return unique.map((id) => personOf(id, rows.get(id)));
}

/** GET /users?ids= (see personsIn). */
export async function lookupUsersIn(ctx: ServerCtx, ids: readonly string[]): Promise<PersonListBody> {
  return { users: await personsIn(ctx, ids) };
}

/* ───────────── bookmarks ───────────── */

/**
 * Bookmark a card (收藏): only one the viewer may read, by its document id —
 * canView's check (visibleCardById), so a card they can't read is `not_found`
 * exactly as it is on GET /cards/{key}, an absent one alike, and no answer
 * here tells anything that one doesn't. A 私人卡 shared with them in a
 * message is a pass to read it, never to bookmark it (safety.md), and a slug
 * is no id (api.md: an id route reads by id). A block never keeps a card from its reader
 * (a named one is the client's to hide, an anonymous one is everyone's), so
 * neither does it here. Bookmarking again keeps the first time. Never counted,
 * never told to the author.
 */
export async function putBookmarkIn(ctx: ServerCtx, uid: string, cardId: string, spent?: Promise<void>): Promise<void> {
  const card = await visibleCardById(ctx, uid, cardId, CARD_VISIBILITY_FIELDS);
  // The saver's budget, spent beside the card's read (BE-7): awaited before the write.
  await spent;
  await ctx.data.social.putBookmark(uid, card.id);
}

/** Take a bookmark back; one that isn't there is already gone. */
export async function deleteBookmarkIn(ctx: ServerCtx, uid: string, cardId: string): Promise<void> {
  await ctx.data.social.deleteBookmark(uid, cardId);
}

/* ───────────── blocks ───────────── */

/**
 * Block someone (封鎖), in ONE transaction: the block, the connection ended
 * when there is one, every pending invite between the two withdrawn — what
 * the client did in three steps (lib/db/firestore/client/blocks.ts), so none
 * can be left half done. The blocked person is never told: their signal is
 * touched only when something they can see changed anyway (the connection
 * went, an invite of theirs closed) — never for the block alone. Blocking
 * again changes nothing. Answers whether the block is new. The blocker's own
 * touch is made before the response when `own` asks for its counters
 * (signalWithOwn): their client's pull right after finds its `graph` moved,
 * never an early 304 for the list as it was.
 */
export async function blockIn(ctx: ServerCtx, uid: string, other: string, own?: (signals: OwnSignals) => void): Promise<boolean> {
  if (other === uid) throw new ApiFailure('invalid_request', 'You cannot block yourself.');
  const reads = await ctx.uow.run(
    async (tx) => {
      const r = await tx.social.readBlock(uid, other);
      tx.social.block(uid, other, r);
      return r;
    },
    { label: 'block' },
  );
  const theirsChanged = reads.connected || reads.pendingInvites.length > 0;
  if (!reads.blocked || theirsChanged) await signalWithOwn(ctx, uid, touchesFor([{ kind: 'graph', uids: theirsChanged ? [uid, other] : [uid] }]), own);
  return !reads.blocked;
}

/**
 * Unblock: the block goes, nothing else comes back — a connection the block
 * ended stays ended, a withdrawn invite withdrawn. Only the unblocker's own
 * list changed, so only their signal is touched (before the response when
 * `own` asks for its counters, as blockIn).
 */
export async function unblockIn(ctx: ServerCtx, uid: string, other: string, own?: (signals: OwnSignals) => void): Promise<void> {
  if (await ctx.data.social.unblock(uid, other)) await signalWithOwn(ctx, uid, touchesFor([{ kind: 'graph', uids: [uid] }]), own);
}

/** Everyone the viewer blocked, the latest first, with their profiles (GET /me/blocks). */
export async function listBlocksIn(ctx: ServerCtx, uid: string): Promise<BlockListBody> {
  const rows = await ctx.data.social.listBlocks(uid);
  const people = await personsIn(ctx, rows.map((r) => r.uid));
  const byId = new Map(people.map((p) => [p.id, p]));
  return { blocks: rows.map((r) => ({ userId: r.uid, blockedAt: r.createdAt?.toISOString() ?? null, person: byId.get(r.uid)! })) };
}

/* ───────────── connections ───────────── */

/** The people the viewer is connected with, the latest first, with their profiles (GET /me/connections). */
export async function listConnectionsIn(ctx: ServerCtx, uid: string): Promise<ConnectionListBody> {
  const rows = await ctx.data.social.listConnections(uid);
  const people = await personsIn(ctx, rows.map((r) => r.other));
  const byId = new Map(people.map((p) => [p.id, p]));
  return { connections: rows.map((r) => ({ userId: r.other, establishedAt: r.establishedAt?.toISOString() ?? null, person: byId.get(r.other)! })) };
}

/* ───────────── invites (legacy) ───────────── */

/**
 * The invites waiting for the viewer's answer, the latest first: pending and
 * not past their date (lib/db/firestore/client/invites.ts
 * listIncomingPendingInvites) — one without a date was never sent by a
 * writer of ours, and is as closed as accepting it finds it.
 */
export async function incomingInvitesIn(ctx: ServerCtx, uid: string): Promise<InviteListBody> {
  const now = ctx.clock.now();
  const rows = (await ctx.data.social.pendingInvitesTo(uid)).filter((r) => inviteOpen(r.expiresAt, now) && r.fromUserId && r.fromUserId !== uid);
  const people = await personsIn(ctx, rows.map((r) => r.fromUserId));
  const byId = new Map(people.map((p) => [p.id, p]));
  return {
    invites: rows.map((r) => ({
      id: r.id,
      fromUserId: r.fromUserId,
      message: r.message,
      referenceCardId: r.referenceCardId,
      createdAt: r.createdAt?.toISOString() ?? null,
      expiresAt: r.expiresAt!.toISOString(),
      from: byId.get(r.fromUserId)!,
    })),
  };
}

/**
 * Its recipient says no (POST /invites/{id}/decline): the invite closes — no
 * connection, no bell, nothing told to its sender (their signal untouched).
 * Only the recipient's: anyone else finds no such invite, as accepting it
 * does. Declining again is harmless; one closed otherwise is a conflict.
 */
export async function declineInviteIn(ctx: ServerCtx, uid: string, inviteId: string): Promise<void> {
  const changed = await ctx.uow.run(
    async (tx) => {
      const invite = await tx.graph.getInvite(inviteId);
      if (!invite || invite.toUserId !== uid) throw new ApiFailure('not_found', 'No such invite.');
      if (invite.status === 'declined') return false;
      if (invite.status !== 'pending') throw new ApiFailure('conflict', 'This invite is no longer open.');
      tx.social.declineInvite(inviteId);
      return true;
    },
    { label: 'declineInvite' },
  );
  if (changed) await signal(ctx, { kind: 'graph', uids: [uid] });
}
