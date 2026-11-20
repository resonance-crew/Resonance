import type { Card } from '@/lib/db/types';
import type { MessageAlbum } from '@/lib/api/v1/messageParts';
import type { StickerRef } from '@/lib/stickers/catalog';
import type { MessageImage, NoteRequest } from '@/server/domain/conversations';
import type { CursorPosition, Instant, PageCursor } from '../time';

/**
 * The `conversations` aggregate's repositories: conversations and their
 * messages, notes (小紙條) and the letters they make (`letters/*`),
 * unsentMessages, privateShares, chatImages, reports and their evidence, and
 * the public pictures' owner records (`uploads`). The services are
 * src/server/app/{conversations,messages,sharedCards,chatImages,safety}.ts;
 * what each collection holds, and why, the module comments of
 * src/lib/api/v1/{conversations,messageActions,sharedCards,chatImages,
 * chatImageUpload,safety}.ts and src/lib/storage/uploads.ts.
 *
 * Some reads are of other aggregates' documents (profiles, blocks,
 * connections, cards, connectionOrigins) and some writes too (the bell row a
 * note or a first message rings, the connection a letter's answer makes):
 * the reads and writes these services make today, in the same transactions,
 * so nothing they guarantee changes.
 *
 * Times a row is ordered by — a message's `sentAt` — are `Instant`s
 * (microseconds), so a page never skips messages sent in the same
 * millisecond. A write's `at` is the service's clock; the Firestore adapter
 * writes its server's time instead (`FieldValue.serverTimestamp()`, as
 * always), stores without one write `at`.
 */

/** A conversation's document as the services read it. */
export interface ConversationHead {
  /** As stored (an array of uids, or null when it isn't one). */
  participants: unknown[] | null;
  /** The letter it holds, if any. */
  request: NoteRequest | null;
  /** Whether it holds a `request` field at all (one to delete when it is answered). */
  holdsRequest: boolean;
  createdAt: Instant | null;
  /** The list's preview: who sent the last message, and when (its sentAt); null when none. */
  lastMessage: { senderId: unknown; sentAt: Instant | null } | null;
}

/** A message as stored, parsed (anything odd read as absent). */
export interface StoredMessage {
  id: string;
  senderId: string | null;
  text: string | null;
  sentAt: Instant | null;
  cardRef?: string;
  noteRef?: Record<string, unknown>;
  kind?: string;
  image?: MessageImage;
  album?: MessageAlbum;
  sticker?: StickerRef;
  privateShare?: boolean;
  /** `reactions.{uid}` as stored. */
  reactions: Record<string, unknown>;
  replyTo?: Record<string, unknown>;
  unsent: boolean;
}

/** A reply's snapshot of the message it answers. */
export type ReplyQuote =
  | { id: string; senderId: string; text: string; cardRef?: string; image?: true; sticker?: StickerRef }
  | { id: string; senderId: string; unsent: true };

/** A message to write, whole. */
export interface NewMessage {
  senderId: string;
  text: string;
  cardRef?: string;
  kind?: string;
  privateShare?: true;
  noteRef?: { cardId: string; noteId: string };
  replyTo?: ReplyQuote;
  image?: MessageImage;
  album?: MessageAlbum;
  sticker?: StickerRef;
}

/** The list's preview of a message just sent (`lastMessage`, merged into the one before). */
export interface PreviewWrite {
  text: string;
  senderId: string;
  /** Picture, sticker and album say so; whatever isn't set is taken away (and `unsent` always is). */
  image?: true;
  sticker?: true;
  album?: { count: number };
}

/** What a message or note just sent does to its conversation, in one write. */
export interface SentWrite {
  preview: PreviewWrite;
  /** Whose unread count goes up by one. */
  unreadFor: string;
  /** A letter now waiting (`set`), one answered (`clear`), or the request left as it is (`keep`). */
  request: { set: { from: string; cardId: string; count: number } } | 'clear' | 'keep';
}

/** A note as the services read it. */
export interface StoredNote {
  id: string;
  cardId: unknown;
  fromUserId: unknown;
  toUserId: unknown;
}

/** A note to write. A withheld one (across a block, on an anonymous card) is addressed to no one. */
export type NewNote =
  | { cardId: string; fromUserId: string; toUserId: string; text: string }
  | { cardId: string; fromUserId: string; toUserId: null; withheldFor: string; text: string };

/** A bell row to write (`notifications/*`); `pushed` when another push rings it (marked done at once). */
export interface NewBell {
  userId: string;
  type: 'note' | 'message';
  payload: Record<string, unknown>;
  pushed: boolean;
}

/** A profile as these services ask it: whether it has a pen name, and its handle as the bell shows it. */
export interface Speaker {
  penName: boolean;
  handle: string;
}

/** A profile as moderation keeps it; null when there is none. */
export interface ProfileEvidence {
  handle: string | null;
  bio: string | null;
  avatarUrl: string | null;
  region: string | null;
}

/** What a reply of `uid` to `other` answers, as their connection's origins say (lib/api/v1/origins answeredBy). */
export interface OriginsRead {
  /** A resonance of `other`'s on a card of `uid`'s stands, not answered yet. */
  answers: boolean;
}

/** `chatImages/{id}` as stored. */
export interface ChatImageRecord {
  id: string;
  senderId: unknown;
  to: unknown;
  pair: unknown;
  key: unknown;
  thumbKey: unknown;
  width: number;
  height: number;
  /** The message carrying it; null before one does. */
  messageId: unknown;
  /** Still waiting for its message (`unsentAt` set). */
  unsent: boolean;
  /** When it began waiting (uploaded); null once a message carries it. */
  unsentAt: Instant | null;
}

export interface NewChatImage {
  senderId: string;
  to: string;
  pair: string;
  key: string;
  thumbKey: string;
  width: number;
  height: number;
  bytes: number;
  animated: boolean;
}

/** An unsent message's copy kept for moderation (`unsentMessages/*`). */
export interface UnsentCopy {
  id: string;
  pair: unknown;
  messageId: unknown;
  senderId: unknown;
  text: unknown;
  cardRef: unknown;
  noteRef: unknown;
  image: MessageImage | null;
  sticker: StickerRef | null;
  album: MessageAlbum | null;
  sentAt: Instant | null;
  unsentAt: Instant | null;
}

export interface NewUnsentCopy {
  pair: string;
  messageId: string;
  senderId: string;
  to: string;
  text?: string;
  cardRef?: string;
  noteRef?: Record<string, unknown>;
  image?: MessageImage;
  sticker?: StickerRef;
  album?: MessageAlbum;
  /** The message's own sentAt, kept as it was. */
  sentAt: Instant;
}

/** A page of a conversation's messages, newest first. */
export interface MessagePage {
  messages: StoredMessage[];
  /** Resumes after the page's last message; null when the page wasn't full. */
  next: PageCursor | null;
}

/** A report and what it was about, filed together. */
export interface NewReport {
  reporterId: string;
  targetType: 'card' | 'user' | 'message';
  targetId: string;
  targetUserId: string;
  contextId?: string;
  reason: string;
  detail: string;
}

/** The reads a transaction of this aggregate makes. Each is one document (or one query), as today. */
interface ConversationsReads {
  getConversation(pair: string): Promise<ConversationHead | null>;
  getMessage(pair: string, id: string): Promise<StoredMessage | null>;
  getNote(id: string): Promise<StoredNote | null>;
  /** The card (only `fields` when given); null when it is gone. */
  getCard(cardId: string, fields?: readonly string[]): Promise<Card | null>;
  /** The profile's pen name and handle (none when there is no profile). */
  getSpeaker(uid: string): Promise<Speaker>;
  /** Whether `blocker` blocked `blocked` (users/{blocker}/blocks/{blocked}). */
  blocks(blocker: string, blocked: string): Promise<boolean>;
  /** Whether the two are connected (connections/{pair}). */
  connected(a: string, b: string): Promise<boolean>;
  getChatImage(id: string): Promise<ChatImageRecord | null>;
}

/** Inside `uow.run`: every read before any write (ports/uow.ts). */
export interface ConversationsTxRepo extends ConversationsReads {
  /** How many unanswered notes `from` left `to` (letters/{from}_{to}; none when there is no record). */
  lettersLeft(from: string, to: string): Promise<number>;
  /** The two's connection origins, as a reply of `uid` to `other` reads them (kept for addReasons). */
  getOrigins(uid: string, other: string): Promise<OriginsRead>;
  /** The ids of up to `limit` messages of the conversation quoting `messageId` (`replyTo.id`). */
  quotesOf(pair: string, messageId: string, limit: number): Promise<string[]>;
  /** The ids of up to `limit` of `uid`'s messages in the conversation marked as passes to `cardId`. */
  sharePassesOf(pair: string, uid: string, cardId: string, limit: number): Promise<string[]>;

  /** Write the note (its createdAt the server's time). */
  putNote(id: string, note: NewNote, at: Date): void;
  /** Write a bell row. */
  putBell(id: string, bell: NewBell, at: Date): void;
  /** Connect the two, a letter of `by`'s answered the reason (lib/api/v1/origins connect). */
  connectByLetter(a: string, b: string, by: string): void;
  /** More reasons two people connected are: `uid`'s answer of `letterBy`'s letter, and of the resonance getOrigins found (when `answered`). Writes nothing for neither. */
  addReasons(uid: string, other: string, reasons: { letterBy: string | null; answered: boolean }): void;
  /** The letters between the two, both ways, gone (blind deletes). */
  clearLetters(a: string, b: string): void;
  /** `from`'s letters/* record: `count` unanswered notes, the latest on `cardId`. */
  putLetter(from: string, to: string, count: number, cardId: string, at: Date): void;
  /** A new conversation between the two, nothing in it, both unread counts 0. */
  openConversation(pair: string, participants: [string, string], at: Date): void;
  /**
   * Write a message whole, under `id`. Its `sentAt` is the server's time
   * (Firestore: `serverTimestamp()`, microseconds); a store without one makes
   * an Instant from `at` that comes after every other it handed out.
   */
  putMessage(pair: string, id: string, message: NewMessage, at: Date): void;
  /** A message or note sent: the list's preview, updatedAt, the recipient's unread count and the letter, in one write. */
  recordSent(pair: string, sent: SentWrite, at: Date): void;
  /** One more unread message for `uid`. */
  bumpUnread(pair: string, uid: string): void;
  /** `uid`'s reaction to the message, or none (null). */
  setReaction(pair: string, messageId: string, uid: string, reaction: string | null): void;
  /** The message becomes `{ senderId, sentAt, unsentAt }`: everything else it carried gone. */
  unsendMessage(pair: string, messageId: string, senderId: string, sentAt: Instant, at: Date): void;
  /** A quote of an unsent message keeps only `{ id, senderId, unsent: true }`. */
  emptyQuote(pair: string, quoteId: string, unsentId: string, senderId: string): void;
  /** The list's preview, which was the unsent message: `{ senderId, sentAt, unsent: true }`. */
  previewUnsent(pair: string, senderId: string, sentAt: Instant): void;
  putUnsentCopy(copy: NewUnsentCopy, at: Date): void;
  /** The message is no pass to its card any more (`privateShare` gone). */
  unmarkShare(pair: string, messageId: string): void;
  /** The 私人卡's record of having been sent privately (privateShares/{cardId}). */
  putPrivateShare(cardId: string, authorId: string, at: Date): void;
  /** The picture is the message's: `messageId` set, `unsentAt` gone. */
  markPictureSent(imageId: string, messageId: string): void;
  deleteChatImage(id: string): void;
}

/** Outside a transaction: reads, and writes that need none (batches, bulk deletes). */
export interface ConversationsData extends ConversationsReads {
  /** A card `viewerId` may read, by id (only `fields` when given) — not_found (ApiFailure) otherwise (reads `visibleCardById`). */
  readableCard(viewerId: string, cardId: string, fields?: readonly string[]): Promise<Card>;
  /** A card `viewerId` may read, by key (id or slug) — not_found otherwise (reads `visibleCard`). */
  visibleCard(viewerId: string, key: string): Promise<Card>;
  /** The profile's `primaryLocale` as stored (undefined when none). */
  primaryLocale(uid: string): Promise<unknown>;
  /** The profile as moderation keeps it; null when there is none. */
  profileEvidence(uid: string): Promise<ProfileEvidence | null>;
  /** One more unread message for `uid` (outside a send's transaction). */
  bumpUnread(pair: string, uid: string): Promise<void>;
  /** `uid` has read everything (their unread count 0). */
  clearUnread(pair: string, uid: string): Promise<void>;
  /** A page of the conversation's messages, newest first, `(sentAt, id)` descending, after `before` (invalid_request when it isn't a cursor). */
  listMessages(pair: string, limit: number, before?: PageCursor): Promise<MessagePage>;
  /** The `limit` messages sent before `sentAt` (or the latest, null), newest first (a report's context). */
  messagesBefore(pair: string, sentAt: Instant | null, limit: number): Promise<StoredMessage[]>;
  /** The conversation and everything under it, the messages first. */
  deleteConversation(pair: string): Promise<void>;

  /** The quotes of `messageId` in the conversation, by id, `limit` after the id `after`: their ids and whether each is emptied already. */
  quotesPage(pair: string, messageId: string, limit: number, after: string | null): Promise<{ id: string; emptied: boolean }[]>;
  /** Empty these quotes of the unsent message, in one batch. */
  emptyQuotes(pair: string, quoteIds: string[], unsentId: string, senderId: string): Promise<void>;
  /** Every unsent copy of the conversation's messages. */
  unsentCopiesOf(pair: string): Promise<UnsentCopy[]>;
  /** `limit` unsent copies unsent at `cutoff` or before, `(unsentAt, id)` ascending, after the position `after`. */
  dueUnsentCopies(cutoff: Date, limit: number, after: CursorPosition | null): Promise<UnsentCopy[]>;
  /** The copy, and with it the picture record `pictureId` when given, in one batch. */
  deleteUnsentCopy(id: string, pictureId: string | null): Promise<void>;

  /** Of the author's messages in the conversation marked as passes to one of `cardIds` (≤ 30), up to `limit`: each one's card and sentAt. */
  sharePasses(pair: string, authorId: string, cardIds: string[], limit: number): Promise<{ cardRef: unknown; sentAt: Instant | null }[]>;
  /** Who sent the card privately, by its privateShares/* record; null when none was. */
  privateShareAuthor(cardId: string): Promise<unknown>;

  /** Keep the picture's record under `id` unless one is there already (`ref.create()`): `exists` then, nothing written. */
  insertChatImageIfAbsent(id: string, record: NewChatImage, at: Date): Promise<'inserted' | 'exists'>;
  /** `limit` pictures waiting for their message since `cutoff` or before, the longest first (`(unsentAt, id)`), after the position `after`. */
  dueUnsentChatImages(cutoff: Date, limit: number, after: CursorPosition | null): Promise<ChatImageRecord[]>;

  /** The report and its evidence, in one batch. */
  fileReport(id: string, report: NewReport, evidence: Record<string, unknown>, at: Date): Promise<void>;

  /** Whose a stored public picture is (uploads/{uploadId(key)}). */
  recordUpload(ownerId: string, key: string, kind: string, at: Date): Promise<void>;
  /** The keys of every picture `uid` stored (by its record). */
  uploadedKeys(uid: string): Promise<string[]>;
}
