import { isReservedId } from '@/lib/db/firestore/reservedId';

/**
 * The conversations aggregate's names and pure policy: notes (小紙條),
 * letters, conversations and their messages, unsent copies, private shares,
 * chat pictures, reports. Why each is as it is: the module comments of
 * src/lib/api/v1/{conversations,messageActions,sharedCards,chatImages,
 * chatImageUpload,safety}.ts; the services are src/server/app/{conversations,
 * messages,sharedCards,chatImages,safety}.ts.
 */

/** notes.ts / firestore.rules: a note's length, and the bell's preview of it. */
export const NOTE_MAX_LENGTH = 2000;
export const NOTE_PREVIEW_CHARS = 140;
/** messages.ts / firestore.rules: a message's length, and the list's preview of the last one. */
export const MESSAGE_MAX_LENGTH = 2000;
export const LAST_MESSAGE_PREVIEW = 120;
/** How much of the message it answers a reply quotes (code points). */
export const REPLY_QUOTE_CHARS = 140;
/** What a message is, beyond words and a card: `note` — a note (小紙條) left on the recipient's card, carried into the thread. */
export const NOTE_MESSAGE_KIND = 'note';
/** How many notes someone may leave a person they aren't connected with before that person answers (`letters/*.count`). */
export const NOTE_REQUEST_MAX = 3;

/** How long after sending a message its sender may unsend it. */
export const UNSEND_WINDOW_MS = 24 * 60 * 60 * 1000;
/** `unsentMessages/{pair}_{messageId}` (lib/api/v1/messageActions). */
export const UNSENT_MESSAGES = 'unsentMessages';
/** How long an unsent message's copy is kept for moderation. */
export const UNSENT_COPY_KEEP_MS = 30 * 24 * 60 * 60 * 1000;
/** How many quotes of an unsent message its own transaction empties (the rest, if ever, right after it). */
export const QUOTES_IN_TRANSACTION = 400;

/** `chatImages/{id}` (lib/api/v1/chatImages). */
export const CHAT_IMAGES = 'chatImages';
/** How long an uploaded picture waits for its message before it is deleted. */
export const UNSENT_KEEP_MS = 24 * 60 * 60 * 1000;
/** `privateShares/{cardId}` (lib/api/v1/sharedCards). */
export const PRIVATE_SHARES = 'privateShares';
/** `reportEvidence/{id}` (lib/api/v1/safety). */
export const EVIDENCE = 'reportEvidence';
/** How many messages before a reported one its evidence keeps. */
export const MESSAGE_CONTEXT = 20;
/** `uploads/{uuid}` (lib/storage/uploads). */
export const UPLOADS = 'uploads';

/** The id of the conversation (and connection) between two people: their user ids, sorted, joined by "_". */
export const pairOf = (a: string, b: string) => (a < b ? `${a}_${b}` : `${b}_${a}`);
/** Cut by code points, so an emoji is never split in half. */
export const cut = (text: string, n: number) => Array.from(text).slice(0, n).join('');

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

/** A document id a request may name: a non-empty string without a slash, never one Firestore keeps for itself. */
export const idOk = (id: unknown): id is string => typeof id === 'string' && id.length > 0 && !id.includes('/') && !isReservedId(id);

/** A picture's id is a document id of ours (a slash would name another document). */
export const PICTURE_ID = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * `conversations/{pair}.request`: notes left by someone the other isn't
 * connected with, waiting for an answer (lib/api/v1/conversations NoteRequest).
 */
export interface NoteRequest {
  from: string;
  count: number;
}

/** A count the server can't read counts as full: the writer waits for an answer, as they would anyway. */
export const countOf = (count: unknown) => (typeof count === 'number' && Number.isInteger(count) && count >= 0 ? count : NOTE_REQUEST_MAX);

/** The letter a conversation's stored `request` holds, if any. */
export function requestOf(request: unknown): NoteRequest | null {
  if (!request || typeof request !== 'object') return null;
  const { from, count } = request as { from?: unknown; count?: unknown };
  if (typeof from !== 'string' || !from) return null;
  return { from, count: countOf(count) };
}

/** Whether a stored handle is a pen name (lib/api/v1/conversations hasPenName). */
export const isPenName = (handle: unknown) => typeof handle === 'string' && handle.trim().length > 0;

/** What a message keeps of the picture it carries (its document's `image`). */
export interface MessageImage {
  id: string;
  width: number;
  height: number;
}

/** The message's `image`, as it was stored — or null for a message without one. */
export function messageImageOf(value: unknown): MessageImage | null {
  const image = value as { id?: unknown; width?: unknown; height?: unknown } | null | undefined;
  if (!image || typeof image !== 'object' || typeof image.id !== 'string' || !image.id) return null;
  const width = Number(image.width);
  const height = Number(image.height);
  return { id: image.id, width: Number.isFinite(width) ? width : 0, height: Number.isFinite(height) ? height : 0 };
}

/** What a quote of an unsent message keeps (and what a reply to one quotes). */
export const unsentQuote = (id: string, senderId: string) => ({ id, senderId, unsent: true as const });

/** A 私人卡: never published, or published and kept private — what a message can be the pass to. */
export const keptPrivate = (card: { publishedAt?: Date | null; visibility?: string }) => !card.publishedAt || card.visibility === 'private';

/** An upload record's id: its key's file name without the extension (a fresh UUID). */
export function uploadId(key: string): string {
  const name = key.split('/').pop() ?? key;
  return name.replace(/\.[^.]*$/, '') || name;
}
