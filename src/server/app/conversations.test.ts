import { beforeEach, describe, expect, it } from 'vitest';
import { ApiFailure } from '@/lib/api/v1/http';
import { memoryCtx, type MemoryCtx } from '@/server/infra/memory/ctx';
import { UNSEND_WINDOW_MS } from '@/server/domain/conversations';
import { sendMessageIn, sendNoteIn } from './conversations';
import { removeReactionIn, setReactionIn, unsendMessageIn } from './messages';
import { createReportIn } from './safety';

// The conversations aggregate's services on the memory context, end to end:
// a note on a named card opens a letter in the two people's thread, the
// author's reply answers it and connects them, unread counts follow every
// send, a reaction lands quietly, and an unsend within 24 hours empties the
// message and the quotes of it. A note on an anonymous card never reaches
// the writer's thread — across a block it is withheld, answered as delivered.

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
  ctx.state.seed('users', { alice: { handle: 'Alice' }, bob: { handle: 'Bob' }, carol: { handle: 'Carol' }, nobody: {} });
  ctx.state.seed('cards', { named: card('bob'), anon: card('bob', true), alicecard: card('alice') });
});

const unread = (pair: string) => ctx.state.get('conversations', pair)?.unread;
const message = (pair: string, id: string) => ctx.state.get(`messages`, `${pair}/${id}`);

describe('a note, its answer, and the thread after', () => {
  it('opens a letter, connects on the reply, counts unread, reacts, and unsends within 24 h', async () => {
    // Alice leaves Bob a note on his named card: the thread opens with it, a letter waits.
    const note = await sendNoteIn(ctx, 'alice', { cardId: 'named', text: 'This stayed with me', clientId: 'note1' });
    expect(note).toMatchObject({ id: 'note1', duplicate: false, push: { conversationId: PAIR, messageId: 'note1', from: 'alice', to: 'bob' } });
    expect(ctx.state.get('conversations', PAIR)).toMatchObject({ participants: ['alice', 'bob'], request: { from: 'alice', count: 1, cardId: 'named' } });
    expect(ctx.state.get('letters', 'alice_bob')).toMatchObject({ count: 1 });
    expect(message(PAIR, 'note1')).toMatchObject({ senderId: 'alice', kind: 'note', cardRef: 'named' });
    expect(ctx.state.get('notifications', note.notificationId!)).toMatchObject({ userId: 'bob', type: 'note', payload: { fromHandle: 'Alice' } });
    expect(ctx.state.get('notifications', note.notificationId!)?.pushedAt).toBeInstanceOf(Date);
    expect(unread(PAIR)).toEqual({ alice: 0, bob: 1 });
    expect(ctx.state.get('connections', PAIR)).toBeNull();

    // The same note again (a lost answer): nothing new.
    expect(await sendNoteIn(ctx, 'alice', { cardId: 'named', text: 'This stayed with me', clientId: 'note1' })).toMatchObject({ duplicate: true, push: null });
    expect(unread(PAIR)).toEqual({ alice: 0, bob: 1 });

    // Not connected, Alice can't message; a reaction waits for a connection too.
    await expect(sendMessageIn(ctx, 'alice', { to: 'bob', text: 'hi?' })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(setReactionIn(ctx, 'bob', PAIR, 'note1', { reaction: 'heart' })).rejects.toMatchObject({ code: 'forbidden' });

    // Bob answers the note: connected, the letter answered, and Alice has one unread.
    ctx.clock.advance(1000);
    const reply = await sendMessageIn(ctx, 'bob', { to: 'alice', text: 'Thank you', noteRef: { cardId: 'named', noteId: 'note1' }, clientId: 'b1' });
    expect(reply).toMatchObject({ conversationId: PAIR, id: 'b1', duplicate: false });
    expect(ctx.state.get('connections', PAIR)).toMatchObject({ userIds: ['alice', 'bob'] });
    expect(ctx.state.get('conversations', PAIR)?.request).toBeUndefined();
    expect(ctx.state.get('letters', 'alice_bob')).toBeNull();
    expect(message(PAIR, 'b1')).toMatchObject({ noteRef: { cardId: 'named', noteId: 'note1' } });
    expect(unread(PAIR)).toEqual({ alice: 1, bob: 1 });

    // Alice writes back; Bob quotes her.
    ctx.clock.advance(1000);
    await sendMessageIn(ctx, 'alice', { to: 'bob', text: 'Coffee sometime?', clientId: 'a1' });
    await sendMessageIn(ctx, 'bob', { to: 'alice', text: 'Yes!', replyTo: 'a1', clientId: 'b2' });
    expect(message(PAIR, 'b2')?.replyTo).toEqual({ id: 'a1', senderId: 'alice', text: 'Coffee sometime?' });
    expect(unread(PAIR)).toEqual({ alice: 2, bob: 2 });

    // Bob reacts, quietly: no unread, the preview as it was.
    const preview = ctx.state.get('conversations', PAIR)?.lastMessage;
    await setReactionIn(ctx, 'bob', PAIR, 'a1', { reaction: 'heart' });
    expect(message(PAIR, 'a1')?.reactions).toEqual({ bob: 'heart' });
    expect(unread(PAIR)).toEqual({ alice: 2, bob: 2 });
    expect(ctx.state.get('conversations', PAIR)?.lastMessage).toEqual(preview);

    // Alice unsends her message within the day: it keeps nothing, Bob's quote of it neither, a copy is kept.
    ctx.clock.advance(60 * 60 * 1000);
    const unsent = await unsendMessageIn(ctx, 'alice', PAIR, 'a1');
    expect(unsent.push).toEqual({ conversationId: PAIR, messageId: 'a1', from: 'alice', to: 'bob' });
    expect(Object.keys(message(PAIR, 'a1')!).sort()).toEqual(['senderId', 'sentAt', 'unsentAt']);
    expect(message(PAIR, 'b2')?.replyTo).toEqual({ id: 'a1', senderId: 'alice', unsent: true });
    expect(ctx.state.get('unsentMessages', `${PAIR}_a1`)).toMatchObject({ text: 'Coffee sometime?', senderId: 'alice', to: 'bob' });
    // Unsent again: done already, nothing new to tell; a reaction to it is gone with it, and taking one back is nothing.
    expect(await unsendMessageIn(ctx, 'alice', PAIR, 'a1')).toEqual({ push: null });
    await expect(setReactionIn(ctx, 'bob', PAIR, 'a1', { reaction: 'hug' })).rejects.toMatchObject({ code: 'not_found' });
    await removeReactionIn(ctx, 'bob', PAIR, 'a1');

    // A note can't be unsent; past the window nothing can.
    await expect(unsendMessageIn(ctx, 'alice', PAIR, 'note1')).rejects.toMatchObject({ code: 'invalid_request' });
    ctx.clock.advance(UNSEND_WINDOW_MS);
    await expect(unsendMessageIn(ctx, 'bob', PAIR, 'b2')).rejects.toMatchObject({ code: 'conflict' });

    // Bob's report of the conversation keeps what the unsent message said.
    const reportId = await createReportIn(ctx, 'bob', { targetType: 'message', targetId: PAIR, conversationId: PAIR, reason: 'spam' } as never);
    const evidence = ctx.state.get('reportEvidence', reportId);
    expect(evidence).toMatchObject({ targetUserId: 'alice', senderHandle: 'Alice', unsent: [{ id: 'a1', text: 'Coffee sometime?', unsent: true }] });
    expect((evidence?.context as { id: string }[]).map((m) => m.id)).toEqual(['note1', 'b1', 'a1', 'b2']);
  });

  it('messages sent in the same millisecond keep their order, and the unsent preview names the right one', async () => {
    ctx.state.put('connections', PAIR, { userIds: ['alice', 'bob'] });
    for (const id of ['s1', 's2', 's3']) await sendMessageIn(ctx, 'alice', { to: 'bob', text: id, clientId: id });
    const page = await ctx.data.conversations.listMessages(PAIR, 2);
    const rest = await ctx.data.conversations.listMessages(PAIR, 2, page.next!);
    expect([...page.messages, ...rest.messages].map((m) => m.id)).toEqual(['s3', 's2', 's1']);
    expect(new Set([...page.messages, ...rest.messages].map((m) => m.sentAt)).size).toBe(3);
    await unsendMessageIn(ctx, 'alice', PAIR, 's2');
    expect(ctx.state.get('conversations', PAIR)?.lastMessage).toMatchObject({ text: 's3' });
    await unsendMessageIn(ctx, 'alice', PAIR, 's3');
    expect(ctx.state.get('conversations', PAIR)?.lastMessage).toEqual({ senderId: 'alice', sentAt: message(PAIR, 's3')?.sentAt, unsent: true });
    expect(unread(PAIR)).toEqual({ alice: 0, bob: 3 });
  });
});

describe('a note on an anonymous card', () => {
  it("never opens or reaches the writer's thread, connected or not", async () => {
    const sent = await sendNoteIn(ctx, 'carol', { cardId: 'anon', text: 'Who are you?' });
    expect(sent.push).toBeNull();
    expect(ctx.state.get('conversations', 'bob_carol')).toBeNull();
    expect(ctx.state.rows('messages')).toEqual([]);
    expect(ctx.state.get('notifications', sent.notificationId!)).toMatchObject({ userId: 'bob', payload: { anonymous: true } });
    expect(ctx.state.get('notifications', sent.notificationId!)?.pushedAt).toBeUndefined();
    expect(ctx.state.get('letters', 'carol_bob')).toBeNull();

    // Connected, it still stays out of their thread.
    ctx.state.put('connections', PAIR, { userIds: ['alice', 'bob'] });
    await sendNoteIn(ctx, 'alice', { cardId: 'anon', text: 'Lovely' });
    expect(ctx.state.get('conversations', PAIR)).toBeNull();
    expect(ctx.state.rows('messages')).toEqual([]);
  });

  it('across a block it is answered as delivered and delivers nothing; on a named card the block answers', async () => {
    ctx.state.put('blocks', 'bob/carol', {});
    const sent = await sendNoteIn(ctx, 'carol', { cardId: 'anon', text: 'Hello?', clientId: 'w1' });
    expect(sent).toEqual({ id: 'w1', notificationId: null, push: null, duplicate: false });
    expect(ctx.state.get('notes', 'w1')).toMatchObject({ fromUserId: 'carol', toUserId: null, withheldFor: 'bob' });
    expect(ctx.state.rows('notifications')).toEqual([]);
    expect(await sendNoteIn(ctx, 'carol', { cardId: 'anon', text: 'Hello?', clientId: 'w1' })).toMatchObject({ duplicate: true });
    await expect(sendNoteIn(ctx, 'carol', { cardId: 'named', text: 'Hello?' })).rejects.toMatchObject({ code: 'blocked' });
    // Without a pen name the answer is the same either way, and comes before the block.
    await expect(sendNoteIn(ctx, 'nobody', { cardId: 'anon', text: 'x' })).rejects.toBeInstanceOf(ApiFailure);
  });
});
