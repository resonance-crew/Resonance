import { FieldValue, type DocumentSnapshot, type Transaction } from 'firebase-admin/firestore';
import { slugHolder } from '@/lib/db/firestore/cardKey';
import { retirable, retiredSlugRef } from '@/lib/db/firestore/tombstones';
import type { CardLinksRow, InfraData, InfraTxRepo, MessagePreviewRow } from '@/server/ports/repos/infra';
import type { AdminDb } from '../db';

// Link previews (cards/{id}.linkPreviews, a message's preview) and slug
// collisions: the queries and transactions of src/lib/links/{cardLinks,preview}
// and src/lib/ai/assignSlug, moved, not rewritten.

/** What an unfurl reads of the card (no signature, no cover, no summary): there, and in its transaction. */
const UNFURL_FIELDS = ['publishedAt', 'story', 'linkPreviews', 'linkPreviewsFor', 'authorId'];

const cardRef = (db: AdminDb, cardId: string) => db.doc(`cards/${cardId}`);
const messageRef = (db: AdminDb, conversationId: string, messageId: string) => db.doc(`conversations/${conversationId}/messages/${messageId}`);

function cardLinksOf(snap: DocumentSnapshot): CardLinksRow | null {
  if (!snap.exists || snap.get('publishedAt') == null) return null;
  return {
    story: snap.get('story'),
    linkPreviews: snap.get('linkPreviews'),
    linkPreviewsFor: snap.get('linkPreviewsFor'),
    authorId: snap.get('authorId'),
  };
}

function messagePreviewOf(snap: DocumentSnapshot): MessagePreviewRow | null {
  if (!snap.exists) return null;
  return { text: snap.get('text'), hasPreview: snap.get('preview') != null, unsent: snap.get('unsentAt') != null };
}

/** `infra` inside a Firestore transaction. */
export function infraTx(db: AdminDb, tx: Transaction): InfraTxRepo {
  return {
    async getPublishedCardLinks(cardId) {
      const [now] = await tx.getAll(cardRef(db, cardId), { fieldMask: UNFURL_FIELDS });
      return cardLinksOf(now);
    },
    setCardLinkPreviews(cardId, value) {
      if (!value) tx.update(cardRef(db, cardId), { linkPreviews: FieldValue.delete(), linkPreviewsFor: FieldValue.delete() });
      else tx.update(cardRef(db, cardId), { linkPreviews: value.previews, linkPreviewsFor: value.links });
    },
    async getMessageForPreview(conversationId, messageId) {
      return messagePreviewOf(await tx.get(messageRef(db, conversationId, messageId)));
    },
    setMessagePreview(conversationId, messageId, preview) {
      tx.update(messageRef(db, conversationId, messageId), { preview });
    },
  };
}

/** `infra` outside a transaction. */
export function infraData(db: AdminDb): InfraData {
  return {
    async getPublishedCardLinks(cardId) {
      const [snap] = await db.getAll(cardRef(db, cardId), { fieldMask: UNFURL_FIELDS });
      return cardLinksOf(snap);
    },
    async getMessageForPreview(conversationId, messageId) {
      return messagePreviewOf(await messageRef(db, conversationId, messageId).get());
    },
    async getCardForSlug(cardId) {
      return (await db.collection('cards').doc(cardId).get()).data() ?? null;
    },
    async slugHolderId(slug) {
      const holders = await db.collection('cards').where('slug', '==', slug).limit(10).get();
      return slugHolder(holders.docs)?.id ?? null;
    },
    async slugTaken(candidate, cardId) {
      const [dupes, retired] = await Promise.all([
        db.collection('cards').where('slug', '==', candidate).limit(1).get(),
        retirable(candidate) ? retiredSlugRef(db, candidate).get() : null,
      ]);
      return !!retired?.exists || dupes.docs.some((d) => d.id !== cardId);
    },
    async getUserHandle(uid) {
      const author = await db.collection('users').doc(uid).get();
      return String(author.data()?.handle ?? '');
    },
    async setCardSlug(cardId, slug) {
      try {
        await db.collection('cards').doc(cardId).update({ slug });
        return true;
      } catch (e) {
        // Firestore's NOT_FOUND: nothing left to name.
        if ((e as { code?: unknown } | null)?.code !== 5) throw e;
        return false;
      }
    },
  };
}
