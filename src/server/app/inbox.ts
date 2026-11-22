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
import { decodeCursor, encodeCursor, isInstant, toInstant, type Instant } from '@/server/ports/time';
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
 * With `updatedAfter` (an earlier answer's `updatedCursor`), also the
 * messages changed since (`updated`, by their `editedAt`): an open thread
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
    ...(mode === 'before' ? {} : { updatedCursor: mark ? changesCursor(mark) : null }),
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

/** GET /me/bell: `uid`'s bell rows, newest first, with the people they name. */
export async function listBellIn(ctx: ServerCtx, uid: string, limit: number, pageToken?: string | null): Promise<BellPageBody> {
  const page = await ctx.data.bell.listRows(uid, limit, pageToken ?? undefined);
  const named = bellPeople(page.rows);
  const rows = named.length ? await ctx.data.users.rowsOf(named, AUTHOR_FIELDS) : new Map();
  const people = named.map((id) => briefOf(id, rows.get(id))).filter((p): p is AuthorBody => p !== null);
  return {
    items: page.rows.map((r) => ({ id: r.id, type: r.type, payload: presentBellPayload(r.payload), readAt: r.readAt, createdAt: r.createdAt })),
    people,
    nextPageToken: page.next,
  };
}

/**
 * POST /notifications/read: these rows of `uid`'s (anyone else's ignored), or
 * theirs up to `before`, read now (`readAt` the server's time). Answers how
 * many were unread; their bell is signalled when any was.
 */
export async function markBellReadIn(ctx: ServerCtx, uid: string, input: { ids?: string[] | null; before?: string | null }): Promise<number> {
  const bell = ctx.data.bell;
  const marked = input.ids?.length
    ? await bell.markRead(uid, [...new Set(input.ids)])
    : input.before
      ? await bell.markReadBefore(uid, upTo(input.before), BELL_READ_BEFORE_SCAN)
      : 0;
  if (marked) await signal(ctx, bellChanged(uid));
  return marked;
}
