import { ApiFailure } from '@/lib/api/v1/http';
import { bellPeople, briefOf, presentBellPayload, presentConversation, presentMessagePage } from '@/lib/api/v1/presentInbox';
import {
  BELL_READ_BEFORE_SCAN,
  CONVERSATIONS_PAGE,
  type BellPageBody,
  type ConversationBody,
  type ConversationListBody,
  type MessagePageBody,
} from '@/lib/api/v1/schemas';
import type { AuthorBody } from '@/lib/api/v1/schemas';
import type { ServerCtx } from '@/server/ctx';
import { counterOf, type RealtimeTopic } from '@/server/ports/realtime';
import { otherInPair } from '@/server/domain/conversations';
import { bellChanged, conversationRead, type Touch } from '@/server/domain/realtimeInbox';
import type { ConversationRow } from '@/server/ports/repos/conversations';
import { compareInstants, decodeCursor, encodeCursor, isInstant, toInstant, type Instant } from '@/server/ports/time';
import type { ListedBellRow } from '@/server/ports/repos/bell';
import { EARLY_MAX_AGE_S } from '@/lib/api/v1/signalTag';
import { AUTHOR_FIELDS } from './viewer';

// Phase 2 inbox (2a-inbox): the reads the clients' Firestore listeners made
// — the conversation list, a conversation, a thread's messages, the bell —
// and the two writes the rules let them make (their own unread count, their
// own rows' readAt), as services. Each read answers exactly what the
// viewer's listener could read (firestore.rules: a conversation and its
// messages to its participants, a bell row to its recipient), never more.

/**
 * Tell the clients what changed (signals/{uid}), after the write committed.
 * Best effort: a failure is logged, never thrown into the write it follows.
 */
export async function signal(ctx: ServerCtx, touches: Touch[]): Promise<void> {
  if (!touches.length) return;
  // After the response (ctx.later.soon): the answer never waits on the signal writes.
  await ctx.later.soon(
    () => Promise.all(touches.map((t) => ctx.realtime.touch(t.uid, t.topics).catch((e: unknown) => ctx.log.warn('[signals] touch', t.uid, e)))),
    'signals',
  );
}

/** The writer's own counters after their write, by the clients' topic names (`inbox`, `thread:{pair}`). */
export type OwnSignals = Record<string, number>;

/** The response header that carries {@link OwnSignals} (JSON) to the writer's own client. */
export const OWN_SIGNALS_HEADER = 'X-Resonance-Signals';

const topicName = (t: RealtimeTopic) => (typeof t === 'string' ? t : `thread:${t.thread}`);

/**
 * {@link signal}, except that the writer's own touch is made now, before the
 * response, and the counters it left are handed to `own` — so the writer's
 * client, which pulls its lists at once after its write, can take that
 * counter as heard and not pull again when the listener brings the same
 * touch (client/signals `pokeOwn`). Everyone else's touches still run after
 * the response. When the store can't answer (no touchAndRead, or the touch
 * failed) the writer's touch joins the others and `own` is never called.
 */
export async function signalWithOwn(ctx: ServerCtx, writer: string, touches: Touch[], own?: (signals: OwnSignals) => void): Promise<void> {
  const mine = own && ctx.realtime.touchAndRead ? touches.filter((t) => t.uid === writer) : [];
  const rest = touches.filter((t) => !mine.includes(t));
  if (mine.length) {
    const topics = mine.flatMap((t) => t.topics);
    const doc = await ctx.realtime.touchAndRead!(writer, topics).catch((e: unknown) => (ctx.log.warn('[signals] touch', writer, e), null));
    if (doc) own!(Object.fromEntries(topics.map((t) => [topicName(t), counterOf(doc, t)])));
    else rest.push(...mine);
  }
  await signal(ctx, rest);
}

const noConversation = () => new ApiFailure('not_found', 'No such conversation.');

/** The other person of a conversation of `uid`'s, by its id — 404 for any id that isn't one of theirs. */
function otherOf(uid: string, pair: string): string {
  const other = otherInPair(pair, uid);
  if (!other) throw noConversation();
  return other;
}

/** The conversation, when `uid` is one of its participants: the same 404 whether it exists or not. */
async function ownRow(ctx: ServerCtx, uid: string, pair: string): Promise<ConversationRow> {
  const row = await ctx.data.conversations.getConversationRow(pair);
  if (!row || !row.participants.includes(uid)) throw noConversation();
  return row;
}

/** The other participant of a row (by its participants, else by its id). */
const otherIn = (row: ConversationRow, uid: string) => row.participants.find((p) => p !== uid) ?? otherInPair(row.id, uid) ?? '';

/** GET /conversations: `uid`'s conversations, the most recently active first, 50 a page. */
export async function listConversationsIn(ctx: ServerCtx, uid: string, pageToken?: string | null): Promise<ConversationListBody> {
  const page = await ctx.data.conversations.listConversations(uid, CONVERSATIONS_PAGE, pageToken ?? undefined);
  const others = page.conversations.map((c) => otherIn(c, uid));
  const people = await ctx.data.users.rowsOf(others.filter(Boolean), AUTHOR_FIELDS);
  return {
    conversations: page.conversations.map((c, i) => presentConversation(c, uid, others[i], people.get(others[i]))),
    nextPageToken: page.next,
  };
}

/**
 * GET /conversations?pairs=: only these of `uid`'s conversations (the web's delta, client/messages
 * `followConversations`), the most recently active first, each with its person — a read per conversation and
 * one per person, not the page's fifty and fifty. An id that is gone, or isn't theirs, is left out: to the
 * client that held it, it went (deleted, or never one of theirs). Never a page token.
 */
export async function listConversationsByIdIn(ctx: ServerCtx, uid: string, pairs: readonly string[]): Promise<ConversationListBody> {
  const mine = [...new Set(pairs)].filter((p) => otherInPair(p, uid) !== null);
  const found = await Promise.all(mine.map((p) => ctx.data.conversations.getConversationRow(p)));
  const rows = found
    .filter((r): r is ConversationRow => r !== null && r.participants.includes(uid))
    .sort((a, b) => (a.updatedAt === b.updatedAt ? (a.id < b.id ? 1 : -1) : (a.updatedAt ?? '') < (b.updatedAt ?? '') ? 1 : -1));
  const others = rows.map((c) => otherIn(c, uid));
  const people = others.some(Boolean) ? await ctx.data.users.rowsOf(others.filter(Boolean), AUTHOR_FIELDS) : new Map();
  return { conversations: rows.map((c, i) => presentConversation(c, uid, others[i], people.get(others[i]))), nextPageToken: null };
}

/** GET /conversations/{pair}: one of `uid`'s conversations; 404 for anyone else, whether it exists or not. */
export async function getConversationIn(ctx: ServerCtx, uid: string, pair: string): Promise<ConversationBody> {
  const other = otherOf(uid, pair);
  const [row, people] = await Promise.all([ownRow(ctx, uid, pair), ctx.data.users.rowsOf([other], AUTHOR_FIELDS)]);
  return presentConversation(row, uid, other, people.get(other));
}

export interface MessagesQueryInput {
  before?: string | null;
  after?: string | null;
  /** An answer's `updatedCursor`: say what changed since it, too. */
  updatedAfter?: string | null;
  /** `'1'`: answer an `updatedCursor` (implied by `updatedAfter`). */
  changes?: string | null;
  limit: number;
}

/** An `updatedCursor`: where a thread's changes were read up to (the store's time), opaque to clients. */
const changesCursor = (mark: Instant) => encodeCursor({ t: mark, id: 'changes' });

function changesSince(cursor: string): Instant {
  const at = decodeCursor(cursor);
  if (!at || at.id !== 'changes') {
    throw new ApiFailure('invalid_request', 'The request does not match the contract.', [{ path: 'updatedAfter', message: 'Not a valid cursor.' }]);
  }
  return at.t;
}

/**
 * GET /conversations/{pair}/messages: newest first — the newest `limit`, the
 * `limit` before `before`, or the `limit` right after `after` — for a
 * participant; 404 for anyone else. Pages are `(sentAt, id)` at the
 * microsecond, so two messages sent in one millisecond are never skipped.
 *
 * With `changes=1` the answer carries an `updatedCursor`; with
 * `updatedAfter` (an earlier answer's), also the messages changed since
 * (`updated`, by their `editedAt`): an open thread
 * then asks `after` its newest and `updatedAfter` its last answer — a read
 * per new or changed message, not the newest fifty again. The changes are
 * read after the page, so where they overlap they are the newer word, and
 * their read's time is the next cursor.
 */
export async function listThreadIn(ctx: ServerCtx, uid: string, pair: string, q: MessagesQueryInput): Promise<MessagePageBody> {
  otherOf(uid, pair);
  const since = q.updatedAfter ? changesSince(q.updatedAfter) : null;
  const repo = ctx.data.conversations;
  // Read beside the check, shown only after it.
  const pageRead = q.after ? repo.listMessagesAfter(pair, q.limit, q.after) : repo.listMessages(pair, q.limit, q.before ?? undefined);
  pageRead.catch(() => {});
  await ownRow(ctx, uid, pair);
  const page = await pageRead;
  const mode = q.after ? 'after' : q.before ? 'before' : 'newest';
  const changed = since !== null ? await repo.listMessagesChangedAfter(pair, q.limit, since) : null;
  const mark = changed ? changed.mark : (page.mark ?? null);
  return presentMessagePage(page.messages, {
    mode,
    next: page.next,
    ...(q.after ? { after: q.after } : {}),
    ...(changed ? { updated: changed.messages } : {}),
    // Only when asked: it is the read's own time, so a body carrying it never repeats (no 304 for it).
    ...(mode !== 'before' && (since !== null || q.changes === '1') ? { updatedCursor: mark ? changesCursor(mark) : null } : {}),
  });
}

/**
 * POST /conversations/{pair}/read: `uid`'s unread count 0 — the one write the
 * rules let a participant make. 404 for anyone else. Nothing written (and no
 * signal) when it is 0 already.
 */
export async function markConversationReadIn(ctx: ServerCtx, uid: string, pair: string, own?: (signals: OwnSignals) => void): Promise<void> {
  otherOf(uid, pair);
  const row = await ownRow(ctx, uid, pair);
  if ((row.unread[uid] ?? 0) === 0) return;
  if ((await ctx.data.conversations.markRead(pair, uid)) === 'gone') throw noConversation();
  await signalWithOwn(ctx, uid, conversationRead(pair, uid), own);
}

/** A time sent as `before`: a row's own `createdAt` as it is, any other through the end of its millisecond. */
function upTo(before: string): Instant {
  if (isInstant(before)) return before;
  const ms = Date.parse(before);
  if (!Number.isFinite(ms)) throw new ApiFailure('invalid_request', 'The request does not match the contract.', [{ path: 'before', message: 'Not a time.' }]);
  return toInstant(ms, 999);
}

export interface BellQueryInput {
  /** `true`: answer an `updatedCursor` (implied by `updatedAfter`). */
  changes?: boolean;
  /** An answer's `updatedCursor`: only the rows changed since it, when the server can tell them all. */
  updatedAfter?: string | null;
}

/**
 * A bell answer's `updatedCursor`: where its read stood (the store's time), how many rows the viewer had then,
 * and when it was issued (the server's clock, in seconds) — opaque to clients.
 */
const bellCursor = (mark: Instant, count: number, issuedS: number) => encodeCursor({ t: mark, id: `bell.${count}.${issuedS}` });

function bellSince(cursor: string): { t: Instant; count: number; issuedS: number } {
  const at = decodeCursor(cursor);
  const m = at ? /^bell\.(\d{1,9})\.(\d{1,12})$/.exec(at.id) : null;
  if (!at || !m) {
    throw new ApiFailure('invalid_request', 'The request does not match the contract.', [{ path: 'updatedAfter', message: 'Not a valid cursor.' }]);
  }
  return { t: at.t, count: Number(m[1]), issuedS: Number(m[2]) };
}

/** Rows as the bell answers them, newest first, with the people they name — `named` rows' people only, when given. */
async function bellBody(ctx: ServerCtx, rows: ListedBellRow[], named: ListedBellRow[] = rows) {
  const ids = bellPeople(named);
  const found = ids.length ? await ctx.data.users.rowsOf(ids, AUTHOR_FIELDS) : new Map();
  const newestFirst = [...rows].sort((a, b) => compareInstants(b.createdAt, a.createdAt) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
  return {
    items: newestFirst.map((r) => ({ id: r.id, type: r.type, payload: presentBellPayload(r.payload), readAt: r.readAt, createdAt: r.createdAt })),
    people: ids.map((id) => briefOf(id, found.get(id))).filter((p): p is AuthorBody => p !== null),
  };
}

/**
 * GET /me/bell: `uid`'s bell rows, newest first, with the people they name.
 *
 * With `changes`, the answer carries an `updatedCursor`; with `updatedAfter` (an earlier answer's), only the
 * rows changed since it (`delta: true`) — a read per changed row, the rows' count, and the people of the rows
 * made since and of tap rows (the client holds the others'), not the newest page and its people again (an open
 * bell after a row is marked read: two reads, not forty). A row's every change stamps its `editedAt`
 * (repos/bell); a row that went is told by the count — the rows now must be those then plus those made since,
 * else something went (an untapped reader's last row, a purged account's rows) and the newest page is answered
 * whole, as it is when more than `limit` changed, and for a cursor ten minutes old (EARLY_MAX_AGE_S: what no
 * stamp tells — a renamed person, an older app's own `readAt` write — shows that late at most).
 */
export async function listBellIn(ctx: ServerCtx, uid: string, limit: number, pageToken?: string | null, q: BellQueryInput = {}): Promise<BellPageBody> {
  const bell = ctx.data.bell;
  const issuedS = Math.floor(ctx.clock.now() / 1000);
  if (q.updatedAfter) {
    const since = bellSince(q.updatedAfter);
    const age = issuedS - since.issuedS;
    if (age >= 0 && age < EARLY_MAX_AGE_S) {
      const [count, changed] = await Promise.all([bell.countRows(uid), bell.listRowsChangedAfter(uid, limit, since.t)]);
      const after = (t: Instant | null | undefined) => !!t && compareInstants(t, since.t) > 0;
      const made = changed.rows.filter((r) => after(r.madeAt)).length;
      if (changed.mark && count === since.count + made) {
        // New rows' people, and a tap row's (rung again, a new reader comes first among them); any other row
        // changed is one the client holds, with its person.
        const body = await bellBody(ctx, changed.rows, changed.rows.filter((r) => after(r.madeAt) || Array.isArray(r.payload.fromUserIds)));
        return { ...body, nextPageToken: null, delta: true, updatedCursor: bellCursor(changed.mark, count, issuedS) };
      }
    }
  }
  const cursor = !pageToken && (q.changes || !!q.updatedAfter);
  // The count before the page: a row made between the two is in the page and not the count, so the next delta
  // finds one too many and reads whole — never one missed.
  const count = cursor ? await bell.countRows(uid) : null;
  const page = await bell.listRows(uid, limit, pageToken ?? undefined);
  const body = await bellBody(ctx, page.rows);
  return {
    ...body,
    nextPageToken: page.next,
    ...(cursor ? { updatedCursor: page.mark && count !== null ? bellCursor(page.mark, count, issuedS) : null } : {}),
  };
}

/**
 * POST /notifications/read: these rows of `uid`'s (anyone else's ignored), or
 * theirs up to `before`, read now (`readAt` the server's time). Answers how
 * many were unread; their bell is signalled when any was — the reader's own
 * touch before the response when `own` asks for its counters (signalWithOwn):
 * their client's pull right after finds its `bell` moved, never an early 304
 * for the bell as it was.
 */
export async function markBellReadIn(
  ctx: ServerCtx,
  uid: string,
  input: { ids?: string[] | null; before?: string | null },
  own?: (signals: OwnSignals) => void,
): Promise<number> {
  const bell = ctx.data.bell;
  const marked = input.ids?.length
    ? await bell.markRead(uid, [...new Set(input.ids)])
    : input.before
      ? await bell.markReadBefore(uid, upTo(input.before), BELL_READ_BEFORE_SCAN)
      : 0;
  if (marked) await signalWithOwn(ctx, uid, bellChanged(uid), own);
  return marked;
}
