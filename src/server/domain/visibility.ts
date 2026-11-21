import { trashExpired } from '@/lib/cards/trash';
import type { Card } from '@/lib/db/types';

/**
 * Who may read a card, as firestore.rules decide it for the web — pure, so
 * the services ask it of whatever their repositories read (the Admin SDK
 * skips the rules, so the server asks these itself). Re-exported by
 * src/lib/api/v1/present.ts for its importers.
 */

/** When a card went into the trash, as a valid date; null for a card that isn't there. */
export function trashedAtOf(c: Pick<Card, 'trashedAt'>): Date | null {
  const at = c.trashedAt;
  return at instanceof Date && !Number.isNaN(at.getTime()) ? at : null;
}

/**
 * Whether the viewer's blocks (`blocked`) keep a card from them: one under the
 * name of someone they blocked. Never an anonymous card — the viewer writes
 * their own block list, so a card that vanished when they blocked someone
 * would tell them who wrote it. A block hides people and their named cards;
 * an anonymous card is there for everyone who may read it.
 */
export function blockHides(card: Pick<Card, 'authorId' | 'anonymous'>, blocked: ReadonlySet<string>): boolean {
  return card.anonymous !== true && blocked.has(card.authorId);
}

/** What cardVisible (and canView) decide a card's readers by: a card read for that alone needs only these. */
export const CARD_VISIBILITY_FIELDS = ['authorId', 'publishedAt', 'visibility', 'anonymous', 'trashedAt'] as const;

/**
 * firestore.rules `cardOpen` once the viewer's connection to the author is
 * known — `isConnected` is only asked for a published, named connections
 * card. A transaction that read the connection itself asks this (canView
 * reads it). An anonymous card for connections only (none is made any more:
 * an anonymous card is public or private) is its author's alone: whether a
 * reader could open it would turn on being connected to its author.
 */
export function cardVisible(card: Card, viewerId: string, isConnected: (authorId: string) => boolean): boolean {
  const trashed = trashedAtOf(card);
  // A card in the trash is its author's alone — and theirs only until its
  // purge date, even before the daily cron reaches it (lib/cards/trash).
  // Private while there (the trash makes it so), it would be absent to
  // everyone else anyway: this backs that up.
  if (card.authorId === viewerId) return !trashed || !trashExpired(trashed);
  if (trashed || card.trashedAt != null) return false;
  // A draft is its author's alone, whatever visibility it will be published with.
  if (!card.publishedAt) return false;
  if (card.visibility === 'public') return true;
  return card.visibility === 'connections' && card.anonymous !== true && isConnected(card.authorId);
}

/** Whether cardVisible would ask about the viewer's connection to this card's author. */
export const needsConnection = (card: Card, viewerId: string) =>
  card.authorId !== viewerId && !!card.publishedAt && card.visibility === 'connections' && card.anonymous !== true;

/** A card in the trash (any stored `trashedAt`, however odd: such a card is no list's but the trash shelf's). */
export const inTrash = (c: Pick<Card, 'trashedAt'>) => c.trashedAt != null;
