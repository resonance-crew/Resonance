import { FieldValue, type DocumentData, type Firestore } from 'firebase-admin/firestore';
import { pickPassages } from '@/lib/ai/tasks';
import { ChatIncomplete } from '@/lib/ai/openai';
import { offersPassages, offlinePassages, passagesHash, PASSAGES_TRIES_MAX, verifyPassages, type TapPassageItem } from '@/lib/cards/tapPassages';
import { modelsOffline } from '@/lib/text/translation';

/**
 * Making a card's tap passages (round 27 §P2; lib/cards/tapPassages says
 * what they are): after a publish's response beside indexCard, after an
 * applied edit's beside the summary translations (the same reindex budget),
 * in the daily cron after indexCard for every card it takes, and the
 * backfill — all pinned to hnd1. Reading them is ./tapPassages (no model).
 *
 * Stored on the card, server-only: `tapPassages = { of, items, model, at }`,
 * `of` the story's passagesHash. Fewer than two after the check, or a
 * refusal: `items: []` with `of` — settled, never asked again for this text.
 * A failure (a timeout, a 5xx, no budget) leaves them as they were and marks
 * the card owed (`indexPendingAt`, as lib/recommend/indexOwed markIndexOwed
 * does — written here, since the cron imports this), so the daily cron tries again; after
 * PASSAGES_TRIES_MAX failures for one text (`failed = { of, tries }`) it is
 * left alone until the story changes.
 */

export type TapPassagesResult = 'made' | 'unchanged' | 'none' | 'removed' | 'not-found' | 'over-budget' | 'failed' | 'given-up' | 'moved';

export interface TapPassagesOptions {
  /** Asked just before the model call (an applied edit spends the author's reindex budget); false skips it, owed. */
  mayCall?: () => Promise<boolean>;
  /** The model call (tests; the backfill paces its own). */
  pick?: typeof pickPassages;
  /**
   * Settled before a failure marks the card owed: publishing runs indexCard beside this, and its end clears the mark
   * (indexPendingAt) — a mark written before that would be lost.
   */
  markAfter?: Promise<unknown>;
  /** False: a failure marks nothing (the daily cron, whose own run is the retry). */
  markOwed?: boolean;
}

const FIELDS = ['thoughtCore', 'story', 'publishedAt', 'trashedAt', 'tapPassages'];

const textOf = (data: DocumentData) => ({
  title: typeof data.thoughtCore === 'string' ? data.thoughtCore : '',
  story: typeof data.story === 'string' ? data.story : '',
});

/**
 * Whether the card's story is one to make passages for: offersPassages, the
 * trash aside. A card in the trash keeps them, and has them made for an edit
 * applied there, since restoring it (within 30 days, publishedAt kept) runs
 * nothing that would make them again; while it is in the trash nobody can
 * tap it, and presentTapPassages checks `of` against the story.
 */
const qualifies = (data: DocumentData) => offersPassages({ ...data, trashedAt: null });

/** A failure worth trying again (a timeout, a server error, a cut answer) — a refusal is an answer: none. */
const refused = (e: unknown) => e instanceof ChatIncomplete && e.kind === 'refusal';

/**
 * Make (or remove) card `id`'s tap passages as its story is now. Nothing for
 * a card whose `of` already matches; removes them from a card that may not
 * offer any (unpublished, too short or too complex; the trash keeps them: `qualifies`); writes
 * the pick only while the card still has the story it was made from (a newer
 * save's run wins: 'moved'). Never touches `updatedAt`.
 */
export async function makeTapPassages(db: Firestore, id: string, opts: TapPassagesOptions = {}): Promise<TapPassagesResult> {
  const ref = db.doc(`cards/${id}`);
  const [snap] = await db.getAll(ref, { fieldMask: FIELDS });
  if (!snap?.exists) return 'not-found';
  const data = snap.data()!;
  const stored = data.tapPassages as { of?: unknown; failed?: { of?: unknown; tries?: unknown } } | undefined;
  if (!qualifies(data)) {
    if (stored === undefined) return 'none';
    await ref.update({ tapPassages: FieldValue.delete() });
    return 'removed';
  }
  const { title, story } = textOf(data);
  const of = passagesHash(story);
  if (stored && stored.of === of) return 'unchanged';
  const tries = stored?.failed?.of === of && typeof stored.failed.tries === 'number' ? stored.failed.tries : 0;
  if (tries >= PASSAGES_TRIES_MAX) return 'given-up';

  const owe = async (failed: boolean): Promise<void> => {
    if (failed) await ref.update({ 'tapPassages.failed': { of, tries: tries + 1 } }).catch((e) => console.error('[tapPassages] tries', id, e));
    if (opts.markOwed === false) return;
    await opts.markAfter?.catch(() => {});
    await ref.update({ indexPendingAt: FieldValue.serverTimestamp() }).catch((e: unknown) => {
      // A card deleted meanwhile is owed nothing.
      if ((e as { code?: unknown } | null)?.code !== 5) console.error('[tapPassages] owed', id, e);
    });
  };

  let items: TapPassageItem[];
  let model: string;
  if (!opts.pick && modelsOffline()) {
    items = offlinePassages(story, { title });
    model = 'offline';
  } else {
    if (opts.mayCall && !(await opts.mayCall())) {
      await owe(false);
      return 'over-budget';
    }
    try {
      const answer = await (opts.pick ?? pickPassages)(title, story);
      items = verifyPassages(story, answer.passages, { title });
      model = answer.model;
    } catch (e) {
      if (refused(e)) {
        items = [];
        model = 'refused';
      } else {
        console.error('[tapPassages]', id, e);
        await owe(true);
        return 'failed';
      }
    }
  }
  return db.runTransaction(async (tx) => {
    const [now] = await tx.getAll(ref, { fieldMask: FIELDS });
    if (!now.exists) return 'not-found';
    const d = now.data()!;
    if (!qualifies(d) || passagesHash(textOf(d).story) !== of) return 'moved';
    // Never `updatedAt`: nothing the author wrote changed. The whole value, so a failure count goes with it.
    tx.update(ref, { tapPassages: { of, items, model, at: FieldValue.serverTimestamp() } });
    return items.length ? 'made' : 'none';
  });
}
