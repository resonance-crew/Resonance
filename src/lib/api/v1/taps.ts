import type { CardTapBody, TapListBody } from './schemas';
import type { Card } from '@/lib/db/types';
import type { AdminDb } from '@/server/infra/firestore/db';
import { ctxFor } from '@/server/infra/firestore/ctx';
import { cardTapIn, deleteTapsOnIn, listTapsIn, setTapIn } from '@/server/app/taps';

/**
 * The resonance tap (共振, round 26): the first of the three answers under a
 * story — tapping 共振 — beside a note (小紙條) and a card written in reply
 * (用卡片回應, the older "resonance", which keeps its name in the contract:
 * `/resonances`, `referenceCardId`). Hence the names here: the collection
 * `resonanceTaps`, the endpoint `/tap`, the bell `resonance_tap`.
 *
 * `resonanceTaps/{cardId}_{uid}` = `{ cardId, userId, on, at, rangAt }`, one
 * per reader and card, server-only (the rules refuse every client read and
 * write). Taking a tap back sets `on: false` and keeps the document: its
 * `rangAt` — when the tap rang the card's author — is what keeps a reader
 * from ringing them again by tapping, taking back and tapping again (one ring
 * per reader and card, ever). `at` is when it last turned on (the lists'
 * order, newest first).
 *
 * A tap connects no one, opens no conversation and gives the author no way to
 * write to the reader (their list of who resonated opens a profile, never a
 * thread, unless that person also left a note); taking one back tells no one;
 * no count is shown anywhere. The author can't tap their own card: on an
 * anonymous card their face would show to their connections. That leaves a
 * weak inference — a reader who taps everything is never seen on their own
 * anonymous cards — which notes and reply cards leave already (no one answers
 * their own card), and is accepted.
 *
 * Blocks: a named card across a block either way is refused (`blocked`, as a
 * note is); an anonymous card across one is tapped exactly as without it —
 * the reader's own answer, face and state, and what their connections see,
 * never change with a block (the reader writes their own block list: a face
 * that vanished when they blocked a guess would name the author). Only the
 * author's side leaves them out: the author's faces and list, the bell and the
 * push (lib/push/tapBell, after the response, in their own transaction, so
 * nothing the answer waits on differs with a block).
 *
 * A card shared privately in a conversation (./sharedCards) is never tapped:
 * the routes read it by id (visibleCardById), without the pass.
 */
export { TAPS, TAP_PAGE, TAP_NOTE_EXCERPT, noteExcerpt, type TapOutcome } from '@/server/domain/taps';
export { tapRef } from '@/server/infra/firestore/repos/taps';

// Legacy facades (src/server/README.md): today's exports and signatures, run
// by the services of src/server/app/taps.ts on a context bound to `db`.

/**
 * Resonate with a card (`on: true`, PUT /cards/{id}/tap) or take it back
 * (`on: false`, DELETE). Checked in this order: the card — one the reader
 * may read, by id (never through a shared-card pass), published, not in the
 * trash, else not_found —; not their own (invalid_request); and, to turn it
 * on, their pen name (forbidden, asked before the blocks, as every path asks
 * it) and a block either way on a named card (`blocked`; an anonymous card is
 * tapped whoever was blocked). Taking back reaches no one: it needs neither,
 * and works across a block too.
 *
 * One transaction writes the tap document alone (the card read again in it:
 * one hidden or trashed meanwhile is not_found). Whatever reaches the author —
 * the ring, the bell — is the caller's to start after the response.
 */
export function setTap(
  db: AdminDb,
  uid: string,
  cardId: string,
  on: boolean,
  now = Date.now(),
  /** The tapper's budget, spent beside this (budgetFirst, B7): awaited before anything is written. */
  spent?: Promise<void>,
) {
  return setTapIn(ctxFor(db), uid, cardId, on, now, spent);
}

/** Every tap on the card `id`, a batch at a time (deleting the card; an anonymous card going into the trash). */
export function deleteTapsOn(db: AdminDb, id: string): Promise<void> {
  return deleteTapsOnIn(ctxFor(db), id);
}

/**
 * `CardDetail.tap` (GET /cards/{key}): null unless the viewer is the card's
 * author (their published card, out of the trash) or a reader who may tap
 * it — and never for a card read through a shared-card pass (`pass`).
 */
export function cardTap(
  db: AdminDb,
  viewerId: string,
  card: Card,
  opts: { pass: boolean; blocked?: Promise<ReadonlySet<string>> },
): Promise<CardTapBody | null> {
  return cardTapIn(ctxFor(db), viewerId, card, opts);
}

/**
 * GET /cards/{id}/taps?pageToken= — who resonated, as the viewer may see
 * them. The author: everyone (but across a block), newest first, TAP_PAGE a
 * page, each with the excerpt of the latest note they left on a named card
 * (`note`; on an anonymous card always null — nothing there opens a thread).
 * A reader: the same people as `CardDetail.tap.faces` without the cap — they
 * themselves first, then their connections —, one page, no notes. Anyone for
 * whom `tap` is null (a draft, a card in the trash, a named card across a
 * block, a card they can't read) is not_found.
 */
export function listTaps(db: AdminDb, viewerId: string, cardId: string, pageToken?: string | null): Promise<TapListBody> {
  return listTapsIn(ctxFor(db), viewerId, cardId, pageToken);
}
