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
import type { Doc } from '../codec';
import type { PgDocs } from '../docs';
import type { PgTx } from '../uow';

/**
 * The taps aggregate over PostgreSQL (`resonance_taps`, `reader_signals`,
 * `card_reads`, `cards.read_count`), the memory repository's semantics
 * (infra/memory/repos/taps.ts) on the documents of PgDocs; the page of taps
 * is a keyset query on `(at, user_id)` (index `resonance_taps_list`).
 */

const pairOf = (a: string, b: string) => (a < b ? `${a}_${b}` : `${b}_${a}`);
const notFound = () => new ApiFailure('not_found', 'No such card.');
const notAToken = () =>
  new ApiFailure('invalid_request', 'The request does not match the contract.', [{ path: 'pageToken', message: 'Not a valid page token.' }]);
const time = (v: unknown): number => (v instanceof Date ? v.getTime() : 0);
const asCard = (id: string, row: Doc | null): Card | null => (row ? mapCard(id, row) : null);
const tapperOf = (row: Doc): Tapper | null => (docIdOk(row.userId) ? { uid: row.userId, at: time(row.at), passage: storedPick(row.passage) } : null);
const live = (row: Doc | null) => !!row && row.trashedAt == null && row.publishedAt != null;

type Read = (table: string, id: string) => Promise<Doc | null>;

async function canViewIn(get: Read, card: Card, viewerId: string): Promise<boolean> {
  const connected = card.authorId !== viewerId && !!(await get('connections', pairOf(viewerId, card.authorId)));
  return cardVisible(card, viewerId, () => connected);
}

export function pgTapsTx(tx: PgTx): TapsTxRepo {
  return {
    async getTap(cardId, uid) {
      const row = await tx.get(TAPS, `${cardId}_${uid}`);
      return row ? { on: row.on === true, rangAt: row.rangAt instanceof Date ? row.rangAt : null } : null;
    },
    async getTapCard(cardId) {
      return asCard(cardId, await tx.get('cards', cardId));
    },
    async connected(a, b) {
      return !!(await tx.get('connections', pairOf(a, b)));
    },
    putTapOn(cardId, uid, at, rangAt) {
      tx.put(TAPS, `${cardId}_${uid}`, { cardId, userId: uid, on: true, at, rangAt });
    },
    turnTapOff(cardId, uid) {
      // Taking it back takes the pick with it (round 27): turning it on again starts without one.
      tx.merge(TAPS, `${cardId}_${uid}`, { on: false, passage: null });
    },
    async getPassageCard(cardId) {
      return asCard(cardId, await tx.get('cards', cardId));
    },
    setTapPassage(cardId, uid, passage) {
      tx.merge(TAPS, `${cardId}_${uid}`, { passage: passage ? { id: passage.id, text: passage.text } : null });
    },

    async getSignal(uid, cardId) {
      const row = await tx.get(READER_SIGNALS, `${uid}_${cardId}`);
      if (!row) return null;
      const { userId: _u, cardId: _c, expectedSeconds: _e, ...state } = row;
      return state as unknown as SignalState;
    },
    async cardLive(cardId) {
      return live(await tx.get('cards', cardId));
    },
    putSignal(uid, cardId, state, expectedSeconds) {
      tx.put(READER_SIGNALS, `${uid}_${cardId}`, { ...state, userId: uid, cardId, expectedSeconds });
    },

    async insertReadDayIfAbsent(uid, cardId, day, expireAt): Promise<ReadDayMark> {
      const [mark, card] = await Promise.all([tx.get(CARD_READS, `${uid}_${cardId}`), tx.get('cards', cardId)]);
      if (mark?.day === day) return 'exists';
      if (!card || card.trashedAt != null) return 'gone';
      tx.put(CARD_READS, `${uid}_${cardId}`, { userId: uid, cardId, day, expireAt });
      return 'inserted';
    },
    incrementReadCount(cardId, by = 1) {
      // FieldValue.increment: added to the committed count, in the same transaction.
      tx.exec({ table: 'cards', id: cardId }, 'update cards set read_count = coalesce(read_count, 0) + $2 where id = $1', [cardId, by]);
    },
  };
}

export function pgTapsData(docs: PgDocs): TapsData {
  const get: Read = (table, id) => docs.get(table, id);
  const blocked = async (a: string, b: string) => !!(await get('blocks', `${a}/${b}`));
  const eitherWay = async (a: string, b: string) => {
    const [x, y] = await Promise.all([blocked(a, b), blocked(b, a)]);
    return x || y;
  };
  return {
    async visibleCard(viewerId, cardId) {
      if (!cardId || cardId.includes('/')) throw notFound();
      const card = asCard(cardId, await get('cards', cardId));
      if (!card || !(await canViewIn(get, card, viewerId))) throw notFound();
      return card;
    },
    canView: (card, viewerId) => canViewIn(get, card, viewerId),
    async tapGate(uid, authorId) {
      const [user, isBlocked] = await Promise.all([get('users', uid), eitherWay(uid, authorId)]);
      const handle = user?.handle;
      return { penName: typeof handle === 'string' && handle.trim().length > 0, blocked: isBlocked };
    },
    blockedEitherWay: eitherWay,
    async readerStanding(viewerId, authorId) {
      const pair = pairOf(viewerId, authorId);
      const [letter, conversation, isBlocked, connection] = await Promise.all([
        get('letters', `${viewerId}_${authorId}`),
        get('conversations', pair),
        eitherWay(viewerId, authorId),
        get('connections', pair),
      ]);
      const count = letter?.count;
      const request = conversation?.request as { from?: unknown } | undefined;
      return {
        blocked: isBlocked,
        connected: !!connection,
        lettersLeft: !letter ? 0 : typeof count === 'number' && Number.isInteger(count) && count >= 0 ? count : NOTE_REQUEST_MAX,
        requestFrom: request && typeof request.from === 'string' && request.from ? request.from : null,
      };
    },
    async blockedBy(uid) {
      return new Set((await docs.rows('blocks', { eq: { owner_id: uid } })).map((r) => r.id.slice(uid.length + 1)));
    },
    async blockersOf(uids, of) {
      const ids = uids.filter(docIdOk);
      if (!ids.length) return new Set();
      const rows = await docs.rows('blocks', { eq: { blocked_id: of }, in: { owner_id: ids } });
      return new Set(rows.map((r) => r.id.slice(0, r.id.indexOf('/'))));
    },
    async tapIsOn(cardId, uid) {
      return (await get(TAPS, `${cardId}_${uid}`))?.on === true;
    },
    async ownTap(cardId, uid) {
      const own = await get(TAPS, `${cardId}_${uid}`);
      const on = own?.on === true;
      return { on, passage: on ? storedPick(own?.passage) : null };
    },
    async connectionsOf(uid) {
      const rows = await docs.rows('connections', { contains: { userIds: uid } });
      const ids = rows.flatMap(({ row }) => (Array.isArray(row.userIds) ? (row.userIds as unknown[]) : []));
      return [...new Set(ids.filter((id): id is string => docIdOk(id) && id !== uid))];
    },
    async tapsOnBy(cardId, uids) {
      if (!uids.length) return [];
      const rows = await docs.rows(TAPS, { eq: { cardId, on: true }, in: { userId: uids } });
      return rows.map(({ row }) => tapperOf(row)).filter((t): t is Tapper => !!t);
    },
    async tapsOnPage(cardId, limit, after): Promise<TapPage> {
      const from = after ? decodeCursor(after) : undefined;
      if (from === null) throw notAToken();
      const params: unknown[] = [cardId, Math.max(0, Math.floor(limit))];
      let keyset = '';
      if (from) {
        params.push(from.t, from.id);
        keyset = `and (at, (card_id || '_' || user_id) collate "C") < ($3::timestamptz, $4::text collate "C")`;
      }
      const { rows } = await docs.db.query<Doc>(
        `select card_id, user_id, at, extra->'passage' as passage, to_char(at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as at_us
         from resonance_taps where card_id = $1 and "on" is true and at is not null ${keyset}
         order by at desc, user_id collate "C" desc limit $2`,
        params,
      );
      const page = rows.map((r) => ({ id: `${r.card_id}_${r.user_id}`, uid: String(r.user_id), at: r.at as Date, passage: storedPick(r.passage), t: toInstantUs(String(r.at_us), r.at as Date) }));
      const last = page.at(-1);
      return {
        tappers: page.filter((r) => docIdOk(r.uid)).map((r) => ({ uid: r.uid, at: time(r.at), passage: r.passage })),
        next: last ? encodeCursor({ t: last.t, id: last.id }) : null,
        full: page.length === limit,
      };
    },
    async profiles(uids) {
      const out = new Map<string, AuthorBody>();
      const ids = [...new Set(uids)].filter(docIdOk);
      if (!ids.length) return out;
      for (const { id, row } of await docs.rows('users', { in: { id: ids } })) out.set(id, toAuthor(id, row));
      return out;
    },
    async latestNotesTo(cardId, authorId, uids) {
      const ids = uids.filter(docIdOk);
      const out = new Map<string, { at: number; text: string }>();
      if (!ids.length) return new Map();
      for (const { row } of await docs.rows('notes', { eq: { cardId, toUserId: authorId }, in: { fromUserId: ids } })) {
        if (typeof row.fromUserId !== 'string' || typeof row.text !== 'string') continue;
        const was = out.get(row.fromUserId);
        if (!was || time(row.createdAt) > was.at) out.set(row.fromUserId, { at: time(row.createdAt), text: row.text });
      }
      return new Map([...out].map(([uid, n]) => [uid, n.text]));
    },
    async deleteTapsOn(cardId) {
      await docs.deleteWhere(TAPS, { eq: { cardId } });
    },

    async readingGate(uid, cardId) {
      const [kept, card] = await Promise.all([get(READER_SIGNALS, `${uid}_${cardId}`), get('cards', cardId)]);
      return { card: asCard(cardId, card), kept: kept ? { reportDay: kept.reportDay, reportsToday: Number(kept.reportsToday) } : null };
    },
    async deleteSignalsOn(cardId) {
      await docs.deleteWhere(READER_SIGNALS, { eq: { cardId } });
    },

    async readCard(cardId) {
      return asCard(cardId, await get('cards', cardId));
    },
    async readMarkDay(uid, cardId) {
      const day = (await get(CARD_READS, `${uid}_${cardId}`))?.day;
      return typeof day === 'string' ? day : null;
    },
  };
}

/** The tap's time as an Instant with PostgreSQL's microseconds (a Date would drop them, and a page would skip). */
function toInstantUs(us: string, at: Date): string {
  return /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/.test(us) ? us : toInstant(at);
}
