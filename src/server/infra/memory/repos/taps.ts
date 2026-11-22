import { NOTE_REQUEST_MAX } from '@/lib/api/v1/conversations';
import { ApiFailure } from '@/lib/api/v1/http';
import { cardVisible, toAuthor } from '@/lib/api/v1/present';
import type { AuthorBody } from '@/lib/api/v1/schemas';
import { storedPick } from '@/lib/api/v1/tapPassages';
import { mapCard } from '@/lib/db/firestore/mapper';
import type { Card } from '@/lib/db/types';
import { READER_SIGNALS, type SignalState } from '@/server/domain/reading';
import { CARD_READS, TAPS, docIdOk } from '@/server/domain/taps';
import type { ReadDayMark, TapPage, Tapper, TapsData, TapsTxRepo } from '@/server/ports/repos/taps';
import { decodeCursor, encodeCursor, toInstant } from '@/server/ports/time';
import type { MemoryState, Row } from '../state';
import type { MemoryTx } from '../uow';

/**
 * The taps aggregate over memory. Tables, named after the collections, rows
 * shaped as the documents with `Date`s for Timestamps:
 *
 * - `resonanceTaps/{cardId}_{uid}` `{ cardId, userId, on, at, rangAt }`
 * - `readerSignals/{uid}_{cardId}` the record (SignalState, times in ms) + `userId, cardId, expectedSeconds`
 * - `cardReads/{uid}_{cardId}` `{ userId, cardId, day, expireAt }`
 * - read, never written but `readCount`: `cards/{id}` (a card document),
 *   `users/{uid}` (a profile), `blocks/{uid}/{blocked}` (users/{uid}/blocks/*),
 *   `connections/{pair}` `{ userIds }`, `letters/{from}_{to}` `{ count }`,
 *   `conversations/{pair}` `{ request: { from, count } }`, `notes/{id}`
 *   `{ cardId, fromUserId, toUserId, text, createdAt }`.
 */

const pairOf = (a: string, b: string) => (a < b ? `${a}_${b}` : `${b}_${a}`);
const notFound = () => new ApiFailure('not_found', 'No such card.');
const notAToken = () =>
  new ApiFailure('invalid_request', 'The request does not match the contract.', [{ path: 'pageToken', message: 'Not a valid page token.' }]);
const time = (v: unknown): number => (v instanceof Date ? v.getTime() : 0);
const asCard = (id: string, row: Row | null): Card | null => (row ? mapCard(id, row) : null);
const tapperOf = (row: Row): Tapper | null => (docIdOk(row.userId) ? { uid: row.userId, at: time(row.at), passage: storedPick(row.passage) } : null);
const live = (row: Row | null) => !!row && row.trashedAt == null && row.publishedAt != null;

type Read = <T extends Row = Row>(table: string, id: string) => T | null;

function canViewIn(get: Read, card: Card, viewerId: string): boolean {
  return cardVisible(card, viewerId, (author) => author !== viewerId && !!get('connections', pairOf(viewerId, author)));
}

/** `taps` inside a memory transaction. */
export function tapsTx(tx: MemoryTx): TapsTxRepo {
  const read: Read = (table, id) => tx.get(table, id);
  return {
    async getTap(cardId, uid) {
      const row = tx.get(TAPS, `${cardId}_${uid}`);
      return row ? { on: row.on === true, rangAt: row.rangAt instanceof Date ? row.rangAt : null } : null;
    },
    async getTapCard(cardId) {
      return asCard(cardId, tx.get('cards', cardId));
    },
    async connected(a, b) {
      return !!read('connections', pairOf(a, b));
    },
    putTapOn(cardId, uid, at, rangAt) {
      tx.put(TAPS, `${cardId}_${uid}`, { cardId, userId: uid, on: true, at, rangAt });
    },
    turnTapOff(cardId, uid) {
      // Taking it back takes the pick with it (round 27): turning it on again starts without one.
      tx.merge(TAPS, `${cardId}_${uid}`, { on: false, passage: null });
    },
    async getPassageCard(cardId) {
      return asCard(cardId, tx.get('cards', cardId));
    },
    setTapPassage(cardId, uid, passage) {
      tx.merge(TAPS, `${cardId}_${uid}`, { passage: passage ? { id: passage.id, text: passage.text } : null });
    },

    async getSignal(uid, cardId) {
      const row = tx.get(READER_SIGNALS, `${uid}_${cardId}`);
      if (!row) return null;
      const { userId: _u, cardId: _c, expectedSeconds: _e, ...state } = row;
      return state as unknown as SignalState;
    },
    async cardLive(cardId) {
      return live(tx.get('cards', cardId));
    },
    putSignal(uid, cardId, state, expectedSeconds) {
      tx.put(READER_SIGNALS, `${uid}_${cardId}`, { ...state, userId: uid, cardId, expectedSeconds });
    },

    async insertReadDayIfAbsent(uid, cardId, day, expireAt): Promise<ReadDayMark> {
      const mark = tx.get(CARD_READS, `${uid}_${cardId}`);
      const card = tx.get('cards', cardId);
      if (mark?.day === day) return 'exists';
      if (!card || card.trashedAt != null) return 'gone';
      tx.put(CARD_READS, `${uid}_${cardId}`, { userId: uid, cardId, day, expireAt });
      return 'inserted';
    },
    incrementReadCount(cardId, by = 1) {
      // Reads before writes is the caller's: this reads the committed count, as FieldValue.increment adds to it.
      const count = tx.state.get('cards', cardId)?.readCount;
      tx.merge('cards', cardId, { readCount: (typeof count === 'number' ? count : 0) + by });
    },
  };
}

/** `taps` outside a transaction. */
export function tapsData(state: MemoryState): TapsData {
  const get: Read = (table, id) => state.get(table, id);
  const blocked = (a: string, b: string) => !!get('blocks', `${a}/${b}`);
  return {
    async visibleCard(viewerId, cardId) {
      if (!cardId || cardId.includes('/')) throw notFound();
      const card = asCard(cardId, get('cards', cardId));
      if (!card || !canViewIn(get, card, viewerId)) throw notFound();
      return card;
    },
    async canView(card, viewerId) {
      return canViewIn(get, card, viewerId);
    },
    async tapGate(uid, authorId) {
      const handle = get('users', uid)?.handle;
      return { penName: typeof handle === 'string' && handle.trim().length > 0, blocked: blocked(uid, authorId) || blocked(authorId, uid) };
    },
    async blockedEitherWay(a, b) {
      return blocked(a, b) || blocked(b, a);
    },
    async readerStanding(viewerId, authorId) {
      const pair = pairOf(viewerId, authorId);
      const letter = get('letters', `${viewerId}_${authorId}`);
      const count = letter?.count;
      const request = get('conversations', pair)?.request as { from?: unknown } | undefined;
      return {
        blocked: blocked(viewerId, authorId) || blocked(authorId, viewerId),
        connected: !!get('connections', pair),
        lettersLeft: !letter ? 0 : typeof count === 'number' && Number.isInteger(count) && count >= 0 ? count : NOTE_REQUEST_MAX,
        requestFrom: request && typeof request.from === 'string' && request.from ? request.from : null,
      };
    },
    async blockedBy(uid) {
      return new Set(state.rows('blocks', (_row, id) => id.startsWith(`${uid}/`)).map((r) => r.id.slice(uid.length + 1)));
    },
    async blockersOf(uids, of) {
      return new Set(uids.filter((id) => docIdOk(id) && blocked(id, of)));
    },
    async tapIsOn(cardId, uid) {
      return get(TAPS, `${cardId}_${uid}`)?.on === true;
    },
    async ownTap(cardId, uid) {
      const own = get(TAPS, `${cardId}_${uid}`);
      const on = own?.on === true;
      return { on, passage: on ? storedPick(own?.passage) : null };
    },
    async connectionsOf(uid) {
      const ids = state.rows('connections').flatMap(({ row }) => (Array.isArray(row.userIds) && row.userIds.includes(uid) ? (row.userIds as unknown[]) : []));
      return [...new Set(ids.filter((id): id is string => docIdOk(id) && id !== uid))];
    },
    async tapsOnBy(cardId, uids) {
      const wanted = new Set(uids);
      return state
        .rows(TAPS, (row) => row.cardId === cardId && row.on === true && wanted.has(row.userId as string))
        .map(({ row }) => tapperOf(row))
        .filter((t): t is Tapper => !!t);
    },
    async tapsOnPage(cardId, limit, after): Promise<TapPage> {
      const from = after ? decodeCursor(after) : undefined;
      if (from === null) throw notAToken();
      const rows = state
        .rows(TAPS, (row) => row.cardId === cardId && row.on === true && row.at instanceof Date)
        .map(({ id, row }) => ({ id, row, t: toInstant(row.at as Date) }))
        .sort((a, b) => (a.t === b.t ? (a.id < b.id ? 1 : -1) : a.t < b.t ? 1 : -1))
        .filter((r) => !from || r.t < from.t || (r.t === from.t && r.id < from.id))
        .slice(0, limit);
      const last = rows.at(-1);
      return {
        tappers: rows.map((r) => tapperOf(r.row)).filter((t): t is Tapper => !!t),
        next: last ? encodeCursor({ t: last.t, id: last.id }) : null,
        full: rows.length === limit,
      };
    },
    async profiles(uids) {
      const out = new Map<string, AuthorBody>();
      for (const id of [...new Set(uids)].filter(docIdOk)) {
        const row = get('users', id);
        if (row) out.set(id, toAuthor(id, row));
      }
      return out;
    },
    async latestNotesTo(cardId, authorId, uids) {
      const wanted = new Set(uids.filter(docIdOk));
      const out = new Map<string, { at: number; text: string }>();
      for (const { row } of state.rows('notes', (r) => r.cardId === cardId && wanted.has(r.fromUserId as string))) {
        if (row.toUserId !== authorId || typeof row.fromUserId !== 'string' || typeof row.text !== 'string') continue;
        const was = out.get(row.fromUserId);
        if (!was || time(row.createdAt) > was.at) out.set(row.fromUserId, { at: time(row.createdAt), text: row.text });
      }
      return new Map([...out].map(([uid, n]) => [uid, n.text]));
    },
    async deleteTapsOn(cardId) {
      for (const { id } of state.rows(TAPS, (row) => row.cardId === cardId)) state.delete(TAPS, id);
    },

    async readingGate(uid, cardId) {
      const kept = get(READER_SIGNALS, `${uid}_${cardId}`);
      return { card: asCard(cardId, get('cards', cardId)), kept: kept ? { reportDay: kept.reportDay, reportsToday: Number(kept.reportsToday) } : null };
    },
    async deleteSignalsOn(cardId) {
      for (const { id } of state.rows(READER_SIGNALS, (row) => row.cardId === cardId)) state.delete(READER_SIGNALS, id);
    },

    async readCard(cardId) {
      return asCard(cardId, get('cards', cardId));
    },
    async readMarkDay(uid, cardId) {
      const day = get(CARD_READS, `${uid}_${cardId}`)?.day;
      return typeof day === 'string' ? day : null;
    },
  };
}
