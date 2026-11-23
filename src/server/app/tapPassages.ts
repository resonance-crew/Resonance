import { offersPassages, offlinePassages, passagesCurrent, passagesHash, PASSAGES_TRIES_MAX, PASSAGES_VERSION, verifyPassages, type TapPassageItem } from '@/lib/cards/tapPassages';
import type { ServerCtx } from '@/server/ctx';
import type { PassageSource } from '@/server/ports/repos/translations';

// Making a card's tap passages (round 27) as an application service. What
// they are, when they are made and why: the module comment of
// src/lib/api/v1/tapPassagesMake.ts (the facade, which hands in the model).
// No model import here: the caller passes `pick`, so nothing in hkg1 that
// reaches this service reaches the OpenAI client (src/lib/ai/regions.test.ts).

export type TapPassagesResult = 'made' | 'unchanged' | 'none' | 'removed' | 'not-found' | 'over-budget' | 'failed' | 'given-up' | 'moved';

export interface MakeTapPassagesDeps {
  /** The model call: up to three of the story's own passages, and the model's name; `insight` the card's through line. */
  pick: (title: string, story: string, opts?: { insight?: string | null }) => Promise<{ passages: readonly unknown[]; model: string }>;
  /** A failure that is an answer (the model's refusal): settled as none, never tried again for this text. */
  refused: (e: unknown) => boolean;
  /** Against the emulators: no model is asked, the offline pick is used instead. */
  offline: boolean;
  /** Asked just before the model call (an applied edit spends the author's reindex budget); false skips it, owed. */
  mayCall?: () => Promise<boolean>;
  /** Settled before a failure marks the card owed: publishing runs indexCard beside this, and its end clears the mark. */
  markAfter?: Promise<unknown>;
  /** False: a failure marks nothing (the daily cron, whose own run is the retry). */
  markOwed?: boolean;
  /**
   * Waited for (at most `insightWaitMs`) before the card is read: publishing's reading, which writes the through
   * line the pick is guided by (Wave 2 #3a). Past the wait the pick goes on without it.
   */
  insightAfter?: Promise<unknown>;
  insightWaitMs?: number;
}

/** How long a publish's pick waits for the card's reading before it picks without the through line. */
export const INSIGHT_WAIT_MS = 45_000;

/**
 * Whether the card's story is one to make passages for: offersPassages, the
 * trash aside (a card in the trash keeps them, and has them made for an edit
 * applied there: restoring it runs nothing that would make them again).
 */
const qualifies = (s: PassageSource) => offersPassages({ ...s.fields, story: s.story, trashedAt: null });

/** See src/lib/api/v1/tapPassagesMake.ts `makeTapPassages`. */
export async function makeTapPassagesIn(ctx: ServerCtx, id: string, deps: MakeTapPassagesDeps): Promise<TapPassagesResult> {
  if (deps.insightAfter) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      deps.insightAfter.catch(() => {}),
      new Promise((resolve) => (timer = setTimeout(resolve, deps.insightWaitMs ?? INSIGHT_WAIT_MS))),
    ]);
    if (timer) clearTimeout(timer);
  }
  const source = await ctx.data.translations.getPassageSource(id);
  if (!source) return 'not-found';
  const stored = source.tapPassages as { of?: unknown; failed?: { of?: unknown; tries?: unknown } } | undefined;
  if (!qualifies(source)) {
    if (stored === undefined) return 'none';
    await ctx.data.translations.removeTapPassages(id);
    return 'removed';
  }
  const { title, story } = source;
  const of = passagesHash(story);
  // Current: made from this text by this version (Wave 2 #3a: an older version's pick is made again).
  if (passagesCurrent(stored as { of?: unknown; v?: unknown } | undefined, of)) return 'unchanged';
  const tries = stored?.failed?.of === of && typeof stored.failed.tries === 'number' ? stored.failed.tries : 0;
  if (tries >= PASSAGES_TRIES_MAX) return 'given-up';

  const owe = async (failed: boolean): Promise<void> => {
    if (failed) await ctx.data.translations.putTapPassagesFailed(id, { of, tries: tries + 1 }).catch((e) => ctx.log.error('[tapPassages] tries', id, e));
    if (deps.markOwed === false) return;
    await deps.markAfter?.catch(() => {});
    // A card deleted meanwhile is owed nothing ('not-found').
    await ctx.data.recommend.markIndexPending(id).catch((e: unknown) => ctx.log.error('[tapPassages] owed', id, e));
  };

  let items: TapPassageItem[];
  let model: string;
  if (deps.offline) {
    items = offlinePassages(story, { title });
    model = 'offline';
  } else {
    if (deps.mayCall && !(await deps.mayCall())) {
      await owe(false);
      return 'over-budget';
    }
    try {
      const answer = await deps.pick(title, story, { insight: source.insight });
      items = verifyPassages(story, answer.passages, { title });
      model = answer.model;
    } catch (e) {
      if (deps.refused(e)) {
        items = [];
        model = 'refused';
      } else {
        ctx.log.error('[tapPassages]', id, e);
        await owe(true);
        return 'failed';
      }
    }
  }
  return ctx.uow.run(
    async (tx) => {
      const now = await tx.translations.getPassageSource(id);
      if (!now) return 'not-found';
      if (!qualifies(now) || passagesHash(now.story) !== of) return 'moved';
      tx.translations.putTapPassages(id, { of, items: items.map((i) => ({ id: i.id, text: i.text })), model, v: PASSAGES_VERSION });
      return items.length ? 'made' : 'none';
    },
    { label: 'tapPassages' },
  );
}
