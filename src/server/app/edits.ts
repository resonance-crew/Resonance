import { cardPagePaths, landingPagePaths } from '@/lib/api/revalidate';
import { ApiFailure } from '@/lib/api/v1/http';
import { refuseInTrash } from '@/lib/api/v1/inTrash';
import { visibilityOf } from '@/lib/api/v1/present';
import { ANONYMOUS_VISIBILITY_MESSAGE, BLANK_CARD_MESSAGE, anonymousForConnections, blankForReaders, cardContentProblem, editedAudience } from '@/lib/db/firestore/cardContent';
import { isReservedId } from '@/lib/db/firestore/reservedId';
import type { Visibility } from '@/lib/db/types';
import type { CoverFrame } from '@/lib/images/coverFrame';
import type { ServerCtx } from '@/server/ctx';
import { asSnap, becameReachable, hiddenResonance } from '@/server/domain/cardsWrite';
import { mediaKeyFor } from '@/server/domain/media';
import type { EditedContent } from '@/server/ports/repos/cards';
import { signalConnections } from './realtime';

export interface ApplyEditResult {
  id: string;
  /** Where the card lives: its English slug, or null (it is served at its id). */
  slug: string | null;
  /** False when there was no pending edit to apply (a retry after success lands here). */
  applied: boolean;
  /** The card and landing pages the revision made stale, for the route to revalidate (never returned; never the profile). */
  stale: string[];
  /** The revision made a published resonance reachable: the route reaches its original after the response (never returned). */
  reaches: boolean;
  /** The card's visibility when the revision changed it, else null: the route moves its vectors before answering (never returned). */
  movedTo: Visibility | null;
}

/**
 * Apply your pending edit to a published card in one transaction (src/lib/api/v1/edits.ts
 * applyCardEdit says why each check is there): only the editable fields are copied, each
 * checked for its type and the card's limits; the buffer is deleted; applying twice is harmless.
 */
export async function applyCardEditIn(ctx: ServerCtx, uid: string, id: string): Promise<ApplyEditResult> {
  if (isReservedId(id)) throw new ApiFailure('not_found', 'No such card.');
  let ended: readonly string[] = [];
  const result = await ctx.uow.run(async (tx) => {
    ended = [];
    const [stored, e] = await Promise.all([tx.cards.getCardRow(id), tx.cards.getEditRow(id)]);
    // Someone else's card is as absent as a missing one.
    if (!stored || stored.authorId !== uid) throw new ApiFailure('not_found', 'No such card.');
    // Restored first: its working copy waits (the restore sets its visibility straight).
    refuseInTrash(asSnap(stored));
    if (stored.publishedAt == null) {
      throw new ApiFailure('invalid_request', 'A draft saves as you write; publish it instead.');
    }
    const slug = typeof stored.slug === 'string' ? stored.slug : null;
    if (!e) return { id, slug, applied: false, stale: [], reaches: false, movedTo: null };

    // A copy naming someone else (left under an id another card took) is not this author's to apply.
    if (typeof e.authorId === 'string' && e.authorId !== uid) throw new ApiFailure('not_found', 'No such card.');
    const thoughtCore = typeof e.thoughtCore === 'string' ? e.thoughtCore : '';
    if (!thoughtCore.trim()) throw new ApiFailure('invalid_request', 'A card needs a title.');
    const story = typeof e.story === 'string' ? e.story : '';
    const content: EditedContent = {
      thoughtCore,
      story,
      tags: Array.isArray(e.tags) ? e.tags.filter((t): t is string => typeof t === 'string') : [],
      accentHue: typeof e.accentHue === 'number' ? e.accentHue : null,
      media: isMedia(e.media) ? pickMedia(ctx, e.media) : null,
    };
    // The buffer may predate the rules' limits: the server copies nothing a client couldn't write.
    const keptUrl = asSnap(stored).get('media.url');
    const problem = cardContentProblem(content, { keptMediaUrl: typeof keptUrl === 'string' ? keptUrl : null });
    if (problem) throw new ApiFailure('invalid_request', 'The edit does not fit a card.', [{ path: problem, message: 'Out of bounds.' }]);
    const audience = editedAudience(e, stored);
    const fields = { ...content, ...audience };
    // Never into anonymous and for connections only; a card already that way stays editable in everything else.
    const moved = audience.visibility !== stored.visibility || audience.anonymous !== (stored.anonymous === true);
    if (moved && anonymousForConnections(fields)) throw new ApiFailure('invalid_request', ANONYMOUS_VISIBILITY_MESSAGE);
    // Never emptied (or shown again empty) while others read it; a card already so stays editable.
    if (blankForReaders(fields) && !blankForReaders(stored)) throw new ApiFailure('invalid_request', BLANK_CARD_MESSAGE);
    const after = { ...stored, visibility: audience.visibility, anonymous: audience.anonymous };
    // Read before anything is written: what leaving a published resonance hidden takes back.
    if (hiddenResonance(after)) {
      const back = await tx.cards.readTakeBack(uid, id);
      tx.cards.takeBack(back);
      ended = back.ends;
    }
    tx.cards.applyEdit(id, content, audience);
    // Its page under both names, and the landing page if it was or is public there — never its author's profile.
    const stale = [...cardPagePaths({ id, slug }), ...landingPagePaths(stored, { visibility: audience.visibility, publishedAt: stored.publishedAt })];
    const reaches = becameReachable(stored, after);
    const movedTo = audience.visibility !== stored.visibility ? visibilityOf(audience.visibility) : null;
    return { id, slug, applied: true, stale, reaches, movedTo };
  }, { label: 'applyCardEdit' });
  // After the commit: a connection the take-back ended changed both people's lists.
  await signalConnections(ctx, uid, ended);
  return result;
}

function isMedia(m: unknown): m is { type: string; url: string; label?: unknown; frame?: unknown } {
  return !!m && typeof m === 'object' && typeof (m as { url?: unknown }).url === 'string' && typeof (m as { type?: unknown }).type === 'string';
}

/**
 * A cover's own fields only (the buffer could hold anything beside them) — its frame too, whatever it holds
 * (cardContentProblem judges it) — and its storage key, made again from its URL (never the buffer's: an older
 * client's copy keeps none, or one that no longer goes with the URL).
 */
function pickMedia(ctx: ServerCtx, m: { type: string; url: string; label?: unknown; frame?: unknown }): EditedContent['media'] {
  const key = mediaKeyFor(ctx.media, m.url);
  return {
    type: m.type,
    url: m.url,
    ...(key ? { key } : {}),
    ...(typeof m.label === 'string' ? { label: m.label } : {}),
    ...(m.frame != null ? { frame: m.frame as CoverFrame } : {}),
  };
}
