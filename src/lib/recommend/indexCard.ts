import { createHash } from 'node:crypto';
import { FieldValue, type DocumentData, type DocumentReference } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { extractInsightSignature, signatureText } from '@/lib/ai/tasks';
import { embed, embedModel, llmModel } from '@/lib/ai/openai';
import { isIndexable, signatureToChannelTexts } from './signature';
import { getVectorStore } from './vectorStore';
import type { VectorRecord } from './vectorStore/types';
import type { InsightSignature, Visibility } from '@/lib/db/types';

export interface IndexResult {
  indexed: boolean;
  /**
   * `unchanged`: what the signature reads is what it was made from — no LLM call, the vectors' visibility synced alone.
   * `over-budget`: `mayCall` refused the LLM call; the card keeps its last signature and vectors (their visibility synced).
   */
  reason?: 'not-published' | 'not-found' | 'low-insight' | 'unchanged' | 'over-budget';
  channels?: number;
}

/** The channels' embeddings, after a publish or an applied edit's response: abandoned past this (the next save tries again). */
export const EMBED_TIMEOUT_MS = 10_000;

/** Bumped when the signature's or the vectors' recipe changes, so every card is made again at its next save. */
const INDEX_VERSION = 1;

/** What indexing reads of the card first: whether it is published, what the signature reads, whose it is, who may read it. */
const INDEX_FIELDS = ['publishedAt', 'thoughtCore', 'story', 'authorId', 'visibility', 'trashedAt', 'signature.contentHash'];
/** What the vectors' visibility is decided by (vectorVisibility), for the reads that only follow it. */
const VISIBILITY_FIELDS = ['visibility', 'trashedAt'];

/** Firestore's NOT_FOUND: an update of a document that is gone (deleted while the LLM ran). */
const isNotFound = (e: unknown) => (e as { code?: unknown } | null)?.code === 5;

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
 * What a card's signature and vectors were made from: the text the signature
 * reads (signatureText), with the models and the recipe's version — a card
 * whose hash is unchanged would get the same signature and vectors again.
 */
export function indexContentHash(title: string, story: string): string {
  return createHash('sha256')
    .update(JSON.stringify([INDEX_VERSION, llmModel(), embedModel(), signatureText({ title, story })]))
    .digest('base64url');
}

const SIGNATURE_KEYS = ['coreInsight', 'intent', 'situation', 'lifeDomain', 'emotionalRegister', 'insightScore'] as const;
const sameSignature = (stored: unknown, made: InsightSignature) =>
  !!stored && typeof stored === 'object' && SIGNATURE_KEYS.every((k) => (stored as Record<string, unknown>)[k] === made[k]);

/**
 * Mark the signature with the hash of the text it was made from — once its
 * vectors are settled (written, or removed below the insight bar), so a card
 * whose vectors never landed is made again at its next save. In a
 * transaction, and only while the card still holds that text and that
 * signature: a newer save's run may have replaced them meanwhile.
 */
async function markIndexed(ref: DocumentReference, hash: string, signature: InsightSignature): Promise<void> {
  await ref.firestore.runTransaction(async (tx) => {
    const [now] = await tx.getAll(ref, { fieldMask: ['thoughtCore', 'story', 'signature'] });
    if (!now.exists) return;
    if (indexContentHash(String(now.get('thoughtCore') ?? ''), String(now.get('story') ?? '')) !== hash) return;
    if (!sameSignature(now.get('signature'), signature)) return;
    tx.update(ref, { 'signature.contentHash': hash });
  });
}

/**
 * The write-time pipeline, run once per published card (idempotent): extract the
 * insight signature with one LLM call → store it back on the card → if the card
 * clears the insight bar, embed each channel and upsert its vectors; otherwise
 * remove any stale vectors so it leaves the candidate pool.
 *
 * Server-only (admin SDK + OpenAI key). This is where the system's cost lives —
 * O(cards), each once — so the read side can stay cheap.
 *
 * A save that leaves what the signature reads as it was (tags, a cover, the
 * byline, the story past its opening) makes nothing again: the signature
 * keeps the hash of the text it was made from (`signature.contentHash`, see
 * indexContentHash), and an unchanged one skips the LLM and the embeddings
 * (`reason: 'unchanged'`; `force` makes it all the same — the backfill's
 * --all). `mayCall` is asked just before the LLM call, so only a save that
 * needs one spends the caller's budget for it. Either way the card's vectors first take its visibility as this
 * run reads it, before any LLM call, and follow a change that lands while
 * it runs.
 *
 * A card in the trash — before this starts, or moved there while the LLM
 * runs (publish and apply start this after their response, so an author who
 * deletes what they just published lands here) — is indexed all the same,
 * its vectors private. Restoring it only gives its vectors their visibility
 * back (restoreCard runs where OpenAI can't be reached and asks no LLM): a
 * card left without vectors would come back no one's candidate until its
 * next edit, and an indexed one whose vectors were dropped would lose them
 * for good.
 */
export async function indexCard(cardId: string, opts: { force?: boolean; mayCall?: () => Promise<boolean> } = {}): Promise<IndexResult> {
  const db = getAdminDb();
  const ref = db.collection('cards').doc(cardId);
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

  // Whatever vectors the card has carry its visibility as read just now, before anything else runs.
  const first = vectorVisibility(data);
  await store.setVisibility(cardId, first);

  const title = String(data.thoughtCore ?? '');
  const story = String(data.story ?? '');
  const hash = indexContentHash(title, story);
  if (!opts.force && data.signature?.contentHash === hash) {
    // A change that landed between that read and the write: follow it.
    const settled = await reread();
    if (settled === null) {
      await store.deleteByCard(cardId);
      return { indexed: false, reason: 'not-found' };
    }
    if (settled !== first) await store.setVisibility(cardId, settled);
    return { indexed: false, reason: 'unchanged' };
  }
  if (opts.mayCall && !(await opts.mayCall())) return { indexed: false, reason: 'over-budget' };

  const signature = await extractInsightSignature({ title, story });

  // Always persist the signature (powers the card page / future features) and
  // stamp the index time. Not `updatedAt`: indexing isn't an edit, and a
  // later updatedAt would retire the card's stored list summary
  // (lib/api/v1/summary), making every list read its story again. An
  // update, never a merge: a card deleted while the LLM ran stays deleted
  // (a merge would bring back a stub of it, holding its slug for good).
  // The whole map: the hash of what an earlier signature was made from goes with it.
  try {
    await ref.update({ signature, indexedAt: FieldValue.serverTimestamp() });
  } catch (e) {
    if (isNotFound(e)) return { indexed: false, reason: 'not-found' };
    throw e;
  }

  if (!isIndexable(signature)) {
    // Below the insight bar (or edited down): make sure it isn't lingering in
    // the candidate pool from a previous, higher-scoring version.
    await store.deleteByCard(cardId);
    await markIndexed(ref, hash, signature);
    return { indexed: false, reason: 'low-insight' };
  }

  const channelTexts = signatureToChannelTexts(signature);
  const vectors = await embed(channelTexts.map((c) => c.text), { signal: AbortSignal.timeout(EMBED_TIMEOUT_MS) });

  // The card as it is now, after the LLM calls: one deleted meanwhile gets
  // no vectors, and one whose visibility changed — moved to the trash or
  // back, made private or public — carries the new one.
  const visibility = await reread();
  if (visibility === null) return { indexed: false, reason: 'not-found' };

  const records: VectorRecord[] = channelTexts.map((c, i) => ({
    cardId,
    authorId: String(data.authorId),
    visibility,
    channel: c.channel,
    vector: vectors[i] ?? [],
    insightScore: signature.insightScore,
    coreInsight: signature.coreInsight,
    situation: signature.situation,
    lifeDomain: signature.lifeDomain,
  }));

  await store.upsert(records);

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
