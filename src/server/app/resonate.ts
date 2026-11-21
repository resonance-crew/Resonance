import { cardPagePaths } from '@/lib/api/revalidate';
import { noPenName } from '@/lib/api/v1/conversations';
import { ApiFailure } from '@/lib/api/v1/http';
import { IN_TRASH_MESSAGE } from '@/lib/api/v1/inTrash';
import { cardVisible, toFeedCard } from '@/lib/api/v1/present';
import type { FeedCardBody } from '@/lib/api/v1/schemas';
import { isReservedId } from '@/lib/db/firestore/reservedId';
import type { ServerCtx } from '@/server/ctx';
import { docId, penName, properlyPublishedAt, reachable, resonanceReason, type ResonanceCard } from '@/server/domain/graph';
import type { GraphTxRepo, Reach } from '@/server/ports/repos/graph';
import { signal } from './realtime';

// Resonances — a card answering another — as application services: what
// each checks, in which order, and what it writes. Why: the module comments
// of src/lib/api/v1/resonate.ts and ./origins (the legacy facades, which call
// these on ctxFor(db)).

/**
 * Reach the original's author, in the transaction that read `r` — `card` is
 * the resonance as that transaction leaves it (src/lib/api/v1/resonate.ts
 * `reachOriginal`). Answers the bell's id, or null when nothing rang. A
 * connection it makes is added to `made` (the two, to signal once the
 * transaction has committed).
 */
export function reachOriginalWith(graph: GraphTxRepo, cardId: string, card: ResonanceCard, r: Reach, now: number, made?: string[][]): string | null {
  const o = r.original;
  if (!reachable(card) || card.authorId !== r.from || card.referenceCardId !== r.originalId || !properlyPublishedAt(card.publishedAt, now)) return null;
  if (!o || !docId(o.authorId) || o.authorId === r.from || !cardVisible(o, r.from, () => r.connected)) return null;
  if (r.blockOut || r.blockIn || !penName(r.me)) return null;
  const named = o.anonymous !== true;
  if (named) {
    const reason = resonanceReason(r.from, cardId, r.originalId);
    if (r.connected) graph.addReason([r.from, o.authorId], r.origins, reason);
    else if (!r.rang) {
      graph.connect([r.from, o.authorId], reason);
      made?.push([r.from, o.authorId]);
    }
  }
  if (r.rang) return null;
  graph.ringResonance(r.bellId, { to: o.authorId, from: r.from, fromHandle: String(r.me!.handle), cardId: r.originalId, anonymous: !named });
  return r.bellId;
}

/** See src/lib/api/v1/resonate.ts `reachResonance`. */
export async function reachResonanceIn(ctx: ServerCtx, uid: string, cardId: string): Promise<string | null> {
  let made: string[][] = [];
  const bell = await ctx.uow.run(
    async (tx) => {
      made = [];
      const card = await tx.graph.getCard(cardId);
      const fields = card?.resonance;
      if (!fields || fields.authorId !== uid || !reachable(fields) || !docId(fields.referenceCardId)) return null;
      return reachOriginalWith(tx.graph, cardId, fields, await tx.graph.readReach(uid, fields.referenceCardId), ctx.clock.now(), made);
    },
    { label: 'reachResonance' },
  );
  await signalGraph(ctx, made);
  return bell;
}

/** Tell both people of each connection made or ended that their graph changed — after the commit. */
function signalGraph(ctx: ServerCtx, pairs: readonly string[][]): Promise<void> {
  return pairs.length ? signal(ctx, { kind: 'graph', uids: pairs.flat() }) : Promise.resolve();
}

/** See src/lib/api/v1/resonate.ts `tryReachResonance`. */
export function tryReachResonanceIn(ctx: ServerCtx, uid: string, cardId: string): Promise<string | null> {
  return reachResonanceIn(ctx, uid, cardId).catch((e) => (ctx.log.error('[api/v1] resonance', cardId, e), null));
}

export interface Resonated {
  /** The chosen card as its author's card box shows it (their byline kept when anonymous), now answering the target. */
  card: FeedCardBody;
  /** False when it already answered the target: nothing was written, no one was rung. */
  changed: boolean;
  /** The original author's bell row, for its push (never returned to the client). */
  notificationId: string | null;
  /** The chosen card's pages, to revalidate after the response (their seed names the card it answers); empty when unchanged. */
  stale: string[];
}

const notFound = () => new ApiFailure('not_found', 'No such card.');

/** See src/lib/api/v1/resonate.ts `resonateWith`. */
export async function resonateWithIn(ctx: ServerCtx, uid: string, targetId: string, cardId: string): Promise<Resonated> {
  const target = await ctx.data.graph.visibleCard(uid, targetId);
  if (!target.publishedAt) throw notFound();
  if (target.authorId === uid) throw new ApiFailure('invalid_request', 'You cannot resonate with your own card.');
  // An id Firestore keeps for itself names no card of theirs (reading it would throw).
  if (isReservedId(cardId)) throw notFound();

  let made: string[][] = [];
  const resonated = await ctx.uow.run(
    async (tx) => {
      made = [];
      // "One per reader": any card of theirs already answering the target (a draft too — the button says 修改 then).
      const [chosen, answers, reach] = await Promise.all([tx.graph.getCard(cardId), tx.graph.findAnswers(uid, targetId, 2), tx.graph.readReach(uid, targetId)]);
      const targetNow = reach.original;
      // Someone else's card is as absent as a missing one.
      if (!chosen || chosen.resonance.authorId !== uid) throw notFound();
      // Your own card in the trash answers nothing until it is restored.
      if (chosen.trashed) throw new ApiFailure('conflict', IN_TRASH_MESSAGE);
      if (!targetNow || targetNow.authorId !== target.authorId || !cardVisible(targetNow, uid, () => reach.connected)) throw notFound();
      const answered: ResonanceCard = { ...chosen.resonance, referenceCardId: targetId };
      // A pen name for what reaches someone, asked before the blocks, as everywhere: an anonymous card reaches no one and needs none.
      if (reachable(answered) && !penName(reach.me)) throw noPenName();
      // A block refuses a named card — one answer for both directions. Never an anonymous one: a refusal would name its author.
      if ((reach.blockOut || reach.blockIn) && targetNow.anonymous !== true) {
        throw new ApiFailure('blocked', 'You cannot resonate with this card.');
      }
      const now = ctx.clock.now();
      if (!properlyPublishedAt(chosen.resonance.publishedAt, now)) throw new ApiFailure('invalid_request', 'Only a published card can resonate.');
      if (chosen.resonance.visibility !== 'public') throw new ApiFailure('invalid_request', 'Only a public card can resonate.');

      const result = (changed: boolean, notificationId: string | null): Resonated => ({
        card: toFeedCard({ ...chosen.card, referenceCardId: targetId }, reach.me ?? undefined, { deanonymize: true }),
        changed,
        notificationId,
        stale: changed ? cardPagePaths({ id: cardId, slug: chosen.slug }) : [],
      });

      const current = chosen.resonance.referenceCardId;
      if (current === targetId) return result(false, null);
      if (typeof current === 'string' && current) throw new ApiFailure('conflict', 'This card already resonates with another card.');
      if (answers.some((id) => id !== cardId)) throw new ApiFailure('conflict', 'Another of your cards already resonates with this one.');
      if (targetNow.referenceCardId === cardId) throw new ApiFailure('invalid_request', 'That card already resonates with this one.');

      tx.graph.pointCard(cardId, targetId);
      // An anonymous card reaches no one (reachable): it still answers.
      return result(true, reachOriginalWith(tx.graph, cardId, answered, reach, now, made));
    },
    { label: 'resonateWith' },
  );
  await signalGraph(ctx, made);
  return resonated;
}

/** See src/lib/api/v1/resonate.ts `unresonate`. */
export async function unresonateIn(ctx: ServerCtx, uid: string, targetId: string, cardId: string): Promise<{ changed: boolean; stale: string[] }> {
  if (isReservedId(cardId)) throw notFound();
  let ended: string[][] = [];
  const done = await ctx.uow.run(
    async (tx) => {
      ended = [];
      const card = await tx.graph.getCard(cardId);
      if (!card || card.resonance.authorId !== uid) throw notFound();
      if (card.resonance.referenceCardId !== targetId) return { changed: false, stale: [] };
      const plans = await tx.graph.readTakeBack(uid, cardId);
      // Not `updatedAt` either: nothing a list shows of it changes.
      tx.graph.unpointCard(cardId);
      tx.graph.takeBack(plans);
      // A connection that ends with it changes both sides' lists.
      ended = plans.filter((p) => p.ends).map((p) => [uid, otherOf(p.pair, uid)]);
      return { changed: true, stale: cardPagePaths({ id: cardId, slug: card.slug }) };
    },
    { label: 'unresonate' },
  );
  await signalGraph(ctx, ended);
  return done;
}

/** The other person of a pair id (the two uids, sorted, joined by `_`) `uid` is in. */
function otherOf(pair: string, uid: string): string {
  return pair.startsWith(uid + '_') ? pair.slice(uid.length + 1) : pair.slice(0, pair.length - uid.length - 1);
}
