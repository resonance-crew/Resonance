import { FieldPath, FieldValue, Timestamp, type DocumentSnapshot, type Firestore, type Query } from 'firebase-admin/firestore';
import { isReservedId } from '@/lib/db/firestore/reservedId';
import type { ChatImageStore } from '@/lib/storage/chatImages';
import { runPool } from '@/lib/push/pool';
import type { MessagePush } from '@/lib/push/chat';
import { chatImageFiles, chatImageRef, messageImageOf } from './chatImages';
import { NOTE_MESSAGE_KIND, hasPenName, noPenName, pairOf } from './conversations';
import { ApiFailure } from './http';
import type { SetReactionInput } from './schemas';

/**
 * What a person does to a message already in their conversation (round 16):
 * answer it with a reaction (PUT/DELETE …/messages/{id}/reaction), or unsend
 * one of their own (POST …/messages/{id}/unsend). Both are the server's to
 * write — the rules let no client create or update a message.
 */

/** How long after sending a message its sender may unsend it. */
export const UNSEND_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * `unsentMessages/{pair}_{messageId}`: what an unsent message said, kept for
 * moderation (server-only: the rules close it to clients) — `{ pair,
 * messageId, senderId, to, text?, cardRef?, noteRef?, image?, sentAt,
 * unsentAt }`. Read only by the report path (a report of the conversation or
 * of one of its messages, filed while it is kept, attaches the conversation's
 * copies to its evidence), deleted after UNSENT_COPY_KEEP_MS by the daily
 * trash cron (purgeUnsentCopies, with the picture it carried) and with either
 * person's account.
 */
export const UNSENT_MESSAGES = 'unsentMessages';

/** How long an unsent message's copy is kept for moderation. */
export const UNSENT_COPY_KEEP_MS = 30 * 24 * 60 * 60 * 1000;

export const unsentCopyRef = (db: Firestore, pair: string, messageId: string) => db.collection(UNSENT_MESSAGES).doc(`${pair}_${messageId}`);

/** How many quotes of an unsent message its own transaction empties (the rest, if ever, right after it). */
export const QUOTES_IN_TRANSACTION = 400;

const notFound = () => new ApiFailure('not_found', 'No such message.');

/**
 * The other person of a conversation `uid` names by its id, or null when the
 * id doesn't name one of theirs (a conversation's id is its two uids, sorted,
 * joined by `_`; one that isn't is no conversation of anyone's).
 */
export function otherInPair(pair: string, uid: string): string | null {
  const other = pair.startsWith(`${uid}_`) ? pair.slice(uid.length + 1) : pair.endsWith(`_${uid}`) ? pair.slice(0, -uid.length - 1) : '';
  if (!other || other === uid || pairOf(uid, other) !== pair || isReservedId(pair)) return null;
  return other;
}

const participates = (convo: DocumentSnapshot, uid: string) => {
  const participants = convo.exists ? convo.get('participants') : null;
  return Array.isArray(participants) && participants.includes(uid);
};

/** Whether a message has been unsent (it then carries nothing but its sender and times). */
export const isUnsent = (message: DocumentSnapshot) => message.exists && message.get('unsentAt') != null;

/**
 * Answer a message in one's own conversation with a reaction: `reactions.{uid}`
 * on the message — one per person, a second replacing the first; one's own
 * messages take them too. Quiet: no bell, no push, no unread, the list's
 * preview unchanged (the thread's listener shows it). Checked in the
 * contract's order, after the route spent the `react` budget: the
 * conversation and the message (not_found for one the viewer isn't in, a
 * message not in it, or an unsent one), the pen name, a block either way,
 * the connection — a letter not yet answered takes no reactions. All in one
 * transaction, so a reaction never lands on a message unsent a moment before.
 */
export async function setReaction(db: Firestore, uid: string, pair: string, messageId: string, input: SetReactionInput): Promise<void> {
  const other = otherInPair(pair, uid);
  if (!other || isReservedId(messageId)) throw notFound();
  const conversation = db.doc(`conversations/${pair}`);
  const ref = conversation.collection('messages').doc(messageId);
  await db.runTransaction(async (tx) => {
    const [convo, message, me, blockOut, blockIn, connection] = await Promise.all([
      tx.get(conversation),
      tx.get(ref),
      tx.get(db.doc(`users/${uid}`)),
      tx.get(db.doc(`users/${uid}/blocks/${other}`)),
      tx.get(db.doc(`users/${other}/blocks/${uid}`)),
      tx.get(db.doc(`connections/${pair}`)),
    ]);
    if (!participates(convo, uid) || !message.exists || isUnsent(message)) throw notFound();
    if (!hasPenName(me)) throw noPenName();
    if (blockOut.exists || blockIn.exists) throw new ApiFailure('blocked', 'You cannot react to this message.');
    if (!connection.exists) throw new ApiFailure('forbidden', 'You can react once you are connected.');
    const field = new FieldPath('reactions', uid);
    if (message.get(field) === input.reaction) return;
    tx.update(ref, field, input.reaction);
  });
}

/**
 * Take one's reaction to a message back. Idempotent: none there (or the
 * message unsent, which took every reaction with it) is nothing to do.
 * Taking back reaches no one, so neither a block nor a missing connection
 * stands in its way; only a conversation that isn't theirs, or a message not
 * in it, is not_found.
 */
export async function removeReaction(db: Firestore, uid: string, pair: string, messageId: string): Promise<void> {
  const other = otherInPair(pair, uid);
  if (!other || isReservedId(messageId)) throw notFound();
  const conversation = db.doc(`conversations/${pair}`);
  const ref = conversation.collection('messages').doc(messageId);
  await db.runTransaction(async (tx) => {
    const [convo, message] = await Promise.all([tx.get(conversation), tx.get(ref)]);
    if (!participates(convo, uid) || !message.exists) throw notFound();
    const field = new FieldPath('reactions', uid);
    if (message.get(field) === undefined) return;
    tx.update(ref, field, FieldValue.delete());
  });
}

export interface UnsentMessage {
  /** What `pushUnsend` needs after the response — null when the message was unsent already (nothing new to tell). */
  push: MessagePush | null;
}

/**
 * Unsend a message one sent, within UNSEND_WINDOW_MS: for both people it
 * becomes a line saying so. One transaction —
 * - the message becomes `{ senderId, sentAt, unsentAt }`: its words, card,
 *   picture, link preview, quote and reactions gone;
 * - every message of the conversation quoting it (`replyTo.id`) keeps only
 *   `replyTo: { id, senderId, unsent: true }`;
 * - the conversation's preview, if it is this message, becomes
 *   `{ senderId, sentAt, unsent: true }` (unread counts untouched);
 * - what it said is kept for moderation, `unsentMessages/{pair}_{id}`
 *   (UNSENT_MESSAGES), with the picture it carried (its record and files stay
 *   until the copy goes; GET /chat-images no longer serves it, as no message
 *   names it).
 * Checked, after the route spent the `unsend` budget: the message — anyone
 * else's, or one not in a conversation of theirs, is not_found; a note
 * (`kind: 'note'`, a letter left on a card) can't be unsent; one already
 * unsent is answered as done (writing nothing); past the window, a conflict.
 */
export async function unsendMessage(db: Firestore, uid: string, pair: string, messageId: string, now = Date.now()): Promise<UnsentMessage> {
  const other = otherInPair(pair, uid);
  if (!other || isReservedId(messageId)) throw notFound();
  const conversation = db.doc(`conversations/${pair}`);
  const messages = conversation.collection('messages');
  const ref = messages.doc(messageId);
  const quoting = messages.where('replyTo.id', '==', messageId);
  const copy = unsentCopyRef(db, pair, messageId);

  const done = await db.runTransaction(async (tx) => {
    const [message, convo, quotes] = await Promise.all([tx.get(ref), tx.get(conversation), tx.get(quoting.limit(QUOTES_IN_TRANSACTION))]);
    if (!message.exists || message.get('senderId') !== uid || !participates(convo, uid)) throw notFound();
    if (message.get('kind') === NOTE_MESSAGE_KIND) throw new ApiFailure('invalid_request', "A note can't be unsent.");
    if (isUnsent(message)) return { unsent: false, more: false };
    const sentAt = message.get('sentAt');
    if (!(sentAt instanceof Timestamp) || now - sentAt.toMillis() > UNSEND_WINDOW_MS) {
      throw new ApiFailure('conflict', 'This message can no longer be unsent.');
    }

    tx.set(ref, { senderId: uid, sentAt, unsentAt: FieldValue.serverTimestamp() });
    for (const quote of quotes.docs) tx.update(quote.ref, { replyTo: unsentQuote(messageId, uid) });
    // The preview names no message: it is this one when it was written with it (the same commit's time, same sender).
    const last = convo.get('lastMessage') as { senderId?: unknown; sentAt?: unknown } | null | undefined;
    if (last && last.senderId === uid && last.sentAt instanceof Timestamp && last.sentAt.isEqual(sentAt)) {
      tx.update(conversation, { lastMessage: { senderId: uid, sentAt, unsent: true } });
    }
    const text = message.get('text');
    const cardRef = message.get('cardRef');
    const noteRef = message.get('noteRef');
    const image = messageImageOf(message.get('image'));
    tx.set(copy, {
      pair,
      messageId,
      senderId: uid,
      to: other,
      ...(typeof text === 'string' && text ? { text } : {}),
      ...(typeof cardRef === 'string' && cardRef ? { cardRef } : {}),
      ...(noteRef && typeof noteRef === 'object' ? { noteRef } : {}),
      ...(image ? { image } : {}),
      sentAt,
      unsentAt: FieldValue.serverTimestamp(),
    });
    return { unsent: true, more: quotes.size >= QUOTES_IN_TRANSACTION };
  });

  if (!done.unsent) return { push: null };
  // A message quoted more often than one transaction writes: the rest right after it.
  if (done.more) await emptyQuotes(db, quoting, messageId, uid);
  return { push: { conversationId: pair, messageId, from: uid, to: other } };
}

/** What a quote of an unsent message keeps (and what a reply to one quotes). */
export const unsentQuote = (id: string, senderId: string) => ({ id, senderId, unsent: true as const });

/** Every quote of the unsent message still holding its words, page by page. */
async function emptyQuotes(db: Firestore, quoting: Query, messageId: string, senderId: string): Promise<void> {
  let after: DocumentSnapshot | null = null;
  for (;;) {
    let page = quoting.orderBy(FieldPath.documentId()).limit(QUOTES_IN_TRANSACTION);
    if (after) page = page.startAfter(after);
    const snap = await page.get();
    const batch = db.batch();
    let writes = 0;
    for (const quote of snap.docs) {
      if (quote.get('replyTo.unsent') === true) continue;
      batch.update(quote.ref, { replyTo: unsentQuote(messageId, senderId) });
      writes++;
    }
    if (writes) await batch.commit();
    if (snap.size < QUOTES_IN_TRANSACTION) return;
    after = snap.docs[snap.docs.length - 1];
  }
}

const iso = (v: unknown): string | null => (v instanceof Timestamp ? v.toDate().toISOString() : null);

/**
 * The conversation's unsent messages as a report's evidence keeps them: every
 * copy still kept (unsent within UNSENT_COPY_KEEP_MS of `now`), oldest first,
 * each marked `unsent: true`.
 */
export async function unsentCopiesFor(db: Firestore, pair: string, now = Date.now()) {
  const kept = await db.collection(UNSENT_MESSAGES).where('pair', '==', pair).get();
  return kept.docs
    .filter((d) => {
      const at = d.get('unsentAt');
      return at instanceof Timestamp && now - at.toMillis() <= UNSENT_COPY_KEEP_MS;
    })
    .sort((a, b) => (a.get('sentAt') as Timestamp).toMillis() - (b.get('sentAt') as Timestamp).toMillis())
    .map((d) => {
      const image = messageImageOf(d.get('image'));
      const cardRef = d.get('cardRef');
      const noteRef = d.get('noteRef');
      return {
        id: String(d.get('messageId') ?? ''),
        senderId: String(d.get('senderId') ?? ''),
        text: typeof d.get('text') === 'string' ? (d.get('text') as string) : '',
        sentAt: iso(d.get('sentAt')),
        unsentAt: iso(d.get('unsentAt')),
        ...(typeof cardRef === 'string' ? { cardRef } : {}),
        ...(noteRef && typeof noteRef === 'object' ? { noteRef } : {}),
        // Its picture: `npm run moderation picture <id>` opens it (kept with the copy).
        ...(image ? { image } : {}),
        unsent: true as const,
      };
    });
}

export interface UnsentCopyPurge {
  deleted: number;
  failed: number;
}

/** How many copies a page of the purge reads. */
const COPY_PAGE = 100;
/** How many of a page's copies are deleted at once (each its picture's files, then a batch). */
const COPY_CONCURRENCY = 4;

/**
 * Deletes the unsent messages' copies kept UNSENT_COPY_KEEP_MS or longer, the
 * oldest first, page after page (the daily trash cron), each with the picture
 * it carried: the picture's files (best effort, when a store is at hand), then
 * its record and the copy together. Starts none past `deadline`.
 */
export async function purgeUnsentCopies(
  db: Firestore,
  store: ChatImageStore | null,
  { now = Date.now(), deadline = Infinity, clock = Date.now }: { now?: number; deadline?: number; clock?: () => number } = {},
): Promise<UnsentCopyPurge> {
  const cutoff = Timestamp.fromMillis(now - UNSENT_COPY_KEEP_MS);
  let deleted = 0;
  let failed = 0;
  let after: DocumentSnapshot | null = null;
  for (;;) {
    let page = db.collection(UNSENT_MESSAGES).where('unsentAt', '<=', cutoff).orderBy('unsentAt').limit(COPY_PAGE);
    // Past the ones that failed: one that keeps failing never pins the head.
    if (after) page = page.startAfter(after);
    const due = await page.get();
    const late = () => clock() > deadline;
    await runPool(
      due.docs,
      COPY_CONCURRENCY,
      async (d) => {
        try {
          const image = messageImageOf(d.get('image'));
          const picture = image ? await chatImageRef(db, image.id).get() : null;
          // Only the picture this message carried (its record names it), never another message's.
          const ours = picture?.exists && picture.get('messageId') === d.get('messageId') && picture.get('pair') === d.get('pair');
          if (ours && store) {
            const results = await Promise.allSettled(chatImageFiles([picture]).map((key) => store.delete(key)));
            if (results.some((r) => r.status === 'rejected')) console.error(`[unsent] files of picture ${picture.id} not deleted`);
          }
          const batch = db.batch();
          // Without the store its files can't go: the record stays for the account purge, never naming files that are gone.
          if (ours && store) batch.delete(picture.ref);
          batch.delete(d.ref);
          await batch.commit();
          deleted++;
        } catch (err) {
          failed++;
          console.error(`[unsent] copy ${d.id} not purged`, err);
        }
      },
      { stop: late, tag: '[unsent]' },
    );
    if (due.size < COPY_PAGE || late()) return { deleted, failed };
    after = due.docs[due.docs.length - 1];
  }
}
