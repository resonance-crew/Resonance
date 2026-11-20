import type { Card, User } from '../types';
import type { AdminDb } from '@/server/infra/firestore/db';
import { ctxFor } from '@/server/infra/firestore/ctx';

// The landing page's read lives in the cards repository
// (src/server/infra/firestore/repos/cards.ts, `ctx.data.cards.latestForLanding`);
// this path stays for its importers.
export { LANDING_CARD_FIELDS } from '@/server/infra/firestore/repos/cards';

/**
 * The landing page's newest public cards and their authors' bylines, read
 * as the page serializes them into its cached, public HTML: no author for an
 * anonymous card (not even its uid), no recommendation internals, and of
 * each author only their byline.
 */
export function latestForLanding(db: AdminDb, limit: number): Promise<{ cards: Card[]; authors: Record<string, User> }> {
  return ctxFor(db).data.cards.latestForLanding(limit);
}
