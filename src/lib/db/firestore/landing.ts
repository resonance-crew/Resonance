import type { Firestore } from 'firebase-admin/firestore';
import { blankCard } from '@/lib/cards/blank';
import type { Card, User } from '../types';
import { mapCard, mapUser } from './mapper';
import { isReservedId } from './reservedId';

/**
 * What the landing page's grid draws of a card — and what a click on one
 * seeds its card page with (usePrefillCard), so its story comes along. Read
 * with this projection: never the recommender's signature, nor the
 * server-only fields (link-preview bookkeeping, list summaries, the trash's
 * own record), all of which would otherwise be serialized into the page's
 * cached, public HTML.
 */
export const LANDING_CARD_FIELDS = [
  'authorId',
  'slug',
  'thoughtCore',
  'story',
  'tags',
  'media',
  'originalLocale',
  'translations',
  'visibility',
  'referenceCardId',
  'publishedAt',
  'readCount',
  'resonanceCount',
  'inviteCount',
  'accentHue',
  'anonymous',
  'linkPreviews',
  'trashedAt',
] as const;

/** How many cards past `limit` the landing page reads, to stand in for blank ones. */
const LANDING_SPARE = 3;

/** Of each author, only what a card's byline needs. */
const BYLINE_FIELDS = ['handle', 'initials', 'avatarUrl', 'avatarSeed', 'accentColor', 'primaryLocale', 'verified'];

/**
 * The landing page's newest public cards and their authors' bylines, read
 * as the page serializes them into its cached, public HTML: no author for an
 * anonymous card (not even its uid), no recommendation internals, and of
 * each author only their byline. The authors in one batched read.
 */
export async function latestForLanding(db: Firestore, limit: number): Promise<{ cards: Card[]; authors: Record<string, User> }> {
  const snap = await db
    .collection('cards')
    .where('visibility', '==', 'public')
    .where('publishedAt', '!=', null)
    .orderBy('publishedAt', 'desc')
    .select(...LANDING_CARD_FIELDS)
    // A few more than it shows, so a blank card (lib/cards/blank) left out doesn't leave a gap.
    .limit(limit + LANDING_SPARE)
    .get();
  const cards = snap.docs
    .map((d) => mapCard(d.id, d.data()))
    .filter((card) => !blankCard(card))
    .slice(0, limit)
    .map((card) => (card.anonymous ? { ...card, authorId: '' } : card));
  const authorIds = [...new Set(cards.map((c) => c.authorId))].filter((id) => id && !id.includes('/') && !isReservedId(id));
  const profiles = authorIds.length ? await db.getAll(...authorIds.map((id) => db.doc(`users/${id}`)), { fieldMask: BYLINE_FIELDS }) : [];
  const authors: Record<string, User> = {};
  for (const p of profiles) if (p.exists) authors[p.id] = byline(mapUser(p.id, p.data()!));
  return { cards, authors };
}

/** An author as a card's byline needs them. */
function byline(u: User): User {
  return {
    id: u.id,
    handle: u.handle,
    initials: u.initials,
    avatarUrl: u.avatarUrl,
    avatarSeed: u.avatarSeed,
    accentColor: u.accentColor,
    region: '',
    primaryLocale: u.primaryLocale,
    autoTranslateTo: [],
    verified: u.verified,
    phoneHash: '',
    joinedAt: new Date(0),
    handleChangedAt: new Date(0),
  };
}
