import type { AdminDb } from '@/server/infra/firestore/db';
import { ctxFor } from '@/server/infra/firestore/ctx';
import { reachResonanceIn, resonateWithIn, tryReachResonanceIn, unresonateIn, type Resonated } from '@/server/app/resonate';

/**
 * A resonance is a card answering another (`referenceCardId`). It is usually
 * written as one — the writer starts from the original, and publishing
 * connects the two authors (./publish) — but a card already written can
 * become one too: the reader picks one of their own published public cards,
 * and the server points it at the card they are reading. Everything that
 * lists resonances keys on that one field (the original's list, the card box's
 * resonated shelf, the thought map, the card's own "此文共振自"), so nothing
 * else is written for it.
 */

// The policy (pure) lives in src/server/domain/graph.ts, the services in
// src/server/app/resonate.ts, the Firestore code in
// src/server/infra/firestore/repos/graph.ts. What follows are today's
// exports, re-exported or as legacy facades (src/server/README.md).

export type { Resonated };

/**
 * The one bell row a reader's resonances with a card ring, whichever of
 * their cards answers it and whichever path reaches it: picking a card,
 * taking it back and picking it (or another) again, publishing one, making
 * one public — the original author is rung once.
 */
/**
 * Whether a resonance may reach the original's author at all: only one shown
 * publicly under its writer's name. The original's list shows public cards
 * only, so a private or connections-only resonance is one its author could
 * never see — it must neither ring them nor connect the two — and an
 * anonymous one would name its writer in the connection and the bell.
 */
/**
 * Whether a change to a card (`before` → `after`, its stored fields) made a
 * published resonance reachable: public under its writer's name where it
 * wasn't. Such a card reaches the original then (reachResonance) — once: a
 * reader who already rang that card's author rings nothing again.
 */
/**
 * Whether a card is a published resonance its original's list doesn't show
 * under its writer's name — private, connections-only or anonymous: whatever
 * reason it was for the two to be connected, it is no longer (a PATCH or an
 * applied edit that leaves it so takes it back, see ./origins).
 */
export { becameReachable, hiddenResonance, reachable, resonanceBellId } from '@/server/domain/graph';

/** All a resonance's reach depends on, read in its transaction (readReach): src/server/ports/repos/graph.ts `Reach`. */
export type { Reach as ReachReads } from '@/server/ports/repos/graph';

// readReach's legacy bell, in src/server/infra/firestore/repos/graph.ts:
// A resonance bell from before they had a fixed id (resonanceBellId): the old
// publish path, and older still the browser, wrote `type: 'resonance'` rows
// under random ids, with the same payload. Equality on four fields only, so
// Firestore merges its single-field indexes: no composite index.
// 
// For one day (2026-06-04/05, 5998ec4 → 90d9728) the browser also rang this
// row for a "like" (markResonance, before a resonance became a card): the
// same type, the same payload, its own random id. Only its date tells the
// two apart — every such row from before 90d9728 went live was a like — and
// when that was is recorded nowhere. So a reader who liked a card that day
// and answers it now counts as having rung its author already: no second
// ring, and no connection made by it (fewer connections, never more).

/**
 * Read, in `tx` and before it writes anything, what a resonance from `from`
 * to the card `originalId` (a valid id) depends on: the original, the
 * resonator's profile and their bell for it, then — the author known — the
 * blocks both ways, the connection and its origins and, while the bell isn't
 * there, a legacy bell standing for it.
 */
/**
 * Reach the original's author, in the transaction that read `r` — `card` is
 * the resonance as that transaction leaves it. Every resonance path comes
 * here (publishing one, resonating with a card already written, making a
 * published one public and named), so all hold to the same:
 *
 * - the resonance is the resonator's, published, answers that original, and
 *   is public under their name (reachable);
 * - the original is there, someone else's, and theirs to read (cardVisible,
 *   with the connection read in this transaction);
 * - no block either way, and the resonator has a pen name (hasPenName).
 *
 * Such a resonance stands: on a named original it is a reason the two are
 * connected (connectionOrigins, ./origins) — it connects them when they
 * aren't, and when they are it is kept beside whatever else made them, so
 * taking another back leaves them connected while this one stands. It never
 * connects them across anonymity: an anonymous original would be named to the
 * resonator by the connection. An existing connection is never written over
 * (it carries `muted`, its date). A letter waiting between the two is left as
 * it is: only its recipient answers it (see sendNote).
 *
 * It rings the original's author once: the bell `resonance_{uid}_{originalId}`
 * is the record, written once — so a reader rings a card's author once
 * whichever path fires, and a connection a block ended (or a take-back) is
 * never made again without a ring. A bell rung before the record had a fixed
 * id counts too (ReachReads.rang). The bell of a resonance on an anonymous
 * card says so (`payload.anonymous`): its push opens the card, never a thread
 * with the resonator, which their unread count would answer for (the bell
 * lists are to do the same: the clients' part). Answers the bell's id, or
 * null when nothing rang.
 */
export { readReach } from '@/server/infra/firestore/repos/graph';
export { reachOriginal } from '@/server/infra/firestore/legacy/graph';

/**
 * Reach the original your card `cardId` answers (reachOriginal), in a
 * transaction of its own: what publishing a resonance, and making a published
 * one public and named, do once their own write is in. The card is read as it
 * is now, so one made private or anonymous in between reaches no one. Answers
 * the bell's id, or null.
 */
export function reachResonance(db: AdminDb, uid: string, cardId: string): Promise<string | null> {
  return reachResonanceIn(ctxFor(db), uid, cardId);
}

/**
 * reachResonance as the paths around a card's own write take it: best effort
 * — a failure is logged and reaches no one, and the write it follows stands
 * (publishing, a PATCH, an applied edit never fail for it).
 */
export function tryReachResonance(db: AdminDb, uid: string, cardId: string): Promise<string | null> {
  return tryReachResonanceIn(ctxFor(db), uid, cardId);
}

/**
 * Make one of your published public cards a resonance of `targetId` (POST
 * /cards/{targetId}/resonances): it now answers that card, as if it had been
 * written in response to it — the same reach as publishing one, in the same
 * transaction as the pointing (reachOriginal): the authors connected (not
 * across anonymity), the original author's bell rung once. What
 * firestore.rules would ask of a resonance written in the browser is asked
 * here: a card you can read that isn't yours, no block either way — unless it
 * is anonymous, which a block never answers for (it reaches no one then). And
 * what reaching anyone asks: a pen name, when your card is public under it.
 *
 * A card answers one card, and a reader answers a card with one of theirs
 * (the card page's 共振 / 修改 button stands on it): a card already
 * answering another, or a second card for the same original, is a conflict
 * — read in the transaction, so two taps racing can't both win. Only a
 * published public card qualifies: the original's list shows public cards
 * only, and a hidden resonance would still ring someone's phone. A card
 * answering yours can't be made to answer it back.
 *
 * The card's `updatedAt` is left alone: nothing a list shows of it changes
 * (bumping it would make lists read its story again, see ./summary).
 */
export function resonateWith(db: AdminDb, uid: string, targetId: string, cardId: string): Promise<Resonated> {
  return resonateWithIn(ctxFor(db), uid, targetId, cardId);
}

/**
 * Stop your card answering `targetId` (DELETE /cards/{targetId}/resonances/
 * {cardId}): it stays, as a card of its own. Written resonances too. It is no
 * longer a reason the two of you are connected (readTakeBack), and the
 * connection goes when no reason is left: no other resonance either way, no
 * answer from the original's author to one (answeredBy), no answered letter,
 * no invite, not made before reasons were kept. The bell row stays:
 * answering that card again rings no one and connects no one (reachOriginal
 * rings a reader once per card). Asking again changes nothing (`changed:
 * false`); someone else's card is not_found.
 */
export function unresonate(db: AdminDb, uid: string, targetId: string, cardId: string): Promise<{ changed: boolean; stale: string[] }> {
  return unresonateIn(ctxFor(db), uid, targetId, cardId);
}
