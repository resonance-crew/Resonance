import {
  FieldPath,
  FieldValue,
  Timestamp,
  type DocumentReference,
  type DocumentSnapshot,
  type Query,
  type Transaction,
} from 'firebase-admin/firestore';
import { ApiFailure } from '@/lib/api/v1/http';
import { messageAlbumOf, messageStickerOf } from '@/lib/api/v1/messageParts';
import { addReason, answeredBy, connect, letterReason, originsRef } from '@/lib/api/v1/origins';
import { visibleCard, visibleCardById } from '@/lib/api/v1/reads';
import { mapCard } from '@/lib/db/firestore/mapper';
import {
  CHAT_IMAGES,
  EVIDENCE,
  PRIVATE_SHARES,
  UNSENT_MESSAGES,
  UPLOADS,
  countOf,
  isPenName,
  messageImageOf,
  pairOf,
  requestOf,
  unsentQuote,
  uploadId,
  type NoteRequest,
} from '@/server/domain/conversations';
import type {
  ChatImageRecord,
  ConversationHead,
  ConversationsData,
  ConversationsTxRepo,
  NewBell,
  NewMessage,
  StoredMessage,
  StoredNote,
  UnsentCopy,
  ConversationRow,
} from '@/server/ports/repos/conversations';
import { conversationRowOf } from '@/server/domain/inboxRows';
import { decodeCursor, encodeCursor, instantFromParts, instantParts, type CursorPosition, type Instant } from '@/server/ports/time';
import type { AdminDb } from '../db';

// Today's queries, transactions and batches of src/lib/api/v1/{conversations,
// messageActions,sharedCards,chatImages,chatImageUpload,safety}.ts and
// src/lib/storage/uploads.ts, moved here as they were: the same documents,
// field masks, `in` filters, `ref.create()`, `FieldValue.increment` on
// `unread.{uid}`, server timestamps and recursiveDelete. The `at` the
// services pass is ignored: Firestore writes its server's time, as before.

// ── The Firestore helpers other modules compose (re-exported by lib/api/v1/*) ──

/** `letters/{writer}_{recipient}` (lib/api/v1/conversations letterRef). */
export const letterRef = (db: AdminDb, from: string, to: string) => db.doc(`letters/${from}_${to}`);

/** How many unanswered notes a letters/* record counts (none when there is none). */
export const lettersLeft = (letter: DocumentSnapshot) => (letter.exists ? countOf(letter.get('count')) : 0);

/** A letter answered: the count of each one's unanswered notes to the other goes (blind deletes). */
export function clearLetters(tx: Transaction, db: AdminDb, a: string, b: string): void {
  tx.delete(letterRef(db, a, b));
  tx.delete(letterRef(db, b, a));
}

/** The letter a conversation holds, if any. */
export function openRequest(convo: DocumentSnapshot): NoteRequest | null {
  return requestOf(convo.exists ? convo.get('request') : null);
}

/** Whether a conversation holds a `request` field at all (one to delete when it is answered). */
export const holdsRequest = (convo: DocumentSnapshot | null | undefined) => convo?.exists === true && convo.get('request') !== undefined;

/** Whether a profile has a pen name (lib/api/v1/conversations hasPenName). */
export function hasPenName(me: DocumentSnapshot | null | undefined): boolean {
  return isPenName(me?.exists ? me.get('handle') : null);
}

export const chatImageRef = (db: AdminDb, id: string) => db.collection(CHAT_IMAGES).doc(id);
export const privateShareRef = (db: AdminDb, cardId: string) => db.collection(PRIVATE_SHARES).doc(cardId);
export const unsentCopyRef = (db: AdminDb, pair: string, messageId: string) => db.collection(UNSENT_MESSAGES).doc(`${pair}_${messageId}`);

/** The files of the pictures these records name (both sizes). */
export function chatImageFiles(docs: DocumentSnapshot[]): string[] {
  return docs.flatMap((d) => [d.get('key'), d.get('thumbKey')].filter((k): k is string => typeof k === 'string' && k.length > 0));
}

// ── Reading documents as domain values ──

/**
 * The store's time of a message's latest change after it was sent — every
 * write of these to a message already there sets it (a reaction, an unsend,
 * a quote emptied, 停止分享) — so a thread can ask for just what changed
 * (`listMessagesChangedAfter`). Never shown to a client. Not (yet) the link
 * preview's write (infra.ts): its suite pins that write to `preview` alone, so
 * an open thread reads its window whole while a link of its newest messages
 * may still get one (client/messages `awaitsPreview`).
 */
export const EDITED_AT = 'editedAt';

const instantOf = (v: unknown): Instant | null => (v instanceof Timestamp ? instantFromParts(v.seconds, v.nanoseconds) : null);
const timestampOf = (t: Instant) => {
  const { seconds, nanos } = instantParts(t);
  return new Timestamp(seconds, nanos);
};
const isMap = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function headOf(convo: DocumentSnapshot): ConversationHead | null {
  if (!convo.exists) return null;
  const participants = convo.get('participants');
  const last = convo.get('lastMessage');
  return {
    participants: Array.isArray(participants) ? participants : null,
    request: openRequest(convo),
    holdsRequest: holdsRequest(convo),
    createdAt: instantOf(convo.get('createdAt')),
    lastMessage: isMap(last) ? { senderId: last.senderId, sentAt: instantOf(last.sentAt) } : null,
  };
}

function messageOf(id: string, m: Record<string, unknown>): StoredMessage {
  const image = messageImageOf(m.image);
  const album = messageAlbumOf(m.album);
  const sticker = messageStickerOf(m.sticker);
  return {
    id,
    senderId: typeof m.senderId === 'string' ? m.senderId : null,
    text: typeof m.text === 'string' ? m.text : null,
    sentAt: instantOf(m.sentAt),
    ...(typeof m.cardRef === 'string' ? { cardRef: m.cardRef } : {}),
    ...(m.noteRef && typeof m.noteRef === 'object' ? { noteRef: m.noteRef as Record<string, unknown> } : {}),
    ...(typeof m.kind === 'string' ? { kind: m.kind } : {}),
    ...(image ? { image } : {}),
    ...(album ? { album } : {}),
    ...(sticker ? { sticker } : {}),
    ...(m.privateShare === true ? { privateShare: true } : {}),
    ...(isMap(m.replyTo) ? { replyTo: m.replyTo } : {}),
    reactions: isMap(m.reactions) ? m.reactions : {},
    unsent: m.unsentAt != null,
    ...(instantOf(m.unsentAt) ? { unsentAt: instantOf(m.unsentAt)! } : {}),
    ...(m.preview !== undefined ? { preview: m.preview } : {}),
  };
}

/** A conversation's document as the lists show it (lib/db/firestore/client/messages mapConversation, read on the server). */
function rowOf(convo: DocumentSnapshot): ConversationRow | null {
  if (!convo.exists) return null;
  const d = convo.data() ?? {};
  return conversationRowOf(convo.id, d, instantOf);
}

const snapMessage = (snap: DocumentSnapshot): StoredMessage | null => (snap.exists ? messageOf(snap.id, snap.data()!) : null);

const noteOf = (snap: DocumentSnapshot): StoredNote | null =>
  snap.exists ? { id: snap.id, cardId: snap.get('cardId'), fromUserId: snap.get('fromUserId'), toUserId: snap.get('toUserId') } : null;

function chatImageOf(snap: DocumentSnapshot): ChatImageRecord | null {
  if (!snap.exists) return null;
  const unsentAt = snap.get('unsentAt');
  return {
    id: snap.id,
    senderId: snap.get('senderId'),
    to: snap.get('to'),
    pair: snap.get('pair'),
    key: snap.get('key'),
    thumbKey: snap.get('thumbKey'),
    width: Number(snap.get('width')),
    height: Number(snap.get('height')),
    messageId: snap.get('messageId'),
    unsent: unsentAt != null,
    unsentAt: instantOf(unsentAt),
  };
}

function unsentCopyOf(d: DocumentSnapshot): UnsentCopy {
  return {
    id: d.id,
    pair: d.get('pair'),
    messageId: d.get('messageId'),
    senderId: d.get('senderId'),
    text: d.get('text'),
    cardRef: d.get('cardRef'),
    noteRef: d.get('noteRef'),
    image: messageImageOf(d.get('image')),
    sticker: messageStickerOf(d.get('sticker')),
    album: messageAlbumOf(d.get('album')),
    sentAt: instantOf(d.get('sentAt')),
    unsentAt: instantOf(d.get('unsentAt')),
  };
}

type Get = (ref: DocumentReference) => Promise<DocumentSnapshot>;
type GetMasked = (ref: DocumentReference, fields: readonly string[]) => Promise<DocumentSnapshot>;
type Run = (query: Query) => Promise<{ docs: DocumentSnapshot[] }>;

/** The reads both repositories make: `get` inside a transaction (tx.get) or outside (ref.get). */
function reads(db: AdminDb, get: Get, getMasked: GetMasked) {
  return {
    async getConversation(pair: string) {
      return headOf(await get(db.doc(`conversations/${pair}`)));
    },
    async getMessage(pair: string, id: string) {
      return snapMessage(await get(db.doc(`conversations/${pair}/messages/${id}`)));
    },
    async getNote(id: string) {
      return noteOf(await get(db.doc(`notes/${id}`)));
    },
    async getCard(cardId: string, fields?: readonly string[]) {
      const ref = db.doc(`cards/${cardId}`);
      const snap = fields ? await getMasked(ref, fields) : await get(ref);
      return snap.exists ? mapCard(snap.id, snap.data()!) : null;
    },
    async getSpeaker(uid: string) {
      const me = await get(db.doc(`users/${uid}`));
      return { penName: hasPenName(me), handle: String(me.get('handle') ?? '') };
    },
    async blocks(blocker: string, blocked: string) {
      return (await get(db.doc(`users/${blocker}/blocks/${blocked}`))).exists;
    },
    async connected(a: string, b: string) {
      return (await get(db.doc(`connections/${pairOf(a, b)}`))).exists;
    },
    async getChatImage(id: string) {
      return chatImageOf(await get(chatImageRef(db, id)));
    },
  };
}

const quoting = (db: AdminDb, pair: string, messageId: string) =>
  db.collection(`conversations/${pair}/messages`).where('replyTo.id', '==', messageId);
const marked = (db: AdminDb, pair: string, uid: string) =>
  db.collection(`conversations/${pair}/messages`).where('senderId', '==', uid).where('privateShare', '==', true);

const bellRow = (bell: NewBell) => ({
  userId: bell.userId,
  type: bell.type,
  payload: bell.payload,
  readAt: null,
  // Rung by another push: its own push is marked done.
  ...(bell.pushed ? { pushedAt: FieldValue.serverTimestamp() } : {}),
  createdAt: FieldValue.serverTimestamp(),
});

function messageRow(m: NewMessage) {
  return {
    senderId: m.senderId,
    text: m.text,
    sentAt: FieldValue.serverTimestamp(),
    ...(m.cardRef !== undefined ? { cardRef: m.cardRef } : {}),
    ...(m.kind !== undefined ? { kind: m.kind } : {}),
    ...(m.privateShare ? { privateShare: true } : {}),
    ...(m.noteRef ? { noteRef: { cardId: m.noteRef.cardId, noteId: m.noteRef.noteId } } : {}),
    ...(m.replyTo ? { replyTo: m.replyTo } : {}),
    ...(m.image ? { image: m.image } : {}),
    ...(m.album ? { album: m.album } : {}),
    ...(m.sticker ? { sticker: m.sticker } : {}),
  };
}

/** `conversations` inside a Firestore transaction. */
export function conversationsTx(db: AdminDb, tx: Transaction): ConversationsTxRepo {
  // The origins each pair was read with, for addReasons (lib/api/v1/origins addReason reads the snapshot).
  const origins = new Map<string, DocumentSnapshot>();
  const conversation = (pair: string) => db.doc(`conversations/${pair}`);
  const message = (pair: string, id: string) => db.doc(`conversations/${pair}/messages/${id}`);
  return {
    ...reads(
      db,
      (ref) => tx.get(ref),
      (ref, fields) => tx.getAll(ref, { fieldMask: [...fields] }).then(([snap]) => snap),
    ),
    async lettersLeft(from, to) {
      return lettersLeft(await tx.get(letterRef(db, from, to)));
    },
    async getOrigins(uid, other) {
      const snap = await tx.get(originsRef(db, uid, other));
      origins.set(pairOf(uid, other), snap);
      return { answers: answeredBy(snap, uid, other) !== null };
    },
    async quotesOf(pair, messageId, limit) {
      return (await tx.get(quoting(db, pair, messageId).limit(limit))).docs.map((d) => d.id);
    },
    async sharePassesOf(pair, uid, cardId, limit) {
      return (await tx.get(marked(db, pair, uid).where('cardRef', '==', cardId).limit(limit))).docs.map((d) => d.id);
    },

    putNote(id, note, _at) {
      tx.set(db.collection('notes').doc(id), { ...note, readAt: null, createdAt: FieldValue.serverTimestamp() });
    },
    putBell(id, bell, _at) {
      tx.set(db.collection('notifications').doc(id), bellRow(bell));
    },
    connectByLetter(a, b, by) {
      connect(tx, db, [a, b], letterReason(by));
    },
    addReasons(uid, other, { letterBy, answered }) {
      const snap = origins.get(pairOf(uid, other)) ?? null;
      addReason(tx, db, [uid, other], snap, letterBy ? letterReason(letterBy) : null, answered ? answeredBy(snap, uid, other) : null);
    },
    clearLetters(a, b) {
      clearLetters(tx, db, a, b);
    },
    putLetter(from, to, count, cardId, _at) {
      tx.set(letterRef(db, from, to), { from, to, count, cardId, at: FieldValue.serverTimestamp() });
    },
    openConversation(pair, [a, b], _at) {
      tx.set(conversation(pair), {
        participants: [a, b].sort(),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        lastMessage: null,
        unread: { [a]: 0, [b]: 0 },
      });
    },
    putMessage(pair, id, m, _at) {
      tx.set(message(pair, id), messageRow(m));
    },
    recordSent(pair, { preview, unreadFor, request }, _at) {
      tx.set(
        conversation(pair),
        {
          // The preview is merged into the one before: what this one isn't is taken away.
          lastMessage: {
            text: preview.text,
            senderId: preview.senderId,
            sentAt: FieldValue.serverTimestamp(),
            image: preview.image ? true : FieldValue.delete(),
            sticker: preview.sticker ? true : FieldValue.delete(),
            album: preview.album ? { count: preview.album.count } : FieldValue.delete(),
            unsent: FieldValue.delete(),
          },
          updatedAt: FieldValue.serverTimestamp(),
          unread: { [unreadFor]: FieldValue.increment(1) },
          ...(request === 'clear'
            ? { request: FieldValue.delete() }
            : request !== 'keep'
              ? { request: { ...request.set, at: FieldValue.serverTimestamp() } }
              : {}),
        },
        { merge: true },
      );
    },
    bumpUnread(pair, uid) {
      tx.set(conversation(pair), { unread: { [uid]: FieldValue.increment(1) } }, { merge: true });
    },
    setReaction(pair, messageId, uid, reaction) {
      tx.update(message(pair, messageId), new FieldPath('reactions', uid), reaction ?? FieldValue.delete(), EDITED_AT, FieldValue.serverTimestamp());
    },
    unsendMessage(pair, messageId, senderId, sentAt, _at) {
      tx.set(message(pair, messageId), {
        senderId,
        sentAt: timestampOf(sentAt),
        unsentAt: FieldValue.serverTimestamp(),
        [EDITED_AT]: FieldValue.serverTimestamp(),
      });
    },
    emptyQuote(pair, quoteId, unsentId, senderId) {
      tx.update(message(pair, quoteId), { replyTo: unsentQuote(unsentId, senderId), [EDITED_AT]: FieldValue.serverTimestamp() });
    },
    previewUnsent(pair, senderId, sentAt) {
      tx.update(conversation(pair), { lastMessage: { senderId, sentAt: timestampOf(sentAt), unsent: true } });
    },
    putUnsentCopy({ sentAt, ...copy }, _at) {
      tx.set(unsentCopyRef(db, copy.pair, copy.messageId), { ...copy, sentAt: timestampOf(sentAt), unsentAt: FieldValue.serverTimestamp() });
    },
    unmarkShare(pair, messageId) {
      tx.update(message(pair, messageId), { privateShare: FieldValue.delete(), [EDITED_AT]: FieldValue.serverTimestamp() });
    },
    putPrivateShare(cardId, authorId, _at) {
      tx.set(privateShareRef(db, cardId), { authorId, at: FieldValue.serverTimestamp() });
    },
    markPictureSent(imageId, messageId) {
      tx.update(chatImageRef(db, imageId), { messageId, unsentAt: FieldValue.delete() });
    },
    deleteChatImage(id) {
      tx.delete(chatImageRef(db, id));
    },
  };
}

/** Firestore's answer to `create()` on a document that is there. */
const ALREADY_EXISTS = 6;
const NOT_FOUND = 5;
const run: Run = (query) => query.get();

/** `conversations` outside a transaction. */
export function conversationsData(db: AdminDb): ConversationsData {
  const messages = (pair: string) => db.collection(`conversations/${pair}/messages`);
  const conversation = (pair: string) => db.doc(`conversations/${pair}`);
  return {
    ...reads(
      db,
      (ref) => ref.get(),
      (ref, fields) => db.getAll(ref, { fieldMask: [...fields] }).then(([snap]) => snap),
    ),
    readableCard(viewerId, cardId, fields) {
      return visibleCardById(db, viewerId, cardId, fields);
    },
    visibleCard(viewerId, key) {
      return visibleCard(db, viewerId, key);
    },
    async primaryLocale(uid) {
      const [snap] = await db.getAll(db.doc(`users/${uid}`), { fieldMask: ['primaryLocale'] });
      return snap.get('primaryLocale');
    },
    async profileEvidence(uid) {
      const person = await db.doc(`users/${uid}`).get();
      if (!person.exists) return null;
      const u = person.data();
      const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
      return { handle: str(u?.handle), bio: str(u?.bio), avatarUrl: str(u?.avatarUrl), region: str(u?.region) };
    },

    async bumpUnread(pair, uid) {
      await conversation(pair).set({ unread: { [uid]: FieldValue.increment(1) } }, { merge: true });
    },
    async clearUnread(pair, uid) {
      await conversation(pair).set({ unread: { [uid]: 0 } }, { merge: true });
    },
    async listMessages(pair, limit, before) {
      let at: CursorPosition | null = null;
      if (before !== undefined) {
        at = decodeCursor(before);
        if (!at) throw new ApiFailure('invalid_request', 'The request does not match the contract.', [{ path: 'pageToken', message: 'Not a valid page token.' }]);
      }
      let page = messages(pair).orderBy('sentAt', 'desc').orderBy(FieldPath.documentId(), 'desc').limit(limit);
      if (at) page = page.startAfter(timestampOf(at.t), at.id);
      const snap = await page.get();
      const list = snap.docs.map((d) => messageOf(d.id, d.data()));
      const last = list[list.length - 1];
      return {
        messages: list,
        next: list.length === limit && last?.sentAt ? encodeCursor({ t: last.sentAt, id: last.id }) : null,
        mark: instantOf(snap.readTime),
      };
    },
    async listMessagesAfter(pair, limit, after) {
      const at = decodeCursor(after);
      if (!at) throw new ApiFailure('invalid_request', 'The request does not match the contract.', [{ path: 'after', message: 'Not a valid cursor.' }]);
      const snap = await messages(pair)
        .orderBy('sentAt', 'asc')
        .orderBy(FieldPath.documentId(), 'asc')
        .startAfter(timestampOf(at.t), at.id)
        .limit(limit)
        .get();
      const list = snap.docs.map((d) => messageOf(d.id, d.data()));
      const newest = list[list.length - 1];
      return {
        messages: list.reverse(),
        next: list.length === limit && newest?.sentAt ? encodeCursor({ t: newest.sentAt, id: newest.id }) : null,
        mark: instantOf(snap.readTime),
      };
    },
    async listMessagesChangedAfter(pair, limit, since) {
      // `editedAt` is a commit's own time (serverTimestamp), and a query sees every commit up to its readTime:
      // a change it doesn't see has an editedAt after that readTime, so the readTime is the next mark.
      const snap = await messages(pair).where(EDITED_AT, '>', timestampOf(since)).orderBy(EDITED_AT, 'asc').limit(limit).get();
      const list = snap.docs.map((d) => messageOf(d.id, d.data()));
      return { messages: list, mark: list.length >= limit ? null : instantOf(snap.readTime) };
    },
    async listConversations(uid, limit, before) {
      let at: CursorPosition | null = null;
      if (before !== undefined) {
        at = decodeCursor(before);
        if (!at) throw new ApiFailure('invalid_request', 'The request does not match the contract.', [{ path: 'pageToken', message: 'Not a valid page token.' }]);
      }
      // The clients' own listener's query (participants array-contains, updatedAt desc), its index's
      // implicit __name__ breaking ties.
      let page = db
        .collection('conversations')
        .where('participants', 'array-contains', uid)
        .orderBy('updatedAt', 'desc')
        .orderBy(FieldPath.documentId(), 'desc')
        .limit(limit);
      if (at) page = page.startAfter(timestampOf(at.t), at.id);
      const snap = await page.get();
      const list = snap.docs.map((d) => rowOf(d)!);
      const last = list[list.length - 1];
      return { conversations: list, next: list.length === limit && last?.updatedAt ? encodeCursor({ t: last.updatedAt, id: last.id }) : null };
    },
    async getConversationRow(pair) {
      return rowOf(await conversation(pair).get());
    },
    async markRead(pair, uid) {
      try {
        // update(), not set(): a conversation deleted meanwhile is not made again with only a count in it.
        await conversation(pair).update(new FieldPath('unread', uid), 0);
        return 'marked';
      } catch (e) {
        if ((e as { code?: unknown }).code === NOT_FOUND) return 'gone';
        throw e;
      }
    },
    async messagesBefore(pair, sentAt, limit) {
      const query = sentAt
        ? messages(pair).where('sentAt', '<', timestampOf(sentAt)).orderBy('sentAt', 'desc').limit(limit)
        : messages(pair).orderBy('sentAt', 'desc').limit(limit);
      return (await query.get()).docs.map((d) => messageOf(d.id, d.data()));
    },
    async deleteConversation(pair) {
      // recursiveDelete takes what is under the conversation before the conversation itself.
      await db.recursiveDelete(conversation(pair));
    },

    async quotesPage(pair, messageId, limit, after) {
      let page = quoting(db, pair, messageId).orderBy(FieldPath.documentId()).limit(limit);
      if (after) page = page.startAfter(after);
      return (await run(page)).docs.map((d) => ({ id: d.id, emptied: d.get('replyTo.unsent') === true }));
    },
    async emptyQuotes(pair, quoteIds, unsentId, senderId) {
      if (!quoteIds.length) return;
      const batch = db.batch();
      for (const id of quoteIds) batch.update(messages(pair).doc(id), { replyTo: unsentQuote(unsentId, senderId), [EDITED_AT]: FieldValue.serverTimestamp() });
      await batch.commit();
    },
    async unsentCopiesOf(pair) {
      return (await db.collection(UNSENT_MESSAGES).where('pair', '==', pair).get()).docs.map(unsentCopyOf);
    },
    async dueUnsentCopies(cutoff, limit, after) {
      let page = db
        .collection(UNSENT_MESSAGES)
        .where('unsentAt', '<=', Timestamp.fromDate(cutoff))
        .orderBy('unsentAt')
        .orderBy(FieldPath.documentId())
        .limit(limit);
      // Past the ones that failed: one that keeps failing never pins the head.
      if (after) page = page.startAfter(timestampOf(after.t), after.id);
      return (await page.get()).docs.map(unsentCopyOf);
    },
    async deleteUnsentCopy(id, pictureId) {
      const batch = db.batch();
      if (pictureId) batch.delete(chatImageRef(db, pictureId));
      batch.delete(db.collection(UNSENT_MESSAGES).doc(id));
      await batch.commit();
    },

    async sharePasses(pair, authorId, cardIds, limit) {
      const sent = await marked(db, pair, authorId).where('cardRef', 'in', cardIds).select('cardRef', 'sentAt').limit(limit).get();
      return sent.docs.map((m) => ({ cardRef: m.get('cardRef'), sentAt: instantOf(m.get('sentAt')) }));
    },
    async privateShareAuthor(cardId) {
      const record = await privateShareRef(db, cardId).get();
      return record.exists ? record.get('authorId') : null;
    },

    async insertChatImageIfAbsent(id, record, _at) {
      try {
        await chatImageRef(db, id).create({
          ...record,
          unsentAt: FieldValue.serverTimestamp(),
          createdAt: FieldValue.serverTimestamp(),
        });
        return 'inserted';
      } catch (e) {
        if ((e as { code?: unknown })?.code === ALREADY_EXISTS) return 'exists';
        throw e;
      }
    },
    async dueUnsentChatImages(cutoff, limit, after) {
      let page = db
        .collection(CHAT_IMAGES)
        .where('unsentAt', '<=', Timestamp.fromDate(cutoff))
        .orderBy('unsentAt')
        .orderBy(FieldPath.documentId())
        .limit(limit);
      // Past the ones that failed: one that keeps failing never pins the head.
      if (after) page = page.startAfter(timestampOf(after.t), after.id);
      return (await page.get()).docs.map((d) => chatImageOf(d)!);
    },

    async fileReport(id, report, evidence, _at) {
      const ref = db.collection('reports').doc(id);
      const batch = db.batch();
      batch.set(ref, {
        reporterId: report.reporterId,
        targetType: report.targetType,
        targetId: report.targetId,
        targetUserId: report.targetUserId,
        reason: report.reason,
        detail: report.detail,
        ...(report.contextId ? { contextId: report.contextId } : {}),
        createdAt: FieldValue.serverTimestamp(),
        status: 'open',
      });
      batch.set(db.doc(`${EVIDENCE}/${id}`), {
        reportId: id,
        reporterId: report.reporterId,
        targetType: report.targetType,
        targetId: report.targetId,
        targetUserId: report.targetUserId,
        capturedAt: FieldValue.serverTimestamp(),
        ...evidence,
      });
      await batch.commit();
    },

    async recordUpload(ownerId, key, kind, _at) {
      await db.collection(UPLOADS).doc(uploadId(key)).set({ ownerId, key, kind, createdAt: FieldValue.serverTimestamp() });
    },
    async uploadedKeys(uid) {
      const snap = await db.collection(UPLOADS).where('ownerId', '==', uid).select('key').get();
      return snap.docs.map((d) => d.get('key')).filter((k): k is string => typeof k === 'string' && k.length > 0);
    },
  };
}
