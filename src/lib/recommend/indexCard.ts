import { createHash } from 'node:crypto';
import { FieldValue, type DocumentData, type DocumentReference } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { INDEX_DEADLINE_MS, readCard, readingText, type CardReadingResult } from '@/lib/ai/tasks';
import { ChatIncomplete, embed, embedModel, signatureModel, type TokenUsage } from '@/lib/ai/openai';
import { blankCard, thinCard } from '@/lib/cards/blank';
import { modelsOffline } from '@/lib/text/translation';
import type { CardReading, InsightSignature, Visibility } from '@/lib/db/types';
import { formulaPhrases, listedForStrangers, readingParts } from './signature';
import { OFFLINE_MODEL, offlineReading, offlineVector } from './offline';
import { CARD_SIGNATURES } from './collections';
import { getVectorStore } from './vectorStore';
import type { VectorRecord } from './vectorStore/types';

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

/** The server-only readings (round 26 §A1.6): `cardSignatures/{cardId}`. */
export { CARD_SIGNATURES };
/** The recipe's version: bumped when the reading's or the vectors' recipe changes, so every card is read again. */
export const INDEX_VERSION = 3;

/** What indexing reads of the card first: whether it is published, what the reading reads, whose it is, who may read it. */
const INDEX_FIELDS = ['publishedAt', 'thoughtCore', 'story', 'authorId', 'visibility', 'trashedAt', 'thin', 'signature.contentHash', 'indexPendingAt'];
/** What the vectors' visibility is decided by (vectorVisibility), for the reads that only follow it. */
const VISIBILITY_FIELDS = ['visibility', 'trashedAt'];

/** Firestore's NOT_FOUND: an update of a document that is gone (deleted while the LLM ran). */
const isNotFound = (e: unknown) => (e as { code?: unknown } | null)?.code === 5;

/** The embedding model the index holds now: the emulators' stand-in under them (§A1.9). */
export function currentEmbedModel(): string {
  return modelsOffline() ? OFFLINE_MODEL : embedModel();
}
/** The reading model the index holds now. */
function currentReadingModel(): string {
  return modelsOffline() ? OFFLINE_MODEL : signatureModel();
}

/**
 * The visibility a card's vectors carry — the candidate pool's filter: the
 * card's own (public when it names none, as ever; private when it names one
 * no reader knows), and private for one in the trash (which the trash makes
 * private anyway, said here too for any card it left half done).
 */
function vectorVisibility(card: DocumentData): Visibility {
  if (card.trashedAt != null) return 'private';
  const v: unknown = card.visibility ?? 'public';
  return v === 'public' || v === 'connections' ? v : 'private';
}

/**
 * What a card's reading and vectors were made from: the text the reading
 * reads (readingText), with the models and the recipe's version — a card
 * whose hash is unchanged would get the same reading and vectors again.
 */
export function indexContentHash(title: string, story: string): string {
  return createHash('sha256')
    .update(JSON.stringify([INDEX_VERSION, currentReadingModel(), currentEmbedModel(), readingText({ title, story })]))
    .digest('base64url');
}

/**
 * Mark the card's signature with the hash of the text its reading was made
 * from — once its vectors are settled (written, or removed when unlisted),
 * so a card whose vectors never landed is read again — and clear the owed
 * reading. In a transaction, and only while the card still holds that text
 * and that through line: a newer save's run may have replaced them meanwhile.
 */
async function markIndexed(ref: DocumentReference, hash: string, signature: InsightSignature): Promise<void> {
  await ref.firestore.runTransaction(async (tx) => {
    const [now] = await tx.getAll(ref, { fieldMask: ['thoughtCore', 'story', 'signature'] });
    if (!now.exists) return;
    if (indexContentHash(String(now.get('thoughtCore') ?? ''), String(now.get('story') ?? '')) !== hash) return;
    const stored = now.get('signature') as InsightSignature | undefined;
    if ((stored?.coreInsight ?? '') !== (signature.coreInsight ?? '') || (stored?.placeholder === true) !== (signature.placeholder === true)) return;
    tx.update(ref, { 'signature.contentHash': hash, indexPendingAt: FieldValue.delete() });
  });
}

/**
 * Stamp `thin` (lib/cards/blank) as the card's words are now, in a
 * transaction: for a card the save didn't stamp — published before it did,
 * or changed by an older build's client write, which the rules let take no
 * `thin` of its own. The saves (publish, an applied edit) stamp it in their
 * own write, so this runs only when what indexing read disagrees.
 */
async function syncThin(ref: DocumentReference): Promise<void> {
  await ref.firestore.runTransaction(async (tx) => {
    const [now] = await tx.getAll(ref, { fieldMask: ['thoughtCore', 'story', 'thin'] });
    if (!now.exists) return;
    const thin = thinCard({ thoughtCore: now.get('thoughtCore'), story: now.get('story') });
    if ((now.get('thin') === true) !== thin) tx.update(ref, { thin: thin ? true : FieldValue.delete() });
  });
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
export async function indexCard(cardId: string, opts: IndexOptions = {}): Promise<IndexResult> {
  const db = getAdminDb();
  const ref = db.collection('cards').doc(cardId);
  const deadline = AbortSignal.timeout(Math.max(1, (opts.deadline ?? Date.now() + INDEX_DEADLINE_MS) - Date.now()));
  const [snap] = await db.getAll(ref, { fieldMask: INDEX_FIELDS });
  if (!snap.exists) return { indexed: false, reason: 'not-found' };

  const data = snap.data() ?? {};
  // Drafts carry no published signal yet — nothing to recommend.
  if (data.publishedAt == null) return { indexed: false, reason: 'not-published' };

  const store = getVectorStore();
  /** The card's visibility as it is now, read again — null once it is gone. */
  const reread = async () => {
    const [now] = await db.getAll(ref, { fieldMask: VISIBILITY_FIELDS });
    return now.exists ? vectorVisibility(now.data() ?? {}) : null;
  };
  const settleOwed = async () => {
    if (data.indexPendingAt != null) await ref.update({ indexPendingAt: FieldValue.delete() }).catch((e) => (isNotFound(e) ? undefined : Promise.reject(e)));
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
  if ((data.thin === true) !== thin) await syncThin(ref);
  if (thin) {
    await store.deleteByCard(cardId);
    await settleOwed();
    return { indexed: false, reason: 'thin' };
  }
  const hash = indexContentHash(title, story);
  if (!opts.force && data.signature?.contentHash === hash) {
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
  try {
    await ref.update({ indexPendingAt: FieldValue.serverTimestamp() });
  } catch (e) {
    if (isNotFound(e)) return { indexed: false, reason: 'not-found' };
    throw e;
  }

  const offline = modelsOffline();
  let usage: TokenUsage = { input: 0, output: 0, reasoning: 0 };
  const count = (u: TokenUsage) => (usage = addUsage(usage, u));
  const signatureRef = db.collection(CARD_SIGNATURES).doc(cardId);
  /**
   * Write the card's reading only while the card is there (§A1.6: deleted
   * with the card), in a transaction that reads the card first: deleteCard's
   * transaction deletes the card and its reading together, so the two run one
   * after the other, and a card deleted for good while the models ran (up to
   * INDEX_DEADLINE_MS) leaves no reading behind. False when the card is gone.
   */
  const writeReading = (fields: DocumentData, merge: boolean) =>
    db.runTransaction(async (tx) => {
      const [now] = await tx.getAll(ref, { fieldMask: ['authorId'] });
      if (!now.exists) return false;
      if (merge) tx.set(signatureRef, fields, { merge: true });
      else tx.set(signatureRef, fields);
      return true;
    });
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
    await writeReading({ authorId: String(data.authorId ?? ''), error, failedAt: FieldValue.serverTimestamp(), usage }, true).catch((err) =>
      console.error('[index] recording a failed reading', cardId, err),
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
  try {
    await ref.update({ signature, indexedAt: FieldValue.serverTimestamp() });
  } catch (e) {
    if (isNotFound(e)) return { indexed: false, reason: 'not-found' };
    throw e;
  }
  /** The reading kept server-only — false when the card was deleted meanwhile (no reading is left for it). */
  const keepReading = (embedTokens: number) =>
    writeReading(
      {
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
        updatedAt: FieldValue.serverTimestamp(),
      },
      false,
    );

  if (!listed) {
    // Not for strangers (or edited down): make sure it isn't lingering in the
    // candidate pool from a previous, listed version.
    await store.deleteByCard(cardId);
    const kept = await keepReading(0);
    if (kept) await markIndexed(ref, hash, signature);
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
  await markIndexed(ref, hash, signature);
  return { indexed: true, channels: records.length };
}
