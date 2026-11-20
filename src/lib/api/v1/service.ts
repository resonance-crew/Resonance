import * as app from '@/server/app/cardsRead';
import type { AdminDb } from '@/server/infra/firestore/db';
import { ctxFor } from '@/server/infra/firestore/ctx';
import type { PageStart } from '@/server/ports/repos/cards';
import type { FeedPageBody, MeBody } from './schemas';

/**
 * v1 business logic on the Admin SDK — legacy facades over
 * src/server/app/cardsRead.ts. The web client does these through Firestore
 * rules; here the server is the one enforcing them, so every rule that guards
 * the client path is checked explicitly (and tested against the emulator in
 * test/emulator/apiV1.emulator.test.ts).
 */

/** Whether a card's publishedAt is a real server stamp (src/server/domain/cards.ts). */
export { properlyPublished } from '@/server/domain/cards';

/** The signed-in account, with its scheduled deletion if any (read beside the profile). */
export function getMe(db: AdminDb, uid: string): Promise<MeBody> {
  return app.getMe(ctxFor(db), uid);
}

/**
 * Latest public cards, newest first, minus the named cards of people the
 * viewer blocked (`viewerId` null: a signed-out reader, who has none).
 * Anonymous cards come without their byline, and a block never takes one out.
 */
export function getFeed(db: AdminDb, viewerId: string | null, limit: number, start?: PageStart): Promise<FeedPageBody> {
  return app.getFeed(ctxFor(db), viewerId, limit, start);
}
