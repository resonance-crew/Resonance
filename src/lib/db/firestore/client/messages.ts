'use client';

import type { Conversation, Message } from '@/lib/db/types';
import type { ConversationBody, ConversationListBody, MessagePageBody, ThreadMessageBody } from '@/lib/api/v1/schemas';
import { getFirebaseClientAuth } from '@/lib/auth/firebase/client';
import { ApiError, callApi, callApiForm } from './api';
import { pokeSignal, watchSignal } from './signals';
import { linkPreviewOf } from '@/lib/links/previewShape';
import { isReactionId, type ReactionId } from '@/lib/design/reactions';

/** Hard cap mirrored in the API's SendMessageRequest — keep the two in sync. */
export const MESSAGE_MAX_LENGTH = 2000;

function requireUid(): string {
  const uid = getFirebaseClientAuth().currentUser?.uid;
  if (!uid) throw new Error('Not signed in');
  return uid;
}

/** Sorted pair id — identical to the Connection doc id. */
export function conversationId(a: string, b: string): string {
  return [a, b].sort().join('_');
}

/** The other participant of a pair id, from the viewer's perspective. */
export function otherParticipant(pairId: string, uid: string): string {
  const [a, b] = pairId.split('_');
  return a === uid ? b : a;
}

/** A time as the API or a document carries it: a Date, an ISO string, or a Timestamp (by shape). */
function tsToDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (value && typeof (value as { toDate?: unknown }).toDate === 'function') return (value as { toDate(): Date }).toDate();
  return null;
}

/**
 * A conversation as GET /api/v1/conversations answers it, in the shape the
 * list and the thread draw: the viewer's own unread count under their uid
 * (the API says only theirs), the preview's picture count as an album.
 */
export function mapApiConversation(c: ConversationBody, viewerId: string): Conversation {
  const last = c.lastMessage;
  const count = last?.albumCount;
  return {
    id: c.id,
    participants: (c.participants.length === 2 ? c.participants : ['', '']) as [string, string],
    createdAt: tsToDate(c.createdAt) ?? new Date(0),
    updatedAt: tsToDate(c.updatedAt) ?? new Date(0),
    lastMessage: last
      ? {
          text: last.text,
          senderId: last.senderId,
          sentAt: tsToDate(last.sentAt) ?? new Date(0),
          ...(last.image ? { image: true } : {}),
          ...(last.sticker ? { sticker: true } : {}),
          ...(typeof count === 'number' && Number.isInteger(count) && count >= 2 && count <= 10 ? { album: { count } } : {}),
          ...(last.unsent ? { unsent: true } : {}),
        }
      : null,
    unread: { [viewerId]: c.unread },
    originCardId: c.originCardId ?? undefined,
    request: mapRequest(c.request),
  };
}

/**
 * The letter a conversation holds, if any: who left the notes is all that
 * matters to the thread (whose turn it is). A count the server wrote oddly
 * reads as none; a `from` that isn't a uid as no letter at all.
 */
function mapRequest(v: unknown): Conversation['request'] {
  if (!v || typeof v !== 'object') return undefined;
  const r = v as Record<string, unknown>;
  const from = str(r.from);
  if (!from) return undefined;
  return {
    from,
    cardId: str(r.cardId),
    count: typeof r.count === 'number' && Number.isInteger(r.count) && r.count >= 0 ? r.count : 0,
  };
}

/** A message's fields (an API ThreadMessage, or a document's) as the thread draws it — each one checked again. */
export function mapMessageFields(id: string, data: Record<string, unknown>): Message {
  const unsentAt = data.unsentAt != null ? (tsToDate(data.unsentAt) ?? new Date()) : null;
  // Unsent: who sent it and when is all there is (the server keeps nothing else on it either).
  if (unsentAt) {
    return { id, senderId: String(data.senderId ?? ''), text: '', sentAt: tsToDate(data.sentAt) ?? new Date(), unsentAt };
  }
  const reactions = mapReactions(data.reactions);
  return {
    id,
    senderId: String(data.senderId ?? ''),
    text: String(data.text ?? ''),
    // serverTimestamp resolves as null in the local latency-compensated
    // snapshot — surface "now" so an optimistic message sorts last.
    sentAt: tsToDate(data.sentAt) ?? new Date(),
    cardRef: data.cardRef ? String(data.cardRef) : undefined,
    ...(data.privateShare === true ? { privateShare: true } : {}),
    noteRef: data.noteRef as Message['noteRef'],
    replyTo: mapReplyQuote(data.replyTo),
    preview: mapPreview(data.preview),
    image: mapImage(data.image),
    ...stickerField(data.sticker),
    // An album's place only beside its picture.
    ...(data.image ? albumField(data.album) : {}),
    // A kind this build doesn't know is a plain message.
    ...(data.kind === 'note' ? { kind: 'note' as const } : {}),
    ...(reactions ? { reactions } : {}),
  };
}

/** A message's reactions by uid — the five this build knows (one it doesn't is drawn as nothing); none, undefined. */
function mapReactions(v: unknown): Record<string, ReactionId> | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const known = Object.entries(v as Record<string, unknown>).filter((e): e is [string, ReactionId] => !!e[0] && isReactionId(e[1]));
  return known.length ? Object.fromEntries(known) : undefined;
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

function mapReplyQuote(v: unknown): Message['replyTo'] {
  if (!v || typeof v !== 'object') return undefined;
  const q = v as Record<string, unknown>;
  const id = str(q.id);
  if (!id) return undefined;
  // A quote of a message since unsent keeps only who sent it.
  if (q.unsent === true) return { id, senderId: String(q.senderId ?? ''), text: '', unsent: true };
  return {
    id,
    senderId: String(q.senderId ?? ''),
    text: typeof q.text === 'string' ? q.text : '',
    cardRef: str(q.cardRef),
    ...(q.image === true ? { image: true } : {}),
    ...stickerField(q.sticker),
  };
}

/**
 * A sticker a message names (round 22): its pack and id as the catalog spells them — whether this build knows it
 * or not (one it doesn't is fetched from the site, else its fallback words are shown). Anything else, none.
 */
function stickerField(v: unknown): { sticker?: { pack: string; id: string } } {
  if (!v || typeof v !== 'object') return {};
  const { pack, id } = v as Record<string, unknown>;
  const ok = (x: unknown, max: number): x is string => typeof x === 'string' && x.length <= max && /^[a-z0-9-]+$/.test(x);
  return ok(pack, 32) && ok(id, 40) ? { sticker: { pack, id } } : {};
}

/** One picture's place in an album (round 22): a sane id, index and count, else none (drawn as a picture alone). */
function albumField(v: unknown): { album?: { id: string; index: number; count: number } } {
  if (!v || typeof v !== 'object') return {};
  const { id, index, count } = v as Record<string, unknown>;
  const int = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n);
  if (typeof id !== 'string' || !id || id.length > 64 || !int(index) || !int(count)) return {};
  if (count < 2 || count > 10 || index < 0 || index >= count) return {};
  return { album: { id, index, count } };
}

/** A message's picture: an id, and a size that is a size (0 when the server wrote none: drawn square). */
function mapImage(v: unknown): Message['image'] {
  if (!v || typeof v !== 'object') return undefined;
  const p = v as Record<string, unknown>;
  const id = str(p.id);
  if (!id) return undefined;
  const size = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0);
  return { id, width: size(p.width), height: size(p.height) };
}

/**
 * The server writes `preview` after the message, so it arrives as a later
 * update. Only an http(s) address with a title counts, and the picture only
 * from our own link-image route — nothing else is ever put in an `<img>`.
 */
function mapPreview(v: unknown): Message['preview'] {
  return linkPreviewOf(v);
}

export interface MessageExtras {
  /** A shared card (the thread draws it as the card's own bubble). */
  cardRef?: string;
  /** The 紙條 this message replies to (quote header in the thread). */
  noteRef?: { cardId: string; noteId: string };
  /** The message this one answers (its id, in the same conversation): the server keeps a quote of it on the reply. */
  replyTo?: string;
  /** A picture uploaded for this conversation (uploadChatImage), by its id. */
  image?: string;
  /** One of several pictures sent together (only beside `image`): the album's id, this picture's place, how many. */
  album?: { id: string; index: number; count: number };
  /** A 小紙團 sticker (round 22): sent on its own — no text, card, picture or note beside it. */
  sticker?: { pack: string; id: string };
  /**
   * The id this message was given before it was sent (lib/chat/outbox's
   * `newClientId`): the server makes it the document's id, so sending it
   * again after a lost answer finds the message instead of writing it twice.
   */
  clientId?: string;
  /**
   * Who wrote it (a uid): it goes out only while they are the one signed in —
   * a message queued under one account never leaves under the next (another
   * tab can change who is signed in under a thread still sending).
   */
  as?: string;
}

/**
 * Send a message to someone you're connected with, through the server
 * (POST /api/v1/messages — the call the apps make). One transaction opens the
 * conversation on the first message, writes the message, the list preview (a
 * bodyless card share borrows the card's title) and the recipient's unread
 * counter, and rings their bell for the first message only (every message
 * pushes to their phones); it re-checks the connection, blocks, that an
 * attached card is one you can read and that a message answered is one of
 * this conversation. The rules refuse all of this from the browser. Text is
 * optional only when a card is attached. Resolves to the message's id.
 */
export async function sendMessage(
  toUserId: string,
  text: string,
  extras: MessageExtras = {},
): Promise<{ conversationId: string; id: string }> {
  const uid = requireUid();
  if (extras.as && extras.as !== uid) throw new Error('Signed in as someone else');
  const trimmed = text.trim();
  if (extras.sticker && (trimmed || extras.cardRef || extras.image || extras.noteRef)) throw new Error('A sticker is sent on its own');
  if (!trimmed && !extras.cardRef && !extras.image && !extras.sticker) throw new Error('Message is empty');
  if (trimmed.length > MESSAGE_MAX_LENGTH) throw new Error('Message too long');
  if (extras.album && !extras.image) throw new Error('An album holds pictures');
  return callApi('/api/v1/messages', {
    method: 'POST',
    body: {
      to: toUserId,
      text: trimmed,
      cardRef: extras.cardRef ?? null,
      noteRef: extras.noteRef ?? null,
      replyTo: extras.replyTo ?? null,
      clientId: extras.clientId ?? null,
      image: extras.image ?? null,
      sticker: extras.sticker ?? null,
      album: extras.album ?? null,
    },
  });
}

/**
 * Keep a picture to send to `toUserId` (POST /api/v1/chat-images): the
 * server re-encodes it and answers its id for sendMessage's `image`. The
 * message's own client id goes with it, so sending it again after a lost
 * answer finds the picture already kept. Only while `as` is the one signed in.
 */
export async function uploadChatImage(
  file: Blob,
  toUserId: string,
  opts: { clientId: string; as?: string },
): Promise<{ id: string; width: number; height: number }> {
  const uid = requireUid();
  if (opts.as && opts.as !== uid) throw new Error('Signed in as someone else');
  const form = new FormData();
  form.append('file', file, 'picture');
  form.append('to', toUserId);
  form.append('clientId', opts.clientId);
  return callApiForm('/api/v1/chat-images', form);
}

/**
 * Answer a message with a reaction, or (null) take the viewer's back — through
 * the server (PUT / DELETE /api/v1/conversations/{pair}/messages/{id}/reaction):
 * the rules let no client write a message. Quiet: no bell, push or unread.
 */
export async function reactToMessage(pairId: string, messageId: string, reaction: ReactionId | null): Promise<void> {
  requireUid();
  const path = `/api/v1/conversations/${encodeURIComponent(pairId)}/messages/${encodeURIComponent(messageId)}/reaction`;
  await (reaction ? callApi(path, { method: 'PUT', body: { reaction } }) : callApi(path, { method: 'DELETE' }));
}

/**
 * Unsend a message the viewer sent, within 24 hours (POST …/messages/{id}/unsend):
 * for both of them it becomes a line saying so. A conflict (409) past 24 hours.
 */
export async function unsendMessage(pairId: string, messageId: string): Promise<void> {
  requireUid();
  await callApi(`/api/v1/conversations/${encodeURIComponent(pairId)}/messages/${encodeURIComponent(messageId)}/unsend`, { method: 'POST' });
}

/** 停止分享: the viewer's messages in `pairId` stop sharing their 私人卡 `cardId` (any time, not only within 24 hours). */
export async function stopSharingCard(pairId: string, cardId: string): Promise<void> {
  requireUid();
  await callApi(`/api/v1/conversations/${encodeURIComponent(pairId)}/shared-cards/${encodeURIComponent(cardId)}`, { method: 'DELETE' });
}

/** Where a picture a message carries is read (the session cookie names the reader): `thumb` the thread's size. */
export function chatImageUrl(id: string, size: 'thumb' | 'full'): string {
  return `/api/v1/chat-images/${encodeURIComponent(id)}${size === 'thumb' ? '?size=thumb' : ''}`;
}

const pairPath = (pairId: string) => `/api/v1/conversations/${encodeURIComponent(pairId)}`;

/**
 * Zero the viewer's own unread counter on a conversation (POST
 * /api/v1/conversations/{pair}/read). The server raises the viewer's own
 * `inbox` signal, so the list and the header's badge pull it again; this
 * browser pokes them at once besides.
 */
export async function readConversation(pairId: string): Promise<void> {
  requireUid();
  await callApi(`${pairPath(pairId)}/read`, { method: 'POST' });
  pokeSignal('inbox');
}

/** The answer that, for this viewer, there is no such thing (404), or it isn't theirs to read (403). */
export function isGone(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 404 || err.status === 403);
}

/**
 * A single conversation (GET /api/v1/conversations/{pair}), or null when
 * there is none for this viewer — the server answers a conversation one isn't
 * in exactly as one that doesn't exist (404). A failed read throws.
 */
export async function getConversation(pairId: string): Promise<Conversation | null> {
  const uid = requireUid();
  try {
    return mapApiConversation(await callApi<ConversationBody>(pairPath(pairId)), uid);
  } catch (e) {
    if (isGone(e)) return null;
    throw e;
  }
}

/** How many conversations the list (and the header's badge) holds: the API's first page. */
export const CONVERSATIONS_PAGE = 50;

/** The viewer's newest conversations, the most recently active first (GET /api/v1/conversations: its first page). */
export async function listConversations(): Promise<Conversation[]> {
  const uid = requireUid();
  const body = await callApi<ConversationListBody>('/api/v1/conversations');
  return body.conversations.slice(0, CONVERSATIONS_PAGE).map((c) => mapApiConversation(c, uid));
}

/** A message with its place in the thread: the API's opaque cursor (`before` for older ones, `after` for newer). */
export interface ThreadEntry<C = string> {
  message: Message;
  cursor: C;
}

/** One answer of an open thread: its newest messages, newest first. */
export interface ThreadWindow {
  entries: ThreadEntry[];
}

/** The newest messages an open thread follows; older ones are read a page at a time. */
export const THREAD_WINDOW = 50;
/** The most one page of the API holds. */
const PAGE_MAX = 100;
/** How many `after` pages one catch-up reads at most. */
const CATCH_UP_PAGES = 20;

function apiEntry(m: ThreadMessageBody): ThreadEntry {
  return { message: mapMessageFields(m.id, m as unknown as Record<string, unknown>), cursor: m.cursor };
}

function messagesPath(pairId: string, q: Record<string, string>): string {
  return `${pairPath(pairId)}/messages?${new URLSearchParams(q).toString()}`;
}

/**
 * Follow an open thread: its newest {@link THREAD_WINDOW} messages (newest
 * first, each with its cursor), read again whenever the conversation's
 * counter moves on the viewer's signal channel (`threads[pair]`: a message, a
 * reaction, an unsend, a preview, 停止分享), on the minute's safety pull, and
 * at once after this browser sent one ({@link pokeSignal}). Each read is the
 * same GET, so one that changed nothing is a 304. When more came since the
 * last read than the window holds, the messages between are caught up with
 * `after=` pages, so nothing is skipped. A refusal (404: the conversation was
 * deleted, or isn't there) reaches `onError` as an ApiError ({@link isGone}).
 */
export function followThread(
  pairId: string,
  onWindow: (window: ThreadWindow) => void,
  onError?: (err: Error) => void,
  max = THREAD_WINDOW,
): () => void {
  let stopped = false;
  let running = false;
  let again = false;
  let held = new Set<string>();
  let newer: string | null = null;
  const read = async () => {
    const page = await callApi<MessagePageBody>(messagesPath(pairId, { limit: String(max) }));
    let messages = page.messages;
    if (newer && held.size && messages.length >= max && !messages.some((m) => held.has(m.id))) {
      // More than a window came: catch up from where the last read ended, so the history keeps every one.
      const between: ThreadMessageBody[] = [];
      let after: string | null = newer;
      for (let i = 0; after && i < CATCH_UP_PAGES; i++) {
        const next: MessagePageBody = await callApi<MessagePageBody>(messagesPath(pairId, { after, limit: String(PAGE_MAX) }));
        between.push(...next.messages);
        after = next.hasNewer ? next.newerCursor : null;
      }
      const seen = new Set(messages.map((m) => m.id));
      messages = [...messages, ...between.filter((m) => !seen.has(m.id))];
    }
    held = new Set(messages.map((m) => m.id));
    newer = page.newerCursor;
    return messages.map(apiEntry);
  };
  const pull = () => {
    if (stopped) return;
    if (running) {
      again = true;
      return;
    }
    running = true;
    read()
      .then(
        (entries) => !stopped && onWindow({ entries }),
        (err: unknown) => !stopped && onError?.(err instanceof Error ? err : new Error(String(err))),
      )
      .finally(() => {
        running = false;
        if (again) {
          again = false;
          pull();
        }
      });
  };
  pull();
  const uid = getFirebaseClientAuth().currentUser?.uid;
  const stop = uid ? watchSignal(uid, `thread:${pairId}`, pull) : () => {};
  return () => {
    stopped = true;
    stop();
  };
}

/**
 * The (at most `max`) messages sent before the one at `before`, newest first
 * (GET …/messages?before=): one page further back than the thread holds. A
 * failed read throws.
 */
export async function getMessagesBefore(pairId: string, before: string, max: number): Promise<ThreadEntry[]> {
  const page = await callApi<MessagePageBody>(messagesPath(pairId, { before, limit: String(Math.min(max, PAGE_MAX)) }));
  return page.messages.map(apiEntry);
}

// The Firestore reads of the thread as they were before the decouple, for the unchanged emulator suite only.
export { getOlderMessages, listenThread, markConversationRead, type MessageCursor } from './messagesLegacy';

/**
 * Delete a conversation and its messages, for both participants, through the
 * server (DELETE /api/v1/conversations/{pair}), which deletes it whole. (The
 * rules still let a participant delete its messages one by one, for the app
 * builds that deleted a conversation from the client.)
 */
export async function deleteConversation(pairId: string): Promise<void> {
  requireUid();
  await callApi(`/api/v1/conversations/${encodeURIComponent(pairId)}`, { method: 'DELETE' });
}
