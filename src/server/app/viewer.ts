import type { Card } from '@/lib/db/types';
import { docIdOk } from '@/server/domain/cards';
import { cardVisible, needsConnection } from '@/server/domain/visibility';
import type { PersonRow, UsersData } from '@/server/ports/repos/users';

/**
 * What the server asks of the viewer before it shows a card or a person:
 * firestore.rules `cardVisible` with the viewer's connections read through
 * the users repository, and the bylines a list draws.
 */

/** What toAuthor reads of a profile: the field mask of every profile a list reads (authorsOf). */
export const AUTHOR_FIELDS = ['handle', 'initials', 'accentColor', 'avatarUrl', 'avatarSeed', 'verified', 'region'] as const;

/** firestore.rules `cardVisible`, for a server that bypasses the rules. */
export async function canView(users: UsersData, card: Card, viewerId: string): Promise<boolean> {
  const isConnected = needsConnection(card, viewerId) && (await users.connected(viewerId, card.authorId));
  return cardVisible(card, viewerId, () => isConnected);
}

/**
 * The cards the viewer may read, in order (canView for a list): whether the
 * viewer is connected to each connections-only author is read once per
 * author, in one batch.
 */
export async function visibleTo<C extends Card>(users: UsersData, viewerId: string, cards: C[]): Promise<C[]> {
  const authors = [...new Set(cards.filter((c) => needsConnection(c, viewerId)).map((c) => c.authorId))].filter(docIdOk);
  const linked = authors.length ? await users.connectedAmong(viewerId, authors) : new Set<string>();
  return cards.filter((c) => cardVisible(c, viewerId, (a) => linked.has(a)));
}

/** Profiles of the given (non-anonymous) authors, by id — one batched read of only what a byline draws (B17). */
export async function authorsOf(users: UsersData, cards: Pick<Card, 'anonymous' | 'authorId'>[]): Promise<Map<string, PersonRow>> {
  const ids = [...new Set(cards.filter((c) => !c.anonymous).map((c) => c.authorId))].filter(docIdOk);
  if (!ids.length) return new Map();
  return users.rowsOf(ids, AUTHOR_FIELDS);
}
