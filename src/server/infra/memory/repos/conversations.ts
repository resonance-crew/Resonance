import { ApiFailure } from '@/lib/api/v1/http';
import { messageAlbumOf, messageStickerOf } from '@/lib/api/v1/messageParts';
import { cardVisible } from '@/lib/api/v1/present';
import { mapCard } from '@/lib/db/firestore/mapper';
import type { Card } from '@/lib/db/types';
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
} from '@/server/domain/conversations';
import type {
  ChatImageRecord,
  ConversationHead,
  ConversationsData,
  ConversationsTxRepo,
  NewBell,
  NewMessage,
  StoredMessage,
  UnsentCopy,
} from '@/server/ports/repos/conversations';
import { conversationRowOf } from '@/server/domain/inboxRows';
import { compareInstants, decodeCursor, encodeCursor, instantMillis, isInstant, toInstant, type Instant } from '@/server/ports/time';
import type { MemoryState, Row } from '../state';
import type { MemoryTx } from '../uow';

/**
 * The conversations aggregate over memory. Tables, named after the
 * collections, rows shaped as the documents — with the times things are
 * ordered by as `Instant`s (a message's `sentAt`, a conversation's
 * `createdAt` and its preview's `sentAt`, an unsent copy's and a waiting
 * picture's `unsentAt`) and other times as `Date`s:
 *
 * - `conversations/{pair}` `{ participants, createdAt, updatedAt, lastMessage, unread: { uid: n }, request? }`
 * - `messages/{pair}/{id}` a message document (conversations/{pair}/messages/{id})
 * - `notes/{id}`, `notifications/{id}`, `letters/{from}_{to}`, `unsentMessages/{pair}_{id}`,
 *   `privateShares/{cardId}`, `chatImages/{id}`, `reports/{id}`, `reportEvidence/{id}`, `uploads/{uuid}`
 * - shared with the taps aggregate (src/server/infra/memory/repos/taps.ts): `cards/{id}`,
 *   `users/{uid}`, `blocks/{uid}/{blocked}`, `connections/{pair}` `{ userIds }`; and
 *   `connectionOrigins/{pair}` `{ userIds, reasons, resonanceCards }` (lib/api/v1/origins).
 *
 * A transaction's writes share one server time, as a Firestore commit's do:
 * an Instant made from the service's `at`, after every one handed out before
 * (so messages sent in the same millisecond still have an order).
 */

const MESSAGES = 'messages';
const ORIGINS = 'connectionOrigins';
const isMap = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const instantOrNull = (v: unknown): Instant | null => (isInstant(v) ? v : null);

const lastStamp = new WeakMap<MemoryState, { ms: number; micros: number }>();
/** The next server time, from `at`: never before or equal to one handed out already. */
function nextStamp(state: MemoryState, at: Date): Instant {
  const last = lastStamp.get(state);
  let ms = Math.floor(at.getTime());
  let micros = 0;
  if (last && ms <= last.ms) {
    ms = last.ms;
    micros = last.micros + 1;
    if (micros > 999) {
      ms += 1;
      micros = 0;
    }
  }
  lastStamp.set(state, { ms, micros });
  return toInstant(ms, micros);
}

function headOf(row: Row | null): ConversationHead | null {
  if (!row) return null;
  const last = row.lastMessage;
  return {
    participants: Array.isArray(row.participants) ? row.participants : null,
    request: requestOf(row.request),
    holdsRequest: row.request !== undefined,
    createdAt: instantOrNull(row.createdAt),
    lastMessage: isMap(last) ? { senderId: last.senderId, sentAt: instantOrNull(last.sentAt) } : null,
  };
}

function messageOf(id: string, m: Row): StoredMessage {
  const image = messageImageOf(m.image);
  const album = messageAlbumOf(m.album);
  const sticker = messageStickerOf(m.sticker);
  return {
    id,
    senderId: typeof m.senderId === 'string' ? m.senderId : null,
    text: typeof m.text === 'string' ? m.text : null,
    sentAt: instantOrNull(m.sentAt),
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
    ...(anyInstant(m.unsentAt) ? { unsentAt: anyInstant(m.unsentAt)! } : {}),
    ...(m.preview !== undefined ? { preview: m.preview } : {}),
  };
}

/** A stored time as an Instant: rows the services wrote hold Instants; seeded ones may hold a Date or epoch ms. */
function anyInstant(v: unknown): Instant | null {
  if (isInstant(v)) return v;
  if (v instanceof Date && Number.isFinite(v.getTime())) return toInstant(v);
  if (typeof v === 'number' && Number.isFinite(v)) return toInstant(v);
  return null;
}

function chatImageOf(id: string, row: Row | null): ChatImageRecord | null {
  if (!row) return null;
  return {
    id,
    senderId: row.senderId,
    to: row.to,
    pair: row.pair,
    key: row.key,
    thumbKey: row.thumbKey,
    width: Number(row.width),
    height: Number(row.height),
    messageId: row.messageId,
    unsent: row.unsentAt != null,
    unsentAt: instantOrNull(row.unsentAt),
  };
}

function unsentCopyOf(id: string, row: Row): UnsentCopy {
  return {
    id,
    pair: row.pair,
    messageId: row.messageId,
    senderId: row.senderId,
    text: row.text,
    cardRef: row.cardRef,
    noteRef: row.noteRef,
    image: messageImageOf(row.image),
    sticker: messageStickerOf(row.sticker),
    album: messageAlbumOf(row.album),
    sentAt: instantOrNull(row.sentAt),
    unsentAt: instantOrNull(row.unsentAt),
  };
}

function messageRow(m: NewMessage, sentAt: Instant): Row {
  const row: Row = { senderId: m.senderId, text: m.text, sentAt };
  for (const key of ['cardRef', 'kind', 'noteRef', 'replyTo', 'image', 'album', 'sticker'] as const) if (m[key] !== undefined) row[key] = m[key];
  if (m.privateShare) row.privateShare = true;
  return row;
}

const bellRow = (bell: NewBell, at: Date): Row => ({
  userId: bell.userId,
  type: bell.type,
  payload: bell.payload,
  readAt: null,
  ...(bell.pushed ? { pushedAt: at } : {}),
  createdAt: at,
});

/** lib/api/v1/origins keepsReasons / answeredBy, over a row. */
const keepsReasons = (row: Row | null) => !!row && isMap(row.reasons);
function answers(row: Row | null, other: string): boolean {
  if (!keepsReasons(row)) return false;
  const reasons = row!.reasons as Record<string, unknown>;
  if (reasons[`answered_${other}`] !== undefined) return false;
  return Object.values(reasons).some((r) => isMap(r) && r.kind === 'resonance' && r.by === other);
}

type Get = <T extends Row = Row>(table: string, id: string) => T | null;
type Rows = <T extends Row = Row>(table: string, where?: (row: T, id: string) => boolean) => { id: string; row: T }[];

function reads(get: Get) {
  return {
    async getConversation(pair: string) {
      return headOf(get('conversations', pair));
    },
    async getMessage(pair: string, id: string) {
      const row = get(MESSAGES, `${pair}/${id}`);
      return row ? messageOf(id, row) : null;
    },
    async getNote(id: string) {
      const row = get('notes', id);
      return row ? { id, cardId: row.cardId, fromUserId: row.fromUserId, toUserId: row.toUserId } : null;
    },
    async getCard(cardId: string) {
      const row = get('cards', cardId);
      return row ? mapCard(cardId, row) : null;
    },
    async getSpeaker(uid: string) {
      const handle = get('users', uid)?.handle;
      return { penName: isPenName(handle), handle: String(handle ?? '') };
    },
    async blocks(blocker: string, blocked: string) {
      return !!get('blocks', `${blocker}/${blocked}`);
    },
    async connected(a: string, b: string) {
      return !!get('connections', pairOf(a, b));
    },
    async getChatImage(id: string) {
      return chatImageOf(id, get(CHAT_IMAGES, id));
    },
  };
}

const quotesIn = (rows: Rows, pair: string, messageId: string) =>
  rows(MESSAGES, (row, id) => id.startsWith(`${pair}/`) && isMap(row.replyTo) && row.replyTo.id === messageId).map(({ id, row }) => ({
    id: id.slice(pair.length + 1),
    row,
  }));

/** `conversations` inside a memory transaction (reads through `tx.get` / `tx.rows`, writes through `tx.put` / `tx.merge` / `tx.delete`). */
export function conversationsTx(tx: MemoryTx): ConversationsTxRepo {
  const get: Get = (table, id) => tx.get(table, id);
  const rows: Rows = (table, where) => tx.rows(table, where);
  const origins = new Map<string, Row | null>();
  let stamp: Instant | null = null;
  // One server time for the whole transaction, as a commit has.
  const serverTime = (at: Date) => (stamp ??= nextStamp(tx.state, at));
  // Writes later in the same transaction see the conversation as this one left it (as Firestore applies them in order).
  const pendingConvo = new Map<string, Row>();
  const convoNow = (pair: string): Row => pendingConvo.get(pair) ?? tx.state.get('conversations', pair) ?? {};
  const writeConvo = (pair: string, row: Row) => {
    pendingConvo.set(pair, row);
    tx.put('conversations', pair, row);
  };
  const messageNow = (pair: string, id: string): Row | null => tx.state.get(MESSAGES, `${pair}/${id}`);
  const pendingMessage = new Map<string, Row>();
  const updateMessage = (pair: string, id: string, change: (row: Row) => void) => {
    const key = `${pair}/${id}`;
    const row = pendingMessage.get(key) ?? messageNow(pair, id);
    if (!row) throw new Error(`No message ${key} to update`);
    change(row);
    pendingMessage.set(key, row);
    tx.put(MESSAGES, key, row);
  };

  return {
    ...reads(get),
    async lettersLeft(from, to) {
      const row = get('letters', `${from}_${to}`);
      return row ? countOf(row.count) : 0;
    },
    async getOrigins(uid, other) {
      const row = get(ORIGINS, pairOf(uid, other));
      origins.set(pairOf(uid, other), row);
      return { answers: answers(row, other) };
    },
    async quotesOf(pair, messageId, limit) {
      return quotesIn(rows, pair, messageId).slice(0, limit).map((q) => q.id);
    },
    async sharePassesOf(pair, uid, cardId, limit) {
      return rows(MESSAGES, (row, id) => id.startsWith(`${pair}/`) && row.senderId === uid && row.privateShare === true && row.cardRef === cardId)
        .slice(0, limit)
        .map(({ id }) => id.slice(pair.length + 1));
    },

    putNote(id, note, at) {
      tx.put('notes', id, { ...note, readAt: null, createdAt: at });
    },
    putBell(id, bell, at) {
      tx.put('notifications', id, bellRow(bell, at));
    },
    connectByLetter(a, b, by) {
      const userIds = [a, b].sort();
      tx.put('connections', pairOf(a, b), { userIds, establishedAt: new Date() });
      tx.put(ORIGINS, pairOf(a, b), { userIds, reasons: { letter: { kind: 'letter', by } }, resonanceCards: [] });
    },
    addReasons(uid, other, { letterBy, answered }) {
      const pair = pairOf(uid, other);
      const row = origins.get(pair) ?? null;
      const added: Record<string, unknown> = {};
      if (letterBy) added.letter = { kind: 'letter', by: letterBy };
      if (answered && answers(row, other)) added[`answered_${other}`] = { kind: 'answered', by: uid, to: other };
      if (!Object.keys(added).length) return;
      const kept = (row?.reasons as Record<string, unknown> | undefined) ?? {};
      const legacy = keepsReasons(row) ? {} : { legacy: { kind: 'legacy' } };
      tx.put(ORIGINS, pair, { ...(row ?? {}), userIds: [uid, other].sort(), reasons: { ...kept, ...legacy, ...added } });
    },
    clearLetters(a, b) {
      tx.delete('letters', `${a}_${b}`);
      tx.delete('letters', `${b}_${a}`);
    },
    putLetter(from, to, count, cardId, at) {
      tx.put('letters', `${from}_${to}`, { from, to, count, cardId, at });
    },
    openConversation(pair, [a, b], at) {
      const now = serverTime(at);
      writeConvo(pair, { participants: [a, b].sort(), createdAt: now, updatedAt: now, lastMessage: null, unread: { [a]: 0, [b]: 0 } });
    },
    putMessage(pair, id, m, at) {
      const row = messageRow(m, serverTime(at));
      pendingMessage.set(`${pair}/${id}`, row);
      tx.put(MESSAGES, `${pair}/${id}`, row);
    },
    recordSent(pair, { preview, unreadFor, request }, at) {
      const now = serverTime(at);
      const row = convoNow(pair);
      const unread = isMap(row.unread) ? { ...row.unread } : {};
      unread[unreadFor] = (typeof unread[unreadFor] === 'number' ? (unread[unreadFor] as number) : 0) + 1;
      const next: Row = {
        ...row,
        lastMessage: {
          text: preview.text,
          senderId: preview.senderId,
          sentAt: now,
          ...(preview.image ? { image: true } : {}),
          ...(preview.sticker ? { sticker: true } : {}),
          ...(preview.album ? { album: { count: preview.album.count } } : {}),
        },
        updatedAt: now,
        unread,
      };
      if (request === 'clear') delete next.request;
      else if (request !== 'keep') next.request = { ...request.set, at };
      writeConvo(pair, next);
    },
    bumpUnread(pair, uid) {
      const row = convoNow(pair);
      const unread = isMap(row.unread) ? { ...row.unread } : {};
      unread[uid] = (typeof unread[uid] === 'number' ? (unread[uid] as number) : 0) + 1;
      writeConvo(pair, { ...row, unread });
    },
    setReaction(pair, messageId, uid, reaction) {
      updateMessage(pair, messageId, (row) => {
        const reactions = isMap(row.reactions) ? { ...row.reactions } : {};
        if (reaction === null) delete reactions[uid];
        else reactions[uid] = reaction;
        row.reactions = reactions;
      });
    },
    unsendMessage(pair, messageId, senderId, sentAt, at) {
      const row = { senderId, sentAt, unsentAt: serverTime(at) };
      pendingMessage.set(`${pair}/${messageId}`, row);
      tx.put(MESSAGES, `${pair}/${messageId}`, row);
    },
    emptyQuote(pair, quoteId, unsentId, senderId) {
      updateMessage(pair, quoteId, (row) => {
        row.replyTo = unsentQuote(unsentId, senderId);
      });
    },
    previewUnsent(pair, senderId, sentAt) {
      writeConvo(pair, { ...convoNow(pair), lastMessage: { senderId, sentAt, unsent: true } });
    },
    putUnsentCopy(copy, at) {
      tx.put(UNSENT_MESSAGES, `${copy.pair}_${copy.messageId}`, { ...copy, unsentAt: serverTime(at) });
    },
    unmarkShare(pair, messageId) {
      updateMessage(pair, messageId, (row) => {
        delete row.privateShare;
      });
    },
    putPrivateShare(cardId, authorId, at) {
      tx.put(PRIVATE_SHARES, cardId, { authorId, at });
    },
    markPictureSent(imageId, messageId) {
      tx.merge(CHAT_IMAGES, imageId, { messageId, unsentAt: undefined });
    },
    deleteChatImage(id) {
      tx.delete(CHAT_IMAGES, id);
    },
  };
}

const byPosition = (a: { t: Instant; id: string }, b: { t: Instant; id: string }) => compareInstants(a.t, b.t) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** `conversations` outside a transaction. */
export function conversationsData(state: MemoryState): ConversationsData {
  const get: Get = (table, id) => state.get(table, id);
  const rows: Rows = (table, where) => state.rows(table, where);
  const inPair = (pair: string) =>
    rows(MESSAGES, (_row, id) => id.startsWith(`${pair}/`)).map(({ id, row }) => messageOf(id.slice(pair.length + 1), row));
  const newestFirst = (list: StoredMessage[]) =>
    list
      .filter((m): m is StoredMessage & { sentAt: Instant } => m.sentAt !== null)
      .sort((a, b) => -byPosition({ t: a.sentAt, id: a.id }, { t: b.sentAt, id: b.id }));
  const canView = (card: Card, viewerId: string) =>
    cardVisible(card, viewerId, (author) => author !== viewerId && !!get('connections', pairOf(viewerId, author)));
  const notFound = () => new ApiFailure('not_found', 'No such card.');
  const due = (table: string, cutoff: Date, limit: number, after: { t: Instant; id: string } | null) =>
    rows(table)
      .flatMap(({ id, row }) => (isInstant(row.unsentAt) && instantMillis(row.unsentAt) <= cutoff.getTime() ? [{ id, row, t: row.unsentAt }] : []))
      .sort(byPosition)
      .filter((r) => !after || byPosition(r, after) > 0)
      .slice(0, limit);

  return {
    ...reads(get),
    async readableCard(viewerId, cardId) {
      if (!cardId || cardId.includes('/')) throw notFound();
      const row = get('cards', cardId);
      const card = row ? mapCard(cardId, row) : null;
      if (!card || !canView(card, viewerId)) throw notFound();
      return card;
    },
    async visibleCard(viewerId, key) {
      const row = get('cards', key);
      const found = row ? { id: key, row } : rows('cards', (r) => r.slug === key)[0];
      const card = found ? mapCard(found.id, found.row) : null;
      if (!card || !canView(card, viewerId)) throw notFound();
      return card;
    },
    async primaryLocale(uid) {
      return get('users', uid)?.primaryLocale;
    },
    async profileEvidence(uid) {
      const u = get('users', uid);
      if (!u) return null;
      const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
      return { handle: str(u.handle), bio: str(u.bio), avatarUrl: str(u.avatarUrl), region: str(u.region) };
    },

    async bumpUnread(pair, uid) {
      const row = get('conversations', pair) ?? {};
      const unread = isMap(row.unread) ? { ...row.unread } : {};
      unread[uid] = (typeof unread[uid] === 'number' ? (unread[uid] as number) : 0) + 1;
      state.merge('conversations', pair, { unread });
    },
    async clearUnread(pair, uid) {
      const row = get('conversations', pair) ?? {};
      state.merge('conversations', pair, { unread: { ...(isMap(row.unread) ? row.unread : {}), [uid]: 0 } });
    },
    async listMessages(pair, limit, before) {
      let at: { t: Instant; id: string } | null = null;
      if (before !== undefined) {
        at = decodeCursor(before);
        if (!at) throw new ApiFailure('invalid_request', 'The request does not match the contract.', [{ path: 'pageToken', message: 'Not a valid page token.' }]);
      }
      const after = at;
      const list = newestFirst(inPair(pair))
        .filter((m) => !after || byPosition({ t: m.sentAt, id: m.id }, after) < 0)
        .slice(0, limit);
      const last = list[list.length - 1];
      return { messages: list, next: list.length === limit && last ? encodeCursor({ t: last.sentAt, id: last.id }) : null };
    },
    async listMessagesAfter(pair, limit, after) {
      const at = decodeCursor(after);
      if (!at) throw new ApiFailure('invalid_request', 'The request does not match the contract.', [{ path: 'after', message: 'Not a valid cursor.' }]);
      const oldestFirst = newestFirst(inPair(pair))
        .reverse()
        .filter((m) => byPosition({ t: m.sentAt, id: m.id }, at) > 0)
        .slice(0, limit);
      const newest = oldestFirst[oldestFirst.length - 1];
      return { messages: oldestFirst.reverse(), next: oldestFirst.length === limit && newest ? encodeCursor({ t: newest.sentAt, id: newest.id }) : null };
    },
    async listConversations(uid, limit, before) {
      let at: { t: Instant; id: string } | null = null;
      if (before !== undefined) {
        at = decodeCursor(before);
        if (!at) throw new ApiFailure('invalid_request', 'The request does not match the contract.', [{ path: 'pageToken', message: 'Not a valid page token.' }]);
      }
      const from = at;
      const list = rows('conversations', (row) => Array.isArray(row.participants) && row.participants.includes(uid))
        .map(({ id, row }) => conversationRowOf(id, row, anyInstant))
        .filter((c): c is typeof c & { updatedAt: Instant } => c.updatedAt !== null)
        .sort((a, b) => -byPosition({ t: a.updatedAt, id: a.id }, { t: b.updatedAt, id: b.id }))
        .filter((c) => !from || byPosition({ t: c.updatedAt, id: c.id }, from) < 0)
        .slice(0, limit);
      const last = list[list.length - 1];
      return { conversations: list, next: list.length === limit && last ? encodeCursor({ t: last.updatedAt, id: last.id }) : null };
    },
    async getConversationRow(pair) {
      const row = get('conversations', pair);
      return row ? conversationRowOf(pair, row, anyInstant) : null;
    },
    async markRead(pair, uid) {
      const row = get('conversations', pair);
      if (!row) return 'gone';
      state.merge('conversations', pair, { unread: { ...(isMap(row.unread) ? row.unread : {}), [uid]: 0 } });
      return 'marked';
    },
    async messagesBefore(pair, sentAt, limit) {
      const all = sentAt ? newestFirst(inPair(pair)).filter((m) => compareInstants(m.sentAt, sentAt) < 0) : newestFirst(inPair(pair));
      return all.slice(0, limit);
    },
    async deleteConversation(pair) {
      for (const { id } of rows(MESSAGES, (_row, id) => id.startsWith(`${pair}/`))) state.delete(MESSAGES, id);
      state.delete('conversations', pair);
    },

    async quotesPage(pair, messageId, limit, after) {
      return quotesIn(rows, pair, messageId)
        .filter((q) => !after || q.id > after)
        .slice(0, limit)
        .map((q) => ({ id: q.id, emptied: isMap(q.row.replyTo) && q.row.replyTo.unsent === true }));
    },
    async emptyQuotes(pair, quoteIds, unsentId, senderId) {
      for (const id of quoteIds) state.merge(MESSAGES, `${pair}/${id}`, { replyTo: unsentQuote(unsentId, senderId) });
    },
    async unsentCopiesOf(pair) {
      return rows(UNSENT_MESSAGES, (row) => row.pair === pair).map(({ id, row }) => unsentCopyOf(id, row));
    },
    async dueUnsentCopies(cutoff, limit, after) {
      return due(UNSENT_MESSAGES, cutoff, limit, after).map(({ id, row }) => unsentCopyOf(id, row));
    },
    async deleteUnsentCopy(id, pictureId) {
      if (pictureId) state.delete(CHAT_IMAGES, pictureId);
      state.delete(UNSENT_MESSAGES, id);
    },

    async sharePasses(pair, authorId, cardIds, limit) {
      return rows(
        MESSAGES,
        (row, id) => id.startsWith(`${pair}/`) && row.senderId === authorId && row.privateShare === true && cardIds.includes(row.cardRef as string),
      )
        .slice(0, limit)
        .map(({ row }) => ({ cardRef: row.cardRef, sentAt: instantOrNull(row.sentAt) }));
    },
    async privateShareAuthor(cardId) {
      return get(PRIVATE_SHARES, cardId)?.authorId ?? null;
    },

    async insertChatImageIfAbsent(id, record, at) {
      if (get(CHAT_IMAGES, id)) return 'exists';
      const now = nextStamp(state, at);
      state.put(CHAT_IMAGES, id, { ...record, unsentAt: now, createdAt: at });
      return 'inserted';
    },
    async dueUnsentChatImages(cutoff, limit, after) {
      return due(CHAT_IMAGES, cutoff, limit, after).map(({ id, row }) => chatImageOf(id, row)!);
    },

    async fileReport(id, report, evidence, at) {
      const { contextId, ...filed } = report;
      state.put('reports', id, { ...filed, ...(contextId ? { contextId } : {}), createdAt: at, status: 'open' });
      state.put(EVIDENCE, id, {
        reportId: id,
        reporterId: report.reporterId,
        targetType: report.targetType,
        targetId: report.targetId,
        targetUserId: report.targetUserId,
        capturedAt: at,
        ...evidence,
      });
    },

    async recordUpload(ownerId, key, kind, at) {
      state.put(UPLOADS, uploadId(key), { ownerId, key, kind, createdAt: at });
    },
    async uploadedKeys(uid) {
      return rows(UPLOADS, (row) => row.ownerId === uid).flatMap(({ row }) => (typeof row.key === 'string' && row.key ? [row.key] : []));
    },
  };
}
