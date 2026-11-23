import { FieldPath, FieldValue, GrpcStatus, Timestamp, type DocumentData, type Transaction } from 'firebase-admin/firestore';
import type { PassageSource, SummarySource, SummaryWriter, TranslationsData, TranslationsTxRepo } from '@/server/ports/repos/translations';
import type { AdminDb } from '../db';
import { storedSummary } from '../summary';

// Today's reads and writes of src/lib/api/v1/{summaryTranslationsMake,
// summaryBackfill,translation}.ts and the revalidate route, moved here as
// they were: the same field masks, transaction, BulkWriter and its retry
// rule, lastUpdateTime preconditions and server stamps.

/** What making a card's translated summaries reads of it. */
const SOURCE_FIELDS = ['thoughtCore', 'story', 'excerpt', 'readMinutes', 'excerptAt', 'updatedAt', 'publishedAt', 'visibility', 'trashedAt', 'summaryTranslations'];

const cardRef = (db: AdminDb, id: string) => db.doc(`cards/${id}`);

/** What making a card's tap passages reads of it (round 27: lib/api/v1/tapPassagesMake's mask, offersPassages' fields). */
const PASSAGE_FIELDS = ['thoughtCore', 'story', 'publishedAt', 'trashedAt', 'tapPassages', 'signature.coreInsight'];

function passageSourceOf(data: DocumentData): PassageSource {
  return {
    title: typeof data.thoughtCore === 'string' ? data.thoughtCore : '',
    story: typeof data.story === 'string' ? data.story : '',
    fields: data,
    tapPassages: data.tapPassages,
    insight: typeof data.signature?.coreInsight === 'string' && data.signature.coreInsight.trim() ? data.signature.coreInsight : null,
  };
}

function sourceOf(data: DocumentData): SummarySource {
  return {
    title: typeof data.thoughtCore === 'string' ? data.thoughtCore : '',
    story: typeof data.story === 'string' ? data.story : '',
    storedExcerpt: storedSummary(data)?.excerpt ?? null,
    published: data.publishedAt != null,
    visibility: data.visibility,
    trashed: data.trashedAt != null,
    translations: data.summaryTranslations,
  };
}

/** A document's update time as an opaque version, and back (seconds.nanoseconds: nothing lost). */
const versionOf = (t: Timestamp) => `${t.seconds}.${t.nanoseconds}`;
function timestampOf(version: string): Timestamp {
  const [s, n] = version.split('.');
  return new Timestamp(Number(s), Number(n));
}

/** `translations` inside a Firestore transaction. */
export function translationsTx(db: AdminDb, tx: Transaction): TranslationsTxRepo {
  return {
    async getSummarySource(id) {
      const [now] = await tx.getAll(cardRef(db, id), { fieldMask: SOURCE_FIELDS });
      return now.exists ? sourceOf(now.data()!) : null;
    },
    putSummaryTranslations(id, value) {
      // Never `updatedAt`: nothing the author wrote changed (and the stored summary stays current).
      tx.update(cardRef(db, id), { summaryTranslations: value });
    },
    async getPassageSource(id) {
      const [now] = await tx.getAll(cardRef(db, id), { fieldMask: PASSAGE_FIELDS });
      return now.exists ? passageSourceOf(now.data()!) : null;
    },
    putTapPassages(id, value) {
      // Never `updatedAt`: nothing the author wrote changed. The whole value, so a failure count goes with it.
      tx.update(cardRef(db, id), { tapPassages: { of: value.of, items: value.items, model: value.model, v: value.v, at: FieldValue.serverTimestamp() } });
    },
  };
}

/** `translations` outside a transaction. */
export function translationsData(db: AdminDb): TranslationsData {
  return {
    async getSummarySource(id) {
      const [snap] = await db.getAll(cardRef(db, id), { fieldMask: SOURCE_FIELDS });
      return snap?.exists ? sourceOf(snap.data()!) : null;
    },
    async removeSummaryTranslations(id) {
      await cardRef(db, id).update({ summaryTranslations: FieldValue.delete() });
    },
    async getPassageSource(id) {
      const [snap] = await db.getAll(cardRef(db, id), { fieldMask: PASSAGE_FIELDS });
      return snap?.exists ? passageSourceOf(snap.data()!) : null;
    },
    async removeTapPassages(id) {
      await cardRef(db, id).update({ tapPassages: FieldValue.delete() });
    },
    async putTapPassagesFailed(id, failed) {
      await cardRef(db, id).update({ 'tapPassages.failed': { of: failed.of, tries: failed.tries } });
    },

    async getKeptTranslation(cardId, to) {
      const kept = await db.doc(`cards/${cardId}/translations/${to}`).get();
      if (!kept.exists) return null;
      const hash = kept.get('hash');
      const title = kept.get('title');
      const story = kept.get('story');
      if (typeof title !== 'string' || typeof story !== 'string') return null;
      return { hash: typeof hash === 'string' ? hash : null, title, story, passages: kept.get('passages') };
    },
    async keepTranslation(cardId, to, value) {
      // Whole (`set`): a translation made again drops the passages placed in the one before.
      await db
        .doc(`cards/${cardId}/translations/${to}`)
        .set({ title: value.title, story: value.story, hash: value.hash, model: value.model, createdAt: FieldValue.serverTimestamp() });
    },
    async keepTranslationPassages(cardId, to, value) {
      // `update`: only beside a translation that is there (a card deleted meanwhile took its translations).
      await db.doc(`cards/${cardId}/translations/${to}`).update({ passages: { of: value.of, items: value.items, at: FieldValue.serverTimestamp() } });
    },

    async summaryPage(after, limit) {
      let q = db
        .collection('cards')
        .orderBy(FieldPath.documentId())
        .select('story', 'publishedAt', 'updatedAt', 'excerpt', 'readMinutes', 'excerptAt')
        .limit(limit);
      if (after) q = q.startAfter(after);
      const page = await q.get();
      return page.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          published: data.publishedAt != null,
          story: typeof data.story === 'string' ? data.story : '',
          stored: storedSummary(data),
          version: versionOf(d.updateTime),
        };
      });
    },
    summaryWriter(): SummaryWriter {
      const writer = db.bulkWriter();
      // A card changed since it was read fails its precondition: never retried (the next run re-reads it).
      writer.onWriteError((e) => e.code !== GrpcStatus.FAILED_PRECONDITION && e.failedAttempts < 3);
      return {
        keep(id, summary, version) {
          return writer
            .update(cardRef(db, id), { ...summary, excerptAt: FieldValue.serverTimestamp() }, { lastUpdateTime: timestampOf(version) })
            .then(
              () => 'written' as const,
              (e: { code?: number }) => (e.code === GrpcStatus.FAILED_PRECONDITION ? ('changed' as const) : ('failed' as const)),
            );
        },
        close: () => writer.close(),
      };
    },

    async hasAnswerTo(uid, cardId) {
      const answer = await db.collection('cards').where('authorId', '==', uid).where('referenceCardId', '==', cardId).limit(1).get();
      return !answer.empty;
    },
  };
}
