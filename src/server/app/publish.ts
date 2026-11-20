import { ApiFailure } from '@/lib/api/v1/http';
import { refuseInTrash } from '@/lib/api/v1/inTrash';
import { ANONYMOUS_VISIBILITY_MESSAGE, BLANK_CARD_MESSAGE, anonymousForConnections, blankForReaders } from '@/lib/db/firestore/cardContent';
import { isReservedId } from '@/lib/db/firestore/reservedId';
import type { ServerCtx } from '@/server/ctx';
import { asSnap, reachable } from '@/server/domain/cardsWrite';
import { assignSlugIn } from './slugs';

/** How long publishing waits for the slug (an LLM call) before answering without it. */
export const SLUG_WAIT_MS = 8_000;

export interface PublishResult {
  id: string;
  /** The English URL slug; null when generating it failed or is still under way (the card is live at its id). */
  slug: string | null;
  /** False when the card was already live — publishing again never re-dates it. */
  firstPublish: boolean;
  /** A resonance's bell row on the original author's side, for its push (never returned to the client). */
  notificationId: string | null;
  /** The slug still being made when the answer went out (never returned): the route awaits it after the response. */
  pendingSlug: Promise<string | null> | null;
}

export interface PublishOptions {
  slugWaitMs?: number;
  /** The author's budget, spent beside this (budgetFirst, B7) — awaited before anything is written. */
  spent?: Promise<void>;
}

const LATE = Symbol('late');

/** `p`'s value, or LATE when it takes longer than `ms` (p goes on). */
function within<T>(p: Promise<T>, ms: number): Promise<T | typeof LATE> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<typeof LATE>((resolve) => {
    timer = setTimeout(() => resolve(LATE), ms);
  });
  return Promise.race([p, late]).finally(() => clearTimeout(timer));
}

/**
 * Publish one of your own cards (src/lib/api/v1/publish.ts publishCard says
 * what each step keeps): publishedAt stamped once, its slug made beside the
 * resonance's reach — `slugBase` is the caller's (the model is the route's;
 * the legacy facade defaults it).
 */
export async function publishCardIn(
  ctx: ServerCtx,
  uid: string,
  id: string,
  slugBase: (title: string) => Promise<string>,
  opts: PublishOptions = {},
): Promise<PublishResult> {
  // Someone else's card is as absent as a missing one; so is an id Firestore keeps for itself.
  if (isReservedId(id)) throw new ApiFailure('not_found', 'No such card.');
  const card = await ctx.uow.run(async (tx) => {
    const row = await tx.cards.getCardRow(id);
    // The budget answers before anything is written (budgetFirst).
    await opts.spent;
    // Someone else's card is as absent as a missing one.
    if (!row || row.authorId !== uid) throw new ApiFailure('not_found', 'No such card.');
    // Restored first: published from the trash it would go out private, answering nothing.
    refuseInTrash(asSnap(row));
    if (!String(row.thoughtCore ?? '').trim()) throw new ApiFailure('invalid_request', 'A card needs a title before it is published.');
    // Nothing published for others to read without words in its story (a 私人卡 may be blank).
    if (blankForReaders(row)) throw new ApiFailure('invalid_request', BLANK_CARD_MESSAGE);
    const firstPublish = row.publishedAt == null;
    // Never newly published anonymous and for connections only (a card published so before is left as it is).
    if (firstPublish && anonymousForConnections(row)) throw new ApiFailure('invalid_request', ANONYMOUS_VISIBILITY_MESSAGE);
    tx.cards.publish(id, row, firstPublish);
    return { data: row, firstPublish };
  }, { label: 'publishCard' });

  // Publishing never waits long on — or fails for — the AI step; the id is a working URL.
  // The card as the transaction read it: its title, byline, author and slug are what publishing left them.
  const slugP = assignSlugIn(ctx, id, slugBase, card.data).catch((e) => (ctx.log.error('[api/v1] slug', e), null));
  const resonance = card.firstPublish && typeof card.data.referenceCardId === 'string' && reachable(card.data);
  const [slug, notificationId] = await Promise.all([
    within(slugP, opts.slugWaitMs ?? SLUG_WAIT_MS),
    // Best effort: a resonance that can't reach anyone is still published.
    resonance ? ctx.data.cards.reachResonance(uid, id) : null,
  ]);
  return {
    id,
    slug: slug === LATE ? null : slug,
    firstPublish: card.firstPublish,
    notificationId,
    pendingSlug: slug === LATE ? slugP : null,
  };
}
