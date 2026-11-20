import { INDEX_DEADLINE_MS, readCard, type CardReadingResult } from '@/lib/ai/tasks';
import { ChatIncomplete, embed, embedModel, signatureModel, type TokenUsage } from '@/lib/ai/openai';
import { costOf } from '@/lib/ai/prices';
import { blankCard, thinCard } from '@/lib/cards/blank';
import { runPool } from '@/lib/push/pool';
import { modelsOffline } from '@/lib/text/translation';
import type { CardReading, InsightSignature, Visibility } from '@/lib/db/types';
import { currentEmbedModel, indexContentHash, INDEX_VERSION } from '@/lib/recommend/indexHash';
import { OFFLINE_MODEL, offlineReading, offlineVector } from '@/lib/recommend/offline';
import { formulaPhrases, listedForStrangers, readingParts } from '@/lib/recommend/signature';
import type { ServerCtx } from '@/server/ctx';
import type { CardVisibilityFields, ReadingRow } from '@/server/ports/repos/recommend';
import type { TxRepos } from '@/server/ports/uow';
import type { VectorRecord } from '@/server/ports/vectors';

export interface IndexResult {
  indexed: boolean;
  /**
   * `unchanged`: what the reading reads is what it was made from — no LLM call, the vectors' visibility synced alone.
   * `over-budget`: `mayCall` refused the LLM call; the card keeps its last reading and vectors (their visibility synced).
   * `unlisted`: read, and not for strangers (§A1.7): no vectors.
   * `failed`: the model gave no reading (cut at its cap, or the call failed): recorded, `indexPendingAt` kept for the cron.
   */
  reason?: 'not-published' | 'not-found' | 'unlisted' | 'unchanged' | 'over-budget' | 'blank' | 'thin' | 'failed';
  /** How many vectors (parts × channels) the card has now. */
  channels?: number;
}




/**
 * The visibility a card's vectors carry — the candidate pool's filter: the
 * card's own (public when it names none, as ever; private when it names one
 * no reader knows), and private for one in the trash (which the trash makes
 * private anyway, said here too for any card it left half done).
 */
function vectorVisibility(card: CardVisibilityFields): Visibility {
  if (card.trashed) return 'private';
  const v: unknown = card.visibility ?? 'public';
  return v === 'public' || v === 'connections' ? v : 'private';
}


/**
 * Mark the card's signature with the hash of the text its reading was made
 * from — once its vectors are settled (written, or removed when unlisted),
 * so a card whose vectors never landed is read again — and clear the owed
 * reading. In a transaction, and only while the card still holds that text
 * and that through line: a newer save's run may have replaced them meanwhile.
 */
async function markIndexed(ctx: ServerCtx, cardId: string, hash: string, signature: InsightSignature): Promise<void> {
  await ctx.uow.run(
    async (tx) => {
      const now = await tx.recommend.getCardText(cardId);
      if (!now) return;
      if (indexContentHash(String(now.thoughtCore ?? ''), String(now.story ?? '')) !== hash) return;
      const stored = now.signature;
      if ((stored?.coreInsight ?? '') !== (signature.coreInsight ?? '') || (stored?.placeholder === true) !== (signature.placeholder === true)) return;
      tx.recommend.patchCardIndexed(cardId, hash);
    },
    { label: 'index: mark indexed' },
  );
}

/**
 * Stamp `thin` (lib/cards/blank) as the card's words are now, in a
 * transaction: for a card the save didn't stamp — published before it did,
 * or changed by an older build's client write, which the rules let take no
 * `thin` of its own. The saves (publish, an applied edit) stamp it in their
 * own write, so this runs only when what indexing read disagrees.
 */
async function syncThin(ctx: ServerCtx, cardId: string): Promise<void> {
  await ctx.uow.run(
    async (tx) => {
      const now = await tx.recommend.getCardText(cardId);
      if (!now) return;
      const thin = thinCard({ thoughtCore: now.thoughtCore as string, story: now.story as string });
      if (now.thin !== thin) tx.recommend.patchCardThin(cardId, thin);
    },
    { label: 'index: sync thin' },
  );
}

const addUsage = (a: TokenUsage, b: TokenUsage): TokenUsage => ({ input: a.input + b.input, output: a.output + b.output, reasoning: a.reasoning + b.reasoning });

export interface IndexOptions {
  /** Read it again even when the text is unchanged (the backfill's --all, the cron's failed and templated ones). */
  force?: boolean;
  /** Asked just before the LLM call: false keeps the last reading (the caller's budget). */
  mayCall?: () => Promise<boolean>;
  /** When everything must be done (ms since epoch); INDEX_DEADLINE_MS from the start otherwise. */
  deadline?: number;
  /**
   * Ask once more when the reading uses a formula phrasing (§A1.5) — only
   * the daily cron and the backfill do, never a publish (D4: one deadline).
   */
  rewrite?: boolean;
  /** Told what the calls spent (the cron and the backfill print it). */
  onUsage?: (usage: TokenUsage & { embed: number }) => void;
}

/**
 * The write-time pipeline, run once per published card (idempotent): read
 * the card (one LLM call, lib/ai/tasks readCard) → keep the reading in the
 * server-only `cardSignatures/{cardId}` and only its through line, its
 * placeholder flag and the hash on the card → if the card is listed for
 * strangers, embed each part (lib/recommend/signature readingParts) and make
 * them the card's vectors; otherwise remove its vectors, so it leaves the
 * candidate pool.
 *
 * Server-only (admin SDK + OpenAI key). Under the emulators no model is asked
 * (`modelsOffline`): a fixed fake reading and vectors derived from the card's
 * id stand in (./offline).
 *
 * A save that leaves what the reading reads as it was (tags, a cover, the
 * byline) makes nothing again: the signature keeps the hash of the text it
 * was made from (`signature.contentHash`, see indexContentHash), and an
 * unchanged one skips the LLM and the embeddings (`reason: 'unchanged'`;
 * `force` makes it all the same). `mayCall` is asked just before the LLM
 * call. Before that call the card is marked `indexPendingAt`, cleared once
 * its vectors are settled: a run cut short (a deadline, a function's end)
 * leaves the mark for the daily cron (/api/cron/index-cards). Either way the
 * card's vectors first take its visibility as this run reads it, and follow
 * a change that lands while it runs.
 *
 * A card in the trash — before this starts, or moved there while the LLM
 * runs — is indexed all the same, its vectors private. Restoring it only
 * gives its vectors their visibility back (restoreCard asks no LLM).
 */
export async function indexCardIn(ctx: ServerCtx, cardId: string, opts: IndexOptions = {}): Promise<IndexResult> {
  const repo = ctx.data.recommend;
  const deadline = AbortSignal.timeout(Math.max(1, (opts.deadline ?? Date.now() + INDEX_DEADLINE_MS) - Date.now()));
  const data = await repo.getCardForIndex(cardId);
  if (!data) return { indexed: false, reason: 'not-found' };

  // Drafts carry no published signal yet — nothing to recommend.
  if (data.publishedAt == null) return { indexed: false, reason: 'not-published' };

  const store = ctx.vectors;
  /** The card's visibility as it is now, read again — null once it is gone. */
  const reread = async () => {
    const now = await repo.getCardVisibility(cardId);
    return now ? vectorVisibility(now) : null;
  };
  const settleOwed = async () => {
    if (data.indexPending) await repo.clearIndexPending(cardId);
  };

  // Whatever vectors the card has carry its visibility as read just now, before anything else runs.
  const first = vectorVisibility(data);
  await store.setVisibility(cardId, first);

  const title = String(data.thoughtCore ?? '');
  const story = String(data.story ?? '');
  // A blank card (lib/cards/blank) is no one's candidate: no LLM call, and any vectors an earlier version had go.
  if (blankCard({ thoughtCore: title, story })) {
    await store.deleteByCard(cardId);
    await settleOwed();
    return { indexed: false, reason: 'blank' };
  }
  // A thin card (lib/cards/blank) is no list's either: no LLM call for it, and no vectors.
  const thin = thinCard({ thoughtCore: title, story });
  if (data.thin !== thin) await syncThin(ctx, cardId);
  if (thin) {
    await store.deleteByCard(cardId);
    await settleOwed();
    return { indexed: false, reason: 'thin' };
  }
  const hash = indexContentHash(title, story);
  if (!opts.force && data.contentHash === hash) {
    // A change that landed between that read and the write: follow it.
    const settled = await reread();
    if (settled === null) {
      await store.deleteByCard(cardId);
      return { indexed: false, reason: 'not-found' };
    }
    if (settled !== first) await store.setVisibility(cardId, settled);
    await settleOwed();
    return { indexed: false, reason: 'unchanged' };
  }
  if (opts.mayCall && !(await opts.mayCall())) return { indexed: false, reason: 'over-budget' };

  // Owed until its vectors are settled: a run cut short leaves the card for the daily cron.
  if ((await repo.markIndexPending(cardId)) === 'not-found') return { indexed: false, reason: 'not-found' };

  const offline = modelsOffline();
  let usage: TokenUsage = { input: 0, output: 0, reasoning: 0 };
  const count = (u: TokenUsage) => (usage = addUsage(usage, u));
  /**
   * Write the card's reading only while the card is there (§A1.6: deleted
   * with the card), in a transaction that reads the card first: deleteCard's
   * transaction deletes the card and its reading together, so the two run one
   * after the other, and a card deleted for good while the models ran (up to
   * INDEX_DEADLINE_MS) leaves no reading behind. False when the card is gone.
   */
  const writeReading = (write: (tx: TxRepos) => void) =>
    ctx.uow.run(
      async (tx) => {
        if (!(await tx.recommend.cardExists(cardId))) return false;
        write(tx);
        return true;
      },
      { label: 'index: keep the reading' },
    );
  let result: CardReadingResult;
  /** Asked once more for its formula phrasings (the cron asks no third time while the text is the same). */
  let rewritten = false;
  try {
    result = offline
      ? { reading: offlineReading(cardId, title, story), model: OFFLINE_MODEL, error: null }
      : await readCard({ title, story }, { signal: deadline, onUsage: count });
    // A reading in formula phrasings is asked once more — by the cron and the backfill only (§A1.5).
    if (!offline && opts.rewrite && result.error === null) {
      const found = formulaPhrases(result.reading, title);
      if (found.length) {
        result = await readCard({ title, story }, { signal: deadline, onUsage: count, avoid: found });
        rewritten = true;
      }
    }
  } catch (e) {
    // No reading: what went wrong is kept beside the last good one, and the card stays owed.
    const error = e instanceof ChatIncomplete ? e.kind : 'failed';
    await writeReading((tx) => tx.recommend.mergeReadingFailure(cardId, { authorId: String(data.authorId ?? ''), error, usage })).catch((err) =>
      ctx.log.error('[index] recording a failed reading', cardId, err),
    );
    opts.onUsage?.({ ...usage, embed: 0 });
    if (e instanceof ChatIncomplete) return { indexed: false, reason: 'failed' };
    throw e;
  }

  const reading: CardReading = result.reading;
  const listed = listedForStrangers(reading);
  const templated = formulaPhrases(reading, title).length > 0;
  const embeddingModel = currentEmbedModel();
  const signature: InsightSignature = { coreInsight: reading.throughLine, placeholder: reading.placeholder };

  // The reading, server-only; on the card only what its pages and lists need.
  // Not `updatedAt`: indexing isn't an edit, and a later updatedAt would
  // retire the card's stored list summary (lib/api/v1/summary). An update,
  // never a merge, on the card: one deleted while the LLM ran stays deleted.
  // The whole `signature` map: the older recipe's fields and an earlier
  // hash go with it.
  if ((await repo.putCardSignature(cardId, signature)) === 'not-found') return { indexed: false, reason: 'not-found' };
  /** The reading kept server-only — false when the card was deleted meanwhile (no reading is left for it). */
  const keepReading = (embedTokens: number) => {
    const row: ReadingRow = {
        authorId: String(data.authorId ?? ''),
        version: INDEX_VERSION,
        model: result.model,
        embedModel: embeddingModel,
        ...reading,
        listedForStrangers: listed,
        templated,
        rewritten,
        error: result.error,
        usage: { ...usage, embed: embedTokens },
    };
    return writeReading((tx) => tx.recommend.putReading(cardId, row));
  };

  if (!listed) {
    // Not for strangers (or edited down): make sure it isn't lingering in the
    // candidate pool from a previous, listed version.
    await store.deleteByCard(cardId);
    const kept = await keepReading(0);
    if (kept) await markIndexed(ctx, cardId, hash, signature);
    opts.onUsage?.({ ...usage, embed: 0 });
    return { indexed: false, reason: kept ? 'unlisted' : 'not-found' };
  }

  const parts = readingParts(reading);
  let embedTokens = 0;
  const vectors = offline
    ? parts.map((p) => offlineVector(cardId, p))
    : await embed(
        parts.map((p) => p.text),
        { signal: deadline, onUsage: (u) => (embedTokens += u.input) },
      );
  const kept = await keepReading(embedTokens);
  opts.onUsage?.({ ...usage, embed: embedTokens });
  // Deleted while it was embedded: its reading went with it, and its vectors (deleteCard removes them).
  if (!kept) return { indexed: false, reason: 'not-found' };

  // The card as it is now, after the LLM calls: one deleted meanwhile gets
  // no vectors, and one whose visibility changed — moved to the trash or
  // back, made private or public — carries the new one.
  const visibility = await reread();
  if (visibility === null) return { indexed: false, reason: 'not-found' };

  const records: VectorRecord[] = parts.map((p, i) => ({
    cardId,
    authorId: String(data.authorId),
    visibility,
    channel: p.channel,
    part: p.part,
    vector: vectors[i] ?? [],
    embedModel: embeddingModel,
    insightScore: reading.insightScore,
    coreInsight: p.insight,
    situation: p.situation,
    lifeDomain: reading.lifeDomain,
    span: p.span,
  }));

  if (records.length) await store.upsert(records);
  else await store.deleteByCard(cardId);

  // A change that landed between that read and this write (a trash, a
  // restore, a PATCH, a delete) set the visibility of — or deleted — vectors
  // that weren't there yet: read once more, and follow it.
  const settled = await reread();
  if (settled === null) {
    await store.deleteByCard(cardId);
    return { indexed: false, reason: 'not-found' };
  }
  if (settled !== visibility) await store.setVisibility(cardId, settled);
  await markIndexed(ctx, cardId, hash, signature);
  return { indexed: true, channels: records.length };
}

/**
 * The daily re-reading (round 26 §A1.8, `/api/cron/index-cards`): the cards
 * whose reading is owed — an applied edit (`indexPendingAt`, which applying
 * sets rather than reading the whole story again at once), a reading cut
 * short or failed after a publish (indexCard leaves the mark) — and the
 * readings in formula phrasings not yet asked again (`templated`, §A1.5: the
 * one rewrite happens here and in the backfill, never on publish). At most
 * `limit` readings a run (each one LLM call, two for a rewrite); a card whose
 * text turns out unchanged costs no call and no place. Logs tokens and cost.
 */

/** Readings a run asks for at most. */
export const INDEX_OWED_LIMIT = 20;
/** Owed cards a run looks at (an unchanged one is settled without a call). */
const EXAMINED_MAX = 200;
/** How many cards are read at once. */
export const INDEX_OWED_CONCURRENCY = 3;

/** The results that asked no model. */
const NO_CALL = new Set<IndexResult['reason']>(['unchanged', 'blank', 'thin', 'not-published', 'not-found', 'over-budget']);

export interface IndexOwedRun {
  examined: number;
  read: number;
  outcomes: Record<string, number>;
  /** Cards left for the next run (the limit or the deadline). */
  left: number;
  tokens: { input: number; output: number; reasoning: number; embed: number };
  /** Dollars, or null when a model has no price (lib/ai/prices). */
  cost: number | null;
}

export async function indexOwedIn(ctx: ServerCtx, opts: { limit?: number; deadline?: number; now?: () => number } = {}): Promise<IndexOwedRun> {
  const limit = opts.limit ?? INDEX_OWED_LIMIT;
  const now = opts.now ?? Date.now;
  const [pending, templated] = await Promise.all([ctx.data.recommend.listIndexPending(EXAMINED_MAX), ctx.data.recommend.listTemplated(EXAMINED_MAX)]);
  const owed = [
    ...pending.map((id) => ({ id, rewrite: false })),
    ...templated.filter((d) => !d.rewritten).map((d) => ({ id: d.cardId, rewrite: true })),
  ].filter((x, i, all) => all.findIndex((y) => y.id === x.id) === i);
  const run: IndexOwedRun = { examined: 0, read: 0, outcomes: {}, left: 0, tokens: { input: 0, output: 0, reasoning: 0, embed: 0 }, cost: 0 };
  // Three at a time (B16): each reading takes 20–60 s, and one after another twenty overran the cron's 300 s.
  // None is started past the deadline, nor once those read and still reading could reach the limit.
  let reading = 0;
  const { notStarted } = await runPool(
    owed,
    INDEX_OWED_CONCURRENCY,
    async (card) => {
      run.examined++;
      reading++;
      try {
        const result = await indexCardIn(ctx, card.id, {
          // A templated reading's text is unchanged: asked again all the same, once.
          force: card.rewrite,
          rewrite: true,
          onUsage: (u) => {
            run.tokens.input += u.input;
            run.tokens.output += u.output;
            run.tokens.reasoning += u.reasoning;
            run.tokens.embed += u.embed;
          },
        });
        const outcome = result.reason ?? 'indexed';
        run.outcomes[outcome] = (run.outcomes[outcome] ?? 0) + 1;
        if (!NO_CALL.has(result.reason)) run.read++;
      } catch (e) {
        run.read++;
        run.outcomes.error = (run.outcomes.error ?? 0) + 1;
        ctx.log.error('[index-cards]', card.id, e);
      } finally {
        reading--;
      }
    },
    { tag: '[index-cards]', stop: () => run.read + reading >= limit || (opts.deadline !== undefined && now() >= opts.deadline) },
  );
  run.left = notStarted;
  const readCost = costOf(signatureModel(), run.tokens);
  const embedding = costOf(embedModel(), { input: run.tokens.embed, output: 0 });
  run.cost = readCost === null || embedding === null ? null : readCost + embedding;
  return run;
}

/**
 * Mark a card's reading owed (an applied edit): the daily run reads it again.
 * An update, so a card deleted meanwhile stays deleted; one gone is no error.
 */
export async function markIndexOwedIn(ctx: ServerCtx, cardId: string): Promise<void> {
  await ctx.data.recommend.markIndexPending(cardId);
}
