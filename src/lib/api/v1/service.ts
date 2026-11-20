import { publicList } from './publicLists';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { getAccountDeletion } from '@/lib/account/deletion';
import { blankFeedCard, unlistedCard } from '@/lib/cards/blank';
import { ApiFailure } from './http';
import { pageEnd, pageQuery, type PageStart } from './paging';
import { blockedByViewer, blockHides, loadAuthors, toFeedCard } from './present';
import type { FeedPageBody, MeBody } from './schemas';
import { LIST_FIELDS, listCard, withStories } from './summary';

/**
 * v1 business logic on the Admin SDK. The web client does these through
 * Firestore rules; here the server is the one enforcing them, so every rule
 * that guards the client path is checked explicitly (and tested against the
 * emulator in test/emulator/apiV1.emulator.test.ts).
 */

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length ? v : null;
}

/** The signed-in account, with its scheduled deletion if any (read beside the profile). */
export async function getMe(db: Firestore, uid: string): Promise<MeBody> {
  const [snap, deletion] = await Promise.all([db.doc(`users/${uid}`).get(), getAccountDeletion(db, uid)]);
  if (!snap.exists) throw new ApiFailure('not_found', 'This account has no profile yet.');
  const u = snap.data()!;
  return {
    id: uid,
    handle: String(u.handle ?? ''),
    initials: String(u.initials ?? ''),
    accentColor: String(u.accentColor ?? ''),
    bio: str(u.bio),
    avatarUrl: str(u.avatarUrl),
    region: str(u.region),
    primaryLocale: u.primaryLocale === 'en' || u.primaryLocale === 'zh-TW' ? u.primaryLocale : null,
    handleChangedAt: u.handleChangedAt instanceof Timestamp ? u.handleChangedAt.toDate().toISOString() : null,
    deletion: deletion
      ? { requestedAt: deletion.requestedAt.toISOString(), purgeAfter: deletion.purgeAfter.toISOString() }
      : null,
  };
}

/**
 * Whether a card's publishedAt is a real server stamp. The rules only let the
 * server set it now, but a card written before that could carry any value —
 * a string (which Firestore sorts above every timestamp) or a far-future
 * date — to sit on top of the feed; such a card is skipped, never fatal.
 */
export function properlyPublished(at: unknown, now = Date.now()): boolean {
  return at instanceof Timestamp && at.toMillis() <= now + 60 * 60 * 1000;
}

/**
 * Latest public cards, newest first — the web's latest-feed query, minus
 * the named cards of people the viewer blocked (`viewerId` null: a signed-out
 * reader, who has none). Anonymous cards come without their byline, and a
 * block never takes one out (it would name its author, see blockHides).
 * Pages are cut on the *raw* query so a page of blocked authors doesn't end
 * the feed early.
 * Cards are read without their stories (LIST_FIELDS; see ./summary).
 */
export async function getFeed(db: Firestore, viewerId: string | null, limit: number, start?: PageStart): Promise<FeedPageBody> {
  // The page as anyone sees it, kept a few seconds for every reader (./publicLists, B3); the viewer's blocks after it.
  const [page, blocked] = await Promise.all([
    publicList(db, `feed|${limit}|${start?.pageToken ?? ''}|${start?.cursor ?? ''}`, () => publicFeedPage(db, limit, start)),
    viewerId ? blockedByViewer(db, viewerId) : new Set<string>(),
  ]);
  return {
    // A blank card (lib/cards/blank) is left out after the query, as a blocked author's is: the page may run short, never end early.
    cards: page.cards
      .filter((c) => !blockHides(c, blocked))
      .map((c) => toFeedCard(c, page.authors.get(c.authorId)))
      .filter((c) => !blankFeedCard(c)),
    ...page.end,
  };
}

/** A page of the latest public cards before anyone's blocks: listed ones only, their authors and summaries read. */
async function publicFeedPage(db: Firestore, limit: number, start?: PageStart) {
  const snap = await pageQuery(
    db.collection('cards').where('visibility', '==', 'public').where('publishedAt', '!=', null).select(...LIST_FIELDS),
    start,
  )
    .limit(limit)
    .get();
  const cards = snap.docs
    .filter((d) => properlyPublished(d.get('publishedAt')))
    .map((d) => listCard(d.id, d.data()))
    // A card the server marked as not for lists (lib/cards/blank: thin, a placeholder) goes as a blocked author's does.
    .filter((c) => !unlistedCard(c));
  const [authors] = await Promise.all([loadAuthors(db, cards), withStories(db, cards)]);
  // Pages are cut on the *raw* query so a page of blocked authors doesn't end the feed early.
  return { cards, authors, end: pageEnd(snap.docs, limit) };
}
