import { pushConnectionCardIn, type ConnectionCardRun } from '@/server/app/pushConnectionCards';
import { fcmPushGateway, fromPushSender, type PushSender } from '@/server/infra/fcm/push';
import { ctxFor } from '@/server/infra/firestore/ctx';
import type { AdminDb } from '@/server/infra/firestore/db';

/**
 * "A new card from someone you're connected with": after a card's FIRST
 * publish (the publish route's after-response work), each of the author's
 * connections who turned `connectionCards` on hears of it — push only, never
 * a bell row.
 *
 * Only a card that is published, public and under its author's name, by an
 * author with a pen name: an anonymous one would be named by the push, and a
 * connections-only or private one isn't news to share. A resonance counts
 * (it is a public card under a pen name too) — except to the author of the
 * card it answers, whose own bell already rings for it.
 *
 * Each recipient is skipped when they muted the connection, when a block
 * stands between the two either way, or when the card stopped being public,
 * named and published by the time it would go (it is read again then). At
 * most three a day reach one person from this, claimed in
 * `connectionCardPushes/{uid}` in a transaction before sending (`{ day,
 * cards }`: today's UTC day and the cards pushed on it), which also makes it
 * once only per card. Connections are few; past CONNECTION_FANOUT_MAX the
 * rest are left out and the cut is logged.
 *
 * The service is src/server/app/pushConnectionCards; these keep the old signatures.
 */
export {
  CONNECTION_CARD_PUSHES,
  CONNECTION_CARDS_PER_DAY,
  CONNECTION_FANOUT_MAX,
  type ConnectionCardOutcome,
  type ConnectionCardRun,
} from '@/server/app/pushConnectionCards';
export { connectionCardText } from '@/server/domain/push/text';

/** Announce a just-published card to the author's connections who asked for it. Never throws for one recipient's failure. */
export function pushConnectionCard(
  db: AdminDb,
  cardId: string,
  sender: PushSender,
  opts: { now?: number; concurrency?: number; fanoutMax?: number } = {},
): Promise<ConnectionCardRun> {
  return pushConnectionCardIn(ctxFor(db, { push: fromPushSender(sender) }), cardId, opts);
}

/**
 * The publish route's after-response work for a FIRST publish: once the
 * card's slug has settled (`slug`, the publish's own promise of it — so the
 * push opens the card's real address), announce it (pushConnectionCard).
 * Never throws; logs what it did when it reached anyone. Without a sender,
 * FCM through the Admin SDK, loaded on the first send (a publish no one asked
 * to hear of never loads it).
 */
export async function announceNewCard(db: AdminDb, cardId: string, slug: unknown, sender?: PushSender): Promise<void> {
  try {
    await Promise.resolve(slug).catch(() => null);
    const run = await pushConnectionCardIn(ctxFor(db, { push: sender ? fromPushSender(sender) : fcmPushGateway() }), cardId);
    if (run.recipients) console.log(`[push] new card ${cardId}`, JSON.stringify(run));
  } catch (e) {
    console.error('[push] new card', cardId, e);
  }
}
