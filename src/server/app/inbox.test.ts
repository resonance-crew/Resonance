import { beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryCtx, type MemoryCtx } from '@/server/infra/memory/ctx';
import { deleteConversationIn, sendMessageIn, sendNoteIn } from './conversations';
import { getConversationIn, listBellIn, listConversationsIn, listThreadIn, markBellReadIn, markConversationReadIn } from './inbox';
import { removeReactionIn, setReactionIn, unsendMessageIn } from './messages';
import { pushNotificationIn } from './pushSend';

// Phase 2 inbox (2a-inbox), on the memory context: what the inbox, a thread
// and the bell read through the services, and which `signals/{uid}` topics
// every write touches after its commit (domain/realtimeInbox) — a note on an
// anonymous card its author's bell alone, nothing at all for one withheld
// across a block, a read mark the reader's own lists only.

const PAIR = 'alice_bob';
const PUBLISHED = new Date('2026-11-01T00:00:00Z');
const card = (authorId: string, anonymous = false) => ({
  authorId,
  visibility: 'public',
  anonymous,
  publishedAt: PUBLISHED,
  trashedAt: null,
  thoughtCore: 'A walk after rain',
  story: '',
});

let ctx: MemoryCtx;
beforeEach(() => {
  ctx = memoryCtx();
  ctx.state.seed('users', {
    alice: { handle: 'Alice', initials: 'AL', accentColor: 'c' },
    bob: { handle: 'Bob', initials: 'BO', accentColor: 'c' },
    carol: { handle: 'Carol' },
  });
  ctx.state.seed('cards', { named: card('bob'), anon: card('bob', true) });
});

/** The touches since the last call, as `uid: topic,topic`. */
function touched(): string[] {
  const out = ctx.realtime.touches.map((t) => `${t.uid}: ${t.topics.map((x) => (typeof x === 'string' ? x : `thread ${x.thread}`)).join(',')}`);
  ctx.realtime.touches.length = 0;
  return out;
}

const connect = () => ctx.state.seed('connections', { [PAIR]: { userIds: ['alice', 'bob'] } });

describe('the touches every inbox write makes', () => {
  it('a note on a named card: both lists and the thread, the author’s bell; sent again, nothing', async () => {
    await sendNoteIn(ctx, 'alice', { cardId: 'named', text: 'This stayed with me', clientId: 'note1' });
    expect(touched()).toEqual([`alice: inbox,thread ${PAIR}`, `bob: inbox,thread ${PAIR},bell`]);
    await sendNoteIn(ctx, 'alice', { cardId: 'named', text: 'This stayed with me', clientId: 'note1' });
    expect(touched()).toEqual([]);
  });

  it('a note on an anonymous card: its author’s bell alone — nothing for the writer, nothing naming the pair', async () => {
    const sent = await sendNoteIn(ctx, 'alice', { cardId: 'anon', text: 'Thank you', clientId: 'note2' });
    expect(touched()).toEqual(['bob: bell']);
    // Its bell row's push (after the response) tells the author's bell again, and still nobody else.
    await pushNotificationIn(ctx, sent.notificationId!);
    expect(touched()).toEqual(['bob: bell']);
    // Neither one's inbox holds a conversation; the writer's bell is empty, the author's says anonymous.
    expect((await listConversationsIn(ctx, 'alice')).conversations).toEqual([]);
    expect((await listConversationsIn(ctx, 'bob')).conversations).toEqual([]);
    expect((await listBellIn(ctx, 'alice', 20)).items).toEqual([]);
    const bell = await listBellIn(ctx, 'bob', 20);
    expect(bell.items.map((i) => [i.type, i.payload.anonymous, i.payload.cardId])).toEqual([['note', true, 'anon']]);
  });

  it('a note on an anonymous card across a block, either way: withheld, touching no one', async () => {
    for (const [blocker, blocked] of [['bob', 'alice'], ['alice', 'bob']]) {
      ctx.state.put('blocks', `${blocker}/${blocked}`, {});
      await sendNoteIn(ctx, 'alice', { cardId: 'anon', text: 'Thank you' });
      expect(touched()).toEqual([]);
      ctx.state.delete('blocks', `${blocker}/${blocked}`);
    }
  });

  it('messages, unsending and deleting: both people’s inbox and thread (a reaction: the thread alone); the first message rings the bell', async () => {
    connect();
    const first = await sendMessageIn(ctx, 'alice', { to: 'bob', text: 'hi' });
    expect(touched()).toEqual([`alice: inbox,thread ${PAIR}`, `bob: inbox,thread ${PAIR},bell`]);
    await sendMessageIn(ctx, 'bob', { to: 'alice', text: 'hello' });
    expect(touched()).toEqual([`bob: inbox,thread ${PAIR}`, `alice: inbox,thread ${PAIR}`]);
    // The same message again (its clientId): nothing.
    await sendMessageIn(ctx, 'alice', { to: 'bob', text: 'again', clientId: 'client-0000000001' });
    touched();
    await sendMessageIn(ctx, 'alice', { to: 'bob', text: 'again', clientId: 'client-0000000001' });
    expect(touched()).toEqual([]);

    await setReactionIn(ctx, 'bob', PAIR, first.id, { reaction: 'heart' });
    expect(touched()).toEqual([`bob: thread ${PAIR}`, `alice: thread ${PAIR}`]);
    // The same reaction again changes nothing, and touches nothing.
    await setReactionIn(ctx, 'bob', PAIR, first.id, { reaction: 'heart' });
    expect(touched()).toEqual([]);
    await removeReactionIn(ctx, 'bob', PAIR, first.id);
    expect(touched()).toEqual([`bob: thread ${PAIR}`, `alice: thread ${PAIR}`]);
    await removeReactionIn(ctx, 'bob', PAIR, first.id);
    expect(touched()).toEqual([]);

    await unsendMessageIn(ctx, 'alice', PAIR, first.id);
    expect(touched()).toEqual([`alice: inbox,thread ${PAIR}`, `bob: inbox,thread ${PAIR}`]);
    await unsendMessageIn(ctx, 'alice', PAIR, first.id);
    expect(touched()).toEqual([]);

    await deleteConversationIn(ctx, 'bob', PAIR);
    expect(touched()).toEqual([`bob: inbox,thread ${PAIR}`, `alice: inbox,thread ${PAIR}`]);
    // Gone already (a retry): nothing.
    await deleteConversationIn(ctx, 'bob', PAIR);
    expect(touched()).toEqual([]);
  });

  it('reading a thread: the reader’s own inbox and thread — once, while something was unread', async () => {
    connect();
    await sendMessageIn(ctx, 'alice', { to: 'bob', text: 'hi' });
    touched();
    await markConversationReadIn(ctx, 'bob', PAIR);
    expect(touched()).toEqual([`bob: inbox,thread ${PAIR}`]);
    expect((await getConversationIn(ctx, 'bob', PAIR)).unread).toBe(0);
    await markConversationReadIn(ctx, 'bob', PAIR);
    expect(touched()).toEqual([]);
    await expect(markConversationReadIn(ctx, 'carol', PAIR)).rejects.toMatchObject({ code: 'not_found' });
    await expect(markConversationReadIn(ctx, 'carol', 'bob_carol')).rejects.toMatchObject({ code: 'not_found' });
  });

  it('reading the bell: own rows only, by id or up to a time; the bell touched when any was unread', async () => {
    ctx.state.seed('notifications', {
      n1: { userId: 'bob', type: 'note', payload: { fromUserId: 'alice' }, readAt: null, createdAt: Date.parse('2026-11-20T01:00:00Z') },
      n2: { userId: 'bob', type: 'message', payload: { fromUserId: 'alice' }, readAt: null, createdAt: Date.parse('2026-11-20T02:00:00Z') },
      n3: { userId: 'alice', type: 'message', payload: {}, readAt: null, createdAt: Date.parse('2026-11-20T02:00:00Z') },
    });
    expect(await markBellReadIn(ctx, 'bob', { ids: ['n3'] })).toBe(0);
    expect(touched()).toEqual([]);
    expect(await markBellReadIn(ctx, 'bob', { ids: ['n1', 'n3'] })).toBe(1);
    expect(touched()).toEqual(['bob: bell']);
    expect(await markBellReadIn(ctx, 'bob', { before: '2026-11-20T02:00:00.000Z' })).toBe(1);
    expect(touched()).toEqual(['bob: bell']);
    expect(ctx.state.get('notifications', 'n3')?.readAt).toBeNull();
    const bell = await listBellIn(ctx, 'bob', 20);
    expect(bell.items.map((i) => [i.id, i.readAt !== null])).toEqual([['n2', true], ['n1', true]]);
    expect(bell.people.map((p) => p.handle)).toEqual(['Alice']);
  });
});

describe('what the inbox reads', () => {
  it('lists the conversation for both, the other person as they are now, and 404s anyone else', async () => {
    connect();
    await sendMessageIn(ctx, 'alice', { to: 'bob', text: 'hi', image: null });
    const bobs = await listConversationsIn(ctx, 'bob');
    expect(bobs.conversations).toHaveLength(1);
    expect(bobs.conversations[0]).toMatchObject({
      id: PAIR,
      otherId: 'alice',
      other: { id: 'alice', handle: 'Alice' },
      unread: 1,
      lastMessage: { text: 'hi', senderId: 'alice', image: false, unsent: false },
      request: null,
    });
    expect(bobs.conversations[0].updatedAt).toMatch(/\.\d{6}Z$/);
    expect((await listConversationsIn(ctx, 'alice')).conversations[0]).toMatchObject({ otherId: 'bob', unread: 0 });
    // A gone account: listed, drawn as gone.
    ctx.state.delete('users', 'alice');
    expect((await getConversationIn(ctx, 'bob', PAIR)).other).toBeNull();
    for (const [uid, pair] of [['carol', PAIR], ['carol', 'bob_carol'], ['bob', 'bob_carol'], ['bob', 'bob']]) {
      await expect(getConversationIn(ctx, uid, pair)).rejects.toMatchObject({ code: 'not_found' });
      await expect(listThreadIn(ctx, uid, pair, { limit: 50 })).rejects.toMatchObject({ code: 'not_found' });
    }
  });

  it('pages a thread both ways at the microsecond — two messages in one millisecond are never skipped', async () => {
    connect();
    // The memory clock stands still: every message is sent in the same millisecond, a microsecond apart.
    const ids: string[] = [];
    for (const text of ['one', 'two', 'three', 'four', 'five']) ids.push((await sendMessageIn(ctx, 'alice', { to: 'bob', text })).id);
    const newest = await listThreadIn(ctx, 'bob', PAIR, { limit: 2 });
    expect(newest.messages.map((m) => m.text)).toEqual(['five', 'four']);
    expect(newest.messages[0].sentAt.slice(0, 23)).toBe(newest.messages[1].sentAt.slice(0, 23));
    expect(newest.hasNewer).toBe(false);
    const older = await listThreadIn(ctx, 'bob', PAIR, { limit: 2, before: newest.olderCursor });
    expect(older.messages.map((m) => m.text)).toEqual(['three', 'two']);
    const oldest = await listThreadIn(ctx, 'bob', PAIR, { limit: 2, before: older.olderCursor });
    expect(oldest.messages.map((m) => m.text)).toEqual(['one']);
    expect(oldest.olderCursor).toBeNull();

    // What came after `one`, two at a time, until the newest.
    const after1 = await listThreadIn(ctx, 'bob', PAIR, { limit: 2, after: oldest.messages[0].cursor });
    expect([after1.messages.map((m) => m.text), after1.hasNewer, after1.olderCursor]).toEqual([['three', 'two'], true, null]);
    const after2 = await listThreadIn(ctx, 'bob', PAIR, { limit: 2, after: after1.newerCursor });
    expect(after2.messages.map((m) => m.text)).toEqual(['five', 'four']);
    const after3 = await listThreadIn(ctx, 'bob', PAIR, { limit: 2, after: after2.newerCursor });
    expect([after3.messages, after3.hasNewer, after3.newerCursor]).toEqual([[], false, after2.newerCursor]);

    // An unsent one says only who and when.
    await unsendMessageIn(ctx, 'alice', PAIR, ids[4]);
    const [unsent] = (await listThreadIn(ctx, 'bob', PAIR, { limit: 1 })).messages;
    expect(Object.keys(unsent).sort()).toEqual(['cursor', 'id', 'senderId', 'sentAt', 'text', 'unsentAt']);
    expect(unsent.text).toBe('');
  });

  it('after a page, answers only what came and what changed since it (`after` + `updatedAfter`), of any age', async () => {
    connect();
    const ids: string[] = [];
    for (const text of ['one', 'two', 'three']) ids.push((await sendMessageIn(ctx, 'alice', { to: 'bob', text })).id);
    const first = await listThreadIn(ctx, 'bob', PAIR, { limit: 2 });
    expect(first.messages.map((m) => m.text)).toEqual(['three', 'two']);
    expect(first.updatedCursor).toBeTruthy();

    // Nothing since: nothing, and a cursor to ask from next.
    const none = await listThreadIn(ctx, 'bob', PAIR, { limit: 100, after: first.newerCursor, updatedAfter: first.updatedCursor });
    expect([none.messages, none.updated]).toEqual([[], []]);

    // A reaction to `one` (older than the page), `three` unsent, `four` sent.
    await setReactionIn(ctx, 'bob', PAIR, ids[0], { reaction: 'heart' });
    await unsendMessageIn(ctx, 'alice', PAIR, ids[2]);
    await sendMessageIn(ctx, 'alice', { to: 'bob', text: 'four' });
    const since = await listThreadIn(ctx, 'bob', PAIR, { limit: 100, after: none.newerCursor, updatedAfter: none.updatedCursor });
    expect(since.messages.map((m) => m.text)).toEqual(['four']);
    expect(since.updated!.map((m) => [m.id, m.reactions ?? null, m.unsentAt ? 'unsent' : null])).toEqual([
      [ids[0], { bob: 'heart' }, null],
      [ids[2], null, 'unsent'],
    ]);
    // The change's time is the server's own business: never in an answer.
    expect(JSON.stringify(since)).not.toContain('editedAt');
    const quiet = await listThreadIn(ctx, 'bob', PAIR, { limit: 100, after: since.newerCursor, updatedAfter: since.updatedCursor });
    expect([quiet.messages, quiet.updated]).toEqual([[], []]);

    // A cursor that isn't one: refused. Not beside `before`.
    await expect(listThreadIn(ctx, 'bob', PAIR, { limit: 2, updatedAfter: first.newerCursor })).rejects.toMatchObject({ code: 'invalid_request' });
  });

  it("hands the writer's own counters on, touched before the answer — everyone else's still after it", async () => {
    connect();
    const own = vi.fn();
    await sendMessageIn(ctx, 'alice', { to: 'bob', text: 'hi' }, undefined, own);
    expect(own).toHaveBeenCalledWith({ inbox: 1, [`thread:${PAIR}`]: 1 });
    const read = vi.fn();
    await markConversationReadIn(ctx, 'bob', PAIR, read);
    expect(read).toHaveBeenCalledWith({ inbox: 2, [`thread:${PAIR}`]: 2 });
    // Every one touched, as ever: the writer's now (before the response), the others' after.
    expect(touched()).toEqual([`alice: inbox,thread ${PAIR}`, `bob: inbox,thread ${PAIR},bell`, `bob: inbox,thread ${PAIR}`]);
    // Nothing unread: nothing touched, nothing handed on.
    const again = vi.fn();
    await markConversationReadIn(ctx, 'bob', PAIR, again);
    expect(again).not.toHaveBeenCalled();
  });
});
