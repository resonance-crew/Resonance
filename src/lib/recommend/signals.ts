import { getAdminDb } from '@/lib/db/firestore/admin';
import { readerEventsIn } from '@/server/app/recommendSignals';
import type { AdminDb } from '@/server/infra/firestore/db';
import { recommendData } from '@/server/infra/firestore/repos/recommend';
import { ctxFor } from '@/server/infra/firestore/ctx';
import type { CardEvents } from './weights';

/**
 * What a reader did, read for their own picks (round 26 §A3) — now
 * src/server/app/recommendSignals.ts and the recommend repository
 * (src/server/infra/firestore/repos/recommend.ts). These are the legacy
 * facades, each on the database it is handed (the app's admin one by default).
 */
export { shownCounts } from './stored';

/** Everything `uid` did, by card (./weights CardEvents), and the shown counts their picks keep. */
export function readerEvents(uid: string, db: AdminDb = getAdminDb()): Promise<CardEvents[]> {
  return readerEventsIn(ctxFor(db), uid);
}

/** Whose named public cards the reader is connected with (their connections' uids). */
export function connectionIds(uid: string, db: AdminDb = getAdminDb()): Promise<string[]> {
  return recommendData(db).connectionIds(uid);
}

/** The light author boost's signal: authors of the named originals the reader's published, public, named resonances answer. */
export function getEngagedAuthorIds(uid: string, db: AdminDb = getAdminDb()): Promise<Set<string>> {
  return recommendData(db).engagedAuthorIds(uid);
}

/** Which of these cards are under their author's name, read as they are now (a card gone is left out). */
export function namedCardIds(cardIds: string[], db: AdminDb = getAdminDb()): Promise<Set<string>> {
  return recommendData(db).namedCardIds(cardIds);
}
