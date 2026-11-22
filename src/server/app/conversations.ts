import { ApiFailure } from '@/lib/api/v1/http';
import { fallbackLocale, type MessageAlbum } from '@/lib/api/v1/messageParts';
import { CARD_VISIBILITY_FIELDS, cardVisible } from '@/lib/api/v1/present';
import { isReservedId } from '@/lib/db/firestore/reservedId';
import type { MessagePush } from '@/lib/push/chat';
import { isSticker, stickerFallbackText } from '@/lib/stickers/catalog';
import type { ServerCtx } from '@/server/ctx';
import {
  LAST_MESSAGE_PREVIEW,
  NOTE_MESSAGE_KIND,
  NOTE_PREVIEW_CHARS,
  NOTE_REQUEST_MAX,
  REPLY_QUOTE_CHARS,
  cut,
  keptPrivate,
  pairOf,
  type MessageImage,
} from '@/server/domain/conversations';
import type { ChatImageRecord, ReplyQuote, StoredMessage, StoredNote } from '@/server/ports/repos/conversations';
import { messageSent, noteSent, threadChanged, type NoteOutcome } from '@/server/domain/realtimeInbox';
import { signal, signalWithOwn, type OwnSignals } from './inbox';

// Notes, messages and conversations as application services: what each
// answer checks, in which order, and what it writes. Why: the module comment
// of src/lib/api/v1/conversations.ts (the legacy facades, which call these on
// ctxFor(db)).

/** The refusal of a note past NOTE_REQUEST_MAX unanswered ones (lib/api/v1/conversations NoteLimitReached). */
export class NoteLimitReached extends ApiFailure {
  constructor() {
    super('conflict', 'Wait for them to reply.');
  }
}

/** The refusal for someone without a pen name (lib/api/v1/conversations hasPenName). */
export const noPenName = () => new ApiFailure('forbidden', 'Choose a pen name first.');

/** See src/lib/api/v1/conversations.ts `budgetFirst`. */
export async function budgetFirst<T>(spent: Promise<void>, send: () => Promise<T>): Promise<T> {
  // Handled from the start: refused while the send's reads run, it is awaited below all the same.
  spent.catch(() => {});
  let result: T;
  try {
    result = await send();
  } catch (e) {
    await spent;
    throw e;
  }
  await spent;
  return result;
}

/** What a note's card is read with: whose it is and who may read it (no story). */
const NOTE_CARD_FIELDS = CARD_VISIBILITY_FIELDS;
/** What a message's card is read with: who may read it, and its title for the conversation list's preview. */
const MESSAGE_CARD_FIELDS = [...CARD_VISIBILITY_FIELDS, 'thoughtCore'] as const;

/** See src/lib/api/v1/conversations.ts `mayMessage`. */
export async function mayMessageIn(ctx: ServerCtx, uid: string, other: string): Promise<void> {
  if (other === uid) throw new ApiFailure('invalid_request', 'You cannot message yourself.');
  const repo = ctx.data.conversations;
  const pair = pairOf(uid, other);
  const [me, blockOut, blockIn, connection, convo] = await Promise.all([
    repo.getSpeaker(uid),
    repo.blocks(uid, other),
    repo.blocks(other, uid),
    repo.connected(uid, other),
    repo.getConversation(pair),
  ]);
  if (!me.penName) throw noPenName();
  if (blockOut || blockIn) throw new ApiFailure('blocked', 'You cannot message this person.');
  if (!connection && convo?.request?.from !== other) {
    throw new ApiFailure('forbidden', 'You can message people you are connected with.');
  }
}

/** See src/lib/api/v1/conversations.ts `SentNote`. */
export interface SentNote {
  id: string;
  notificationId: string | null;
  push: MessagePush | null;
  duplicate: boolean;
}

/** A note found under the sender's clientId: theirs, answered as it was sent; anyone else's, refused. */
function resentNote(existing: StoredNote, uid: string): SentNote {
  if (existing.fromUserId !== uid) throw new ApiFailure('invalid_request', 'Not a valid client id.');
  return { id: existing.id, notificationId: null, push: null, duplicate: true };
}

export interface NoteInput {
  cardId: string;
  text: string;
  clientId?: string | null;
}

/** See src/lib/api/v1/conversations.ts `sendNote`. */
export async function sendNoteIn(ctx: ServerCtx, uid: string, input: NoteInput, spent: Promise<void> = Promise.resolve()): Promise<SentNote> {
  const out: { outcome: NoteOutcome } = { outcome: { kind: 'none' } };
  const sent = await budgetFirst(spent, () => leaveNote(ctx, uid, input, spent, out));
  // After the commit: whose lists changed (an anonymous card's note, its author's bell alone — realtimeInbox).
  if (!sent.duplicate) await signal(ctx, noteSent(out.outcome));
  return sent;
}

async function leaveNote(ctx: ServerCtx, uid: string, input: NoteInput, spent: Promise<void>, out: { outcome: NoteOutcome }): Promise<SentNote> {
  // Firestore's own ids (`__name__`, see isReservedId): a `clientId` is the document's id.
  if (input.clientId && isReservedId(input.clientId)) throw new ApiFailure('invalid_request', 'Not a valid client id.');
  const repo = ctx.data.conversations;
  const sent = input.clientId || null;
  // A resend first, before the card is asked: one hidden since must not turn the answer into a 404 (one deleted
  // since took the note with it: that resend is the 404 of a missing card). Both are read at once.
  const [resend, readable] = await Promise.allSettled([sent ? repo.getNote(sent) : null, repo.readableCard(uid, input.cardId, NOTE_CARD_FIELDS)]);
  if (resend.status === 'rejected') throw resend.reason;
  if (resend.value) return resentNote(resend.value, uid);
  if (readable.status === 'rejected') throw readable.reason;
  const card = readable.value;
  if (!card.publishedAt) throw new ApiFailure('not_found', 'No such card.');
  const author = card.authorId;
  if (author === uid) throw new ApiFailure('invalid_request', 'You cannot send a note to yourself.');
  const pair = pairOf(uid, author);

  return ctx.uow.run(
    async ({ conversations: tx }) => {
      // A transaction may run again: only its last run's outcome stands.
      out.outcome = { kind: 'none' };
      const [current, me, blockOut, blockIn, connected, convo, left0, origins, existing, inThread] = await Promise.all([
        tx.getCard(card.id, NOTE_CARD_FIELDS),
        tx.getSpeaker(uid),
        tx.blocks(uid, author),
        tx.blocks(author, uid),
        tx.connected(uid, author),
        tx.getConversation(pair),
        tx.lettersLeft(uid, author),
        tx.getOrigins(uid, author),
        sent ? tx.getNote(sent) : Promise.resolve(null),
        sent ? tx.getMessage(pair, sent) : Promise.resolve(null),
      ]);
      // The budget answers before anything else, and before anything is written (see budgetFirst).
      await spent;
      // The same note again (two sends at once, the first just written): what the first send wrote is the answer.
      if (existing) return resentNote(existing, uid);
      // The card as it is now: one deleted or hidden from the sender since the read above takes no note.
      if (!current || current.authorId !== author || !current.publishedAt || !cardVisible(current, uid, () => connected)) {
        throw new ApiFailure('not_found', 'No such card.');
      }
      // Before the blocks: whether they stand must change no answer about an anonymous card.
      if (!me.penName) throw noPenName();
      // Its byline as of this transaction: made anonymous a moment ago, it still keeps the note out of the thread.
      const threaded = current.anonymous !== true;
      const at = ctx.clock.date();
      if (blockOut || blockIn) {
        // One answer for both directions: the sender must not learn they were blocked.
        if (threaded) throw new ApiFailure('blocked', 'You cannot send a note to this person.');
        // An anonymous card: answered as delivered, delivering nothing (see SentNote).
        const withheld = sent ?? ctx.ids.id();
        tx.putNote(withheld, { cardId: card.id, fromUserId: uid, toUserId: null, withheldFor: author, text: input.text }, at);
        return { id: withheld, notificationId: null, push: null, duplicate: false };
      }
      // Not connected, on a named card: a letter, waiting for its answer.
      const writing = threaded && !connected;
      // Their letter to me is waiting, and this note — mine, its recipient's — answers it
      // (crossing letters when we aren't connected; connected, it is a reason we are).
      const answers = threaded && convo?.request?.from === author;
      const left = writing ? left0 : 0;
      if (writing && !answers && left >= NOTE_REQUEST_MAX) throw new NoteLimitReached();
      // The note's message takes its id in the thread: one there already is not this note's to overwrite.
      // Asked of a named card only — on an anonymous one, whether that thread holds it would name the author.
      if (threaded && inThread) throw new ApiFailure('invalid_request', 'Not a valid client id.');

      const note = sent ?? ctx.ids.id();
      tx.putNote(note, { cardId: card.id, fromUserId: uid, toUserId: author, text: input.text }, at);
      const bell = ctx.ids.id();
      tx.putBell(
        bell,
        {
          userId: author,
          type: 'note',
          payload: {
            noteId: note,
            cardId: card.id,
            fromUserId: uid,
            fromHandle: me.handle,
            preview: cut(input.text, NOTE_PREVIEW_CHARS),
            // Its bell opens the card, not a thread with the writer (see above).
            ...(threaded ? {} : { anonymous: true }),
          },
          // In the thread, the chat push rings it (pushedAt marks the row's own push done).
          pushed: threaded,
        },
        at,
      );
      if (!threaded) {
        out.outcome = { kind: 'anonymous', author };
        return { id: note, notificationId: bell, push: null, duplicate: false };
      }

      if (writing) {
        // Their letter answered: the two connected by it. Else this one waits.
        if (answers) tx.connectByLetter(uid, author, uid);
        else tx.putLetter(uid, author, left + 1, card.id, at);
      } else {
        // Connected: the letter it answers, and a resonance of theirs on a card of mine
        // it answers, are reasons they stay so (a take-back reads them).
        tx.addReasons(uid, author, { letterBy: answers ? uid : null, answered: origins.answers });
      }
      if (answers) tx.clearLetters(uid, author);

      if (!convo) tx.openConversation(pair, [uid, author], at);
      // The note's own id: one note, one message (and `?note=` finds it). No
      // `noteRef` — on a message that means "answers a note".
      tx.putMessage(pair, note, { senderId: uid, text: input.text, cardRef: card.id, kind: NOTE_MESSAGE_KIND }, at);
      tx.recordSent(
        pair,
        {
          // Picture, sticker, album and unsent go: the preview is merged into the one before.
          preview: { text: cut(input.text, LAST_MESSAGE_PREVIEW), senderId: uid },
          unreadFor: author,
          // A letter waits for its answer; the answer leaves none waiting. Anything else leaves it as it is.
          request: writing && !answers ? { set: { from: uid, cardId: card.id, count: left + 1 } } : answers && convo?.holdsRequest ? 'clear' : 'keep',
        },
        at,
      );
      // A letter of theirs this answers connected the two (connectByLetter above): both connections lists changed.
      out.outcome = { kind: 'threaded', pair, writer: uid, author, connected: writing && answers };
      return { id: note, notificationId: bell, push: { conversationId: pair, messageId: note, from: uid, to: author }, duplicate: false };
    },
    { label: 'sendNote' },
  );
}

/** See src/lib/api/v1/conversations.ts `SentMessage`. */
export interface SentMessage {
  conversationId: string;
  id: string;
  notificationId: string | null;
  duplicate: boolean;
  push: MessagePush | null;
  silent?: boolean;
}

/** See src/lib/api/v1/conversations.ts `SendMessageInput`. */
export interface SendMessageInput {
  to: string;
  text: string;
  cardRef?: string | null;
  noteRef?: { cardId: string; noteId: string } | null;
  replyTo?: string | null;
  clientId?: string | null;
  image?: string | null;
  sticker?: { pack: string; id: string } | null;
  album?: MessageAlbum | null;
}

/**
 * What sendMessage keeps of the picture a message names, read in its
 * transaction: this sender's, for this conversation, and not sent in another
 * message — else one 400 for all of it (lib/api/v1/chatImages pictureToSend).
 */
export function pictureToSend(picture: ChatImageRecord | null, uid: string, pair: string, messageId: string): MessageImage {
  if (!picture || picture.senderId !== uid || picture.pair !== pair || (!picture.unsent && picture.messageId !== messageId)) {
    throw new ApiFailure('invalid_request', 'That is not a picture you can send here.');
  }
  return { id: picture.id, width: Number(picture.width), height: Number(picture.height) };
}

/** What a reply keeps of the message it answers (lib/api/v1/conversations replyQuote). */
export function replyQuote(original: StoredMessage): ReplyQuote {
  const senderId = String(original.senderId ?? '');
  if (original.unsent) return { id: original.id, senderId, unsent: true };
  return {
    id: original.id,
    senderId,
    text: cut(String(original.text ?? ''), REPLY_QUOTE_CHARS),
    ...(original.cardRef ? { cardRef: original.cardRef } : {}),
    ...(original.image ? { image: true as const } : {}),
    ...(original.sticker ? { sticker: original.sticker } : {}),
  };
}

/** See src/lib/api/v1/conversations.ts `sendMessage`. */
export async function sendMessageIn(
  ctx: ServerCtx,
  uid: string,
  input: SendMessageInput,
  spent: Promise<void> = Promise.resolve(),
  own?: (signals: OwnSignals) => void,
): Promise<SentMessage> {
  const out = { rang: false, connected: false };
  const sent = await budgetFirst(spent, () => writeMessage(ctx, uid, input, spent, out));
  // After the commit: both people's list and thread, the recipient's bell when its first message rang it, and both
  // people's connections when it answered a letter (connectByLetter) — the sender's own touch before the response
  // when `own` asks for its counters (signalWithOwn).
  if (!sent.duplicate) await signalWithOwn(ctx, uid, messageSent(sent.conversationId, uid, input.to, out.rang, out.connected), own);
  return sent;
}

async function writeMessage(
  ctx: ServerCtx,
  uid: string,
  input: SendMessageInput,
  spent: Promise<void>,
  out: { rang: boolean; connected: boolean },
): Promise<SentMessage> {
  const other = input.to;
  if (other === uid) throw new ApiFailure('invalid_request', 'You cannot message yourself.');
  const sticker = input.sticker ? { pack: input.sticker.pack, id: input.sticker.id } : null;
  if (sticker) {
    if (!isSticker(sticker.pack, sticker.id)) throw new ApiFailure('invalid_request', 'That is not a sticker.');
    if (input.text || input.cardRef || input.image || input.noteRef || input.album) {
      throw new ApiFailure('invalid_request', 'A sticker is sent on its own.');
    }
  } else if (!input.text && !input.cardRef && !input.image) {
    throw new ApiFailure('invalid_request', 'A message needs text, a card or a picture.');
  }
  if (input.cardRef && input.image) throw new ApiFailure('invalid_request', 'A message carries a card or a picture, not both.');
  if (input.album && !input.image) throw new ApiFailure('invalid_request', 'An album holds pictures only.');
  const album = input.album ? { id: input.album.id, index: input.album.index, count: input.album.count } : null;
  // An id Firestore keeps for itself names no picture.
  if (input.image && isReservedId(input.image)) throw new ApiFailure('invalid_request', 'That is not a picture you can send here.');
  if (input.clientId && isReservedId(input.clientId)) throw new ApiFailure('invalid_request', 'Not a valid client id.');
  // An id Firestore keeps for itself names no message (and would throw if asked for as a document).
  if (input.replyTo && isReservedId(input.replyTo)) throw new ApiFailure('invalid_request', 'No such message to reply to.');
  const repo = ctx.data.conversations;
  // The card it shares is read beside the transaction's reads, and asked first once they are in.
  const cardRead = input.cardRef ? repo.readableCard(uid, input.cardRef, MESSAGE_CARD_FIELDS) : null;
  cardRead?.catch(() => {});
  // A noteRef naming an id Firestore keeps for itself names no note: read as one that isn't there (one answer for all).
  const noteRef = input.noteRef && !isReservedId(input.noteRef.noteId) && !isReservedId(input.noteRef.cardId) ? input.noteRef : null;
  // A sticker's fallback words are in the recipient's language: their profile's, read beside the transaction (a
  // language changed a moment ago changes no guarantee, so the transaction needn't hold the profile). Unread, the
  // words are Chinese, as for a profile without a language.
  const recipientRead = sticker
    ? repo
        .primaryLocale(other)
        .then((locale) => fallbackLocale(locale))
        .catch(() => fallbackLocale(null))
    : null;
  const pair = pairOf(uid, other);
  const messageId = input.clientId || ctx.ids.id();

  return ctx.uow.run(
    async ({ conversations: tx }) => {
      const [me, blockOut, blockIn, connection, convo, origins, note, noteCard, existing, replied, sentPicture] = await Promise.all([
        tx.getSpeaker(uid),
        tx.blocks(uid, other),
        tx.blocks(other, uid),
        tx.connected(uid, other),
        tx.getConversation(pair),
        tx.getOrigins(uid, other),
        noteRef ? tx.getNote(noteRef.noteId) : Promise.resolve(null),
        noteRef ? tx.getCard(noteRef.cardId) : Promise.resolve(null),
        input.clientId ? tx.getMessage(pair, messageId) : Promise.resolve(null),
        input.replyTo ? tx.getMessage(pair, input.replyTo) : Promise.resolve(undefined),
        input.image ? tx.getChatImage(input.image) : Promise.resolve(undefined),
      ]);
      // The budget answers before anything else, and before anything is written (see budgetFirst).
      await spent;
      // The same message again: what the first send wrote is the answer, whatever has changed since (its card too).
      if (existing) {
        if (existing.senderId !== uid) throw new ApiFailure('invalid_request', 'Not a valid client id.');
        return { conversationId: pair, id: messageId, notificationId: null, duplicate: true, push: null };
      }
      const card = cardRead ? await cardRead : null;
      // Your own card in the trash (no one else can read one) is no card to share; nor is someone else's draft,
      // which you can't read. Your own 私人卡, published or never, is: the message lets them read it (./sharedCards).
      if (card && (card.trashedAt != null || (!card.publishedAt && card.authorId !== uid))) throw new ApiFailure('not_found', 'No such card.');
      // An anonymous card no one else may read would come with its author's name (the sender's): it isn't shared
      // so (sharedCards reads none) — public, its link names no one.
      if (card && card.authorId === uid && card.anonymous === true && !(card.publishedAt && card.visibility === 'public')) {
        throw new ApiFailure('invalid_request', 'An anonymous card is shared only while it is public.');
      }
      // Your 私人卡 sent now: this message is their pass to read it (sharedCards reads only messages so marked —
      // never a card sent while others could read it and made private later, nor an older message's card).
      const privateShare = !!card && card.authorId === uid && keptPrivate(card);
      if (!me.penName) throw noPenName();
      if (blockOut || blockIn) throw new ApiFailure('blocked', 'You cannot message this person.');
      // Answering their letter (I am its recipient): without a connection, this reply is what connects the two of you.
      const answers = convo?.request?.from === other;
      // Connected first (a resonance, or an answered note, connects you); a block also ends the connection.
      if (!connection && !answers) throw new ApiFailure('forbidden', 'You can message people you are connected with.');
      // A note gone with its card — deleting a card deletes its notes after it,
      // and so does moving an anonymous one to the trash — is answered all the
      // same, without saying which (as below). A card that isn't yours is as
      // gone as a missing one, so the answer never says whether someone else's
      // card is there; one of yours still there, out of the trash, means a
      // note that never was.
      const noteGone = !!noteRef && !note && !(noteCard && noteCard.authorId === uid && noteCard.trashedAt == null);
      // A message answers a note they left you, on the card it names — nothing
      // else, one answer for all of it: a note of your own on an anonymous card
      // would otherwise tell you, by which error came back, whether they wrote it.
      if (
        input.noteRef &&
        !noteGone &&
        (!note || note.cardId !== input.noteRef.cardId || note.fromUserId !== other || note.toUserId !== uid)
      ) {
        throw new ApiFailure('invalid_request', 'That is not a note they left you.');
      }
      // A note they left you on a card under your name: the message says which.
      // One left on your anonymous card, or gone with its card (which may have
      // been one), is answered all the same, without saying so: the message is
      // theirs to read too, and would tell them whose card it was.
      const keptNoteRef = noteRef && note && noteCard && noteCard.anonymous !== true ? noteRef : null;
      // A reply answers a message of this conversation (the path alone keeps it from being anyone else's).
      if (replied === null) throw new ApiFailure('invalid_request', 'No such message to reply to.');
      // A picture: this sender's own upload for this conversation, not sent in another message.
      const picture = sentPicture !== undefined ? pictureToSend(sentPicture, uid, pair, messageId) : null;

      const at = ctx.clock.date();
      // Connected: the letter of theirs this answers, and a resonance of theirs
      // on a card of yours it answers, are reasons you stay so (a take-back
      // reads them). Not connected, their letter answered is what connects you.
      if (connection) tx.addReasons(uid, other, { letterBy: answers ? uid : null, answered: origins.answers });
      else tx.connectByLetter(uid, other, uid);
      // A transaction may run again: only its last run's word stands.
      out.connected = !connection;
      if (answers) tx.clearLetters(uid, other);
      // An answered letter has a conversation already: no "new conversation" bell for it.
      const first = !convo;
      if (first) tx.openConversation(pair, [uid, other], at);
      const quoted = replied ? replyQuote(replied) : null;
      // A sticker's words are its fallback, for builds that can't draw it.
      const text = sticker && recipientRead ? stickerFallbackText(sticker, await recipientRead) : input.text;
      tx.putMessage(
        pair,
        messageId,
        {
          senderId: uid,
          text,
          ...(card ? { cardRef: card.id } : {}),
          ...(privateShare ? { privateShare: true as const } : {}),
          ...(keptNoteRef ? { noteRef: { cardId: keptNoteRef.cardId, noteId: keptNoteRef.noteId } } : {}),
          ...(quoted ? { replyTo: quoted } : {}),
          ...(picture ? { image: picture } : {}),
          ...(picture && album ? { album } : {}),
          ...(sticker ? { sticker } : {}),
        },
        at,
      );
      // Its record, which outlives the message: whoever read the card knows whose it is (sharedCards PRIVATE_SHARES).
      if (privateShare && card) tx.putPrivateShare(card.id, uid, at);
      // Sent: the picture is this message's from now on (and no longer one the unsent purge looks at).
      if (picture) tx.markPictureSent(picture.id, messageId);
      // The list's preview: the text, or the attached card's title when there is none; a picture, an album and a
      // sticker say so. A sticker's text is its fallback words.
      tx.recordSent(
        pair,
        {
          preview: {
            // A card's title only when anyone may read the card: the list is the recipient's even when the card isn't.
            text: cut(text || (card && card.publishedAt && card.visibility === 'public' ? card.thoughtCore : '') || '', LAST_MESSAGE_PREVIEW),
            senderId: uid,
            ...(picture ? { image: true as const } : {}),
            ...(sticker ? { sticker: true as const } : {}),
            // An album's picture: the list says how many were sent together (「傳送了 3 張圖片」).
            ...(picture && album ? { album: { count: album.count } } : {}),
          },
          unreadFor: other,
          // Their letter answered: it waits no more. One of yours waits on (only they answer it).
          request: answers && convo?.holdsRequest ? 'clear' : 'keep',
        },
        at,
      );
      out.rang = first;
      if (first) {
        // The bell lists a new conversation, but the push for it is the chat push's (pushedAt marks it done).
        tx.putBell(ctx.ids.id(), { userId: other, type: 'message', payload: { fromUserId: uid, fromHandle: me.handle }, pushed: true }, at);
      }
      return {
        conversationId: pair,
        id: messageId,
        notificationId: null,
        duplicate: false,
        push: { conversationId: pair, messageId, from: uid, to: other },
        // An album's later pictures ring nothing (the first rang for them all).
        ...(picture && album && album.index > 0 ? { silent: true } : {}),
      };
    },
    { label: 'sendMessage' },
  );
}

/** See src/lib/api/v1/conversations.ts `deleteConversation`. */
export async function deleteConversationIn(ctx: ServerCtx, uid: string, pair: string): Promise<void> {
  const other = pair.startsWith(`${uid}_`) ? pair.slice(uid.length + 1) : pair.endsWith(`_${uid}`) ? pair.slice(0, -uid.length - 1) : '';
  if (!other || other === uid || pairOf(uid, other) !== pair || isReservedId(pair)) {
    throw new ApiFailure('not_found', 'No such conversation.');
  }
  const repo = ctx.data.conversations;
  const convo = await repo.getConversation(pair);
  if (convo && !convo.participants?.includes(uid)) throw new ApiFailure('not_found', 'No such conversation.');
  await repo.deleteConversation(pair);
  // One already gone (a retry) changed no one's list.
  if (convo) await signal(ctx, threadChanged(pair, uid, other));
}
