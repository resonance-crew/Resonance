import { FieldValue, type DocumentData } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { extractInsightSignature } from '@/lib/ai/tasks';
import { embed } from '@/lib/ai/openai';
import { isIndexable, signatureToChannelTexts } from './signature';
import { getVectorStore } from './vectorStore';
import type { VectorRecord } from './vectorStore/types';
import type { Visibility } from '@/lib/db/types';

export interface IndexResult {
  indexed: boolean;
  reason?: 'not-published' | 'not-found' | 'low-insight';
  channels?: number;
}

/** The channels' embeddings, after a publish or an applied edit's response: abandoned past this (the next save tries again). */
export const EMBED_TIMEOUT_MS = 10_000;

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
 * The write-time pipeline, run once per published card (idempotent): extract the
 * insight signature with one LLM call → store it back on the card → if the card
 * clears the insight bar, embed each channel and upsert its vectors; otherwise
 * remove any stale vectors so it leaves the candidate pool.
 *
 * Server-only (admin SDK + OpenAI key). This is where the system's cost lives —
 * O(cards), each once — so the read side can stay cheap.
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
export async function indexCard(cardId: string): Promise<IndexResult> {
  const db = getAdminDb();
  const ref = db.collection('cards').doc(cardId);
  const snap = await ref.get();
  if (!snap.exists) return { indexed: false, reason: 'not-found' };

  const data = snap.data() ?? {};
  // Drafts carry no published signal yet — nothing to recommend.
  if (data.publishedAt == null) return { indexed: false, reason: 'not-published' };

  const signature = await extractInsightSignature({
    title: String(data.thoughtCore ?? ''),
    story: String(data.story ?? ''),
  });

  // Always persist the signature (powers the card page / future features) and
  // stamp the index time. Not `updatedAt`: indexing isn't an edit, and a
  // later updatedAt would retire the card's stored list summary
  // (lib/api/v1/summary), making every list read its story again. An
  // update, never a merge: a card deleted while the LLM ran stays deleted
  // (a merge would bring back a stub of it, holding its slug for good).
  try {
    await ref.update({ signature, indexedAt: FieldValue.serverTimestamp() });
  } catch (e) {
    if (isNotFound(e)) return { indexed: false, reason: 'not-found' };
    throw e;
  }

  const store = getVectorStore();

  if (!isIndexable(signature)) {
    // Below the insight bar (or edited down): make sure it isn't lingering in
    // the candidate pool from a previous, higher-scoring version.
    await store.deleteByCard(cardId);
    return { indexed: false, reason: 'low-insight' };
  }

  const channelTexts = signatureToChannelTexts(signature);
  const vectors = await embed(channelTexts.map((c) => c.text), { signal: AbortSignal.timeout(EMBED_TIMEOUT_MS) });

  // The card as it is now, after the LLM calls: one deleted meanwhile gets
  // no vectors, and one whose visibility changed — moved to the trash or
  // back, made private or public — carries the new one.
  const now = (await ref.get()).data();
  if (!now) return { indexed: false, reason: 'not-found' };
  const visibility = vectorVisibility(now);

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
  const after = (await ref.get()).data();
  if (!after) {
    await store.deleteByCard(cardId);
    return { indexed: false, reason: 'not-found' };
  }
  const settled = vectorVisibility(after);
  if (settled !== visibility) await store.setVisibility(cardId, settled);
  return { indexed: true, channels: records.length };
}
