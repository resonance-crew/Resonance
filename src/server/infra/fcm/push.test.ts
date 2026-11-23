import { describe, expect, it, vi } from 'vitest';
import type { BatchResponse, MulticastMessage } from 'firebase-admin/messaging';
import { pushMessageIn, pushUnsendIn } from '@/server/app/pushChat';
import { pushConnectionCardIn } from '@/server/app/pushConnectionCards';
import { pushPickIn } from '@/server/app/pushPicks';
import { pushNotificationIn } from '@/server/app/pushSend';
import { pushTapIn, ringTapIn } from '@/server/app/pushTap';
import { pushText, tapText, pickText, connectionCardText } from '@/server/domain/push/text';
import { toInstant } from '@/server/ports/time';
import { memoryCtx, type MemoryCtx } from '../memory/ctx';
import { memoryPush, type MemoryPush } from '../memory/push';
import { MULTICAST_MAX, fromPushSender, toMulticast, type PushSender } from './push';

const messaging = { sendEachForMulticast: vi.fn(async (m: MulticastMessage) => ({ successCount: m.tokens.length, failureCount: 0, responses: m.tokens.map(() => ({ success: true })) })) };
vi.mock('@/lib/db/firestore/admin', () => ({ getAdminMessaging: async () => messaging }));

// The gateway's FCM messages against the ones src/lib/push built by hand
// before it (the `build` lambdas of 0060cd58, copied below as `legacy`): each
// push kind is driven through its service on a memory context, and what the
// gateway would hand FCM must be the old message byte for byte — same
// fields, same order, nothing undefined.

const NOW = Date.parse('2026-11-19T10:00:00Z');

/** The same message, and the same JSON (key order included). */
function same(got: MulticastMessage, want: MulticastMessage) {
  expect(got).toStrictEqual(want);
  expect(JSON.stringify(got)).toBe(JSON.stringify(want));
}

function world(): { ctx: MemoryCtx; push: MemoryPush } {
  const push = memoryPush();
  const ctx = memoryCtx({ push });
  ctx.clock.set(NOW);
  ctx.state.seed('users', { alice: { handle: 'alice' }, bob: { handle: '小明' } });
  ctx.state.seed('devices', {
    'i-en': { userId: 'alice', token: 'tok-en', platform: 'ios', locale: 'en', capabilities: [] },
    'i-zh': { userId: 'alice', token: 'tok-zh', platform: 'android', locale: 'zh-TW', capabilities: ['chat-push', 'bell-tap'] },
  });
  return { ctx, push };
}

const sent = (push: MemoryPush) => push.sends.map((s) => toMulticast(s.tokens, s.message));

describe('toMulticast, kind by kind, against the messages lib/push built before the gateway', () => {
  it("a bell row's push (with a note's preview, riding a tap's line, and without)", async () => {
    const { ctx, push } = world();
    ctx.state.seed('notifications', {
      n1: { userId: 'alice', type: 'invite_accepted', payload: { fromUserId: 'bob' }, readAt: null, pushedAt: null },
      n2: { userId: 'alice', type: 'note', payload: { fromUserId: 'bob', noteId: 'note1', cardId: 'walk' }, readAt: null, pushedAt: null },
    });
    ctx.state.seed('notes', { note1: { fromUserId: 'bob', toUserId: 'alice', text: 'hello', cardId: 'walk' } });
    ctx.state.seed('resonanceTaps', { walk_bob: { on: true, rangAt: NOW - 60_000 } });
    await pushNotificationIn(ctx, 'n1');
    await pushNotificationIn(ctx, 'n2');

    const legacy = (tokens: string[], text: { title: string; body?: string }, data: Record<string, string>, id: string, type: string, rides: string | null): MulticastMessage => ({
      tokens,
      notification: text,
      data,
      android: { notification: { channelId: 'activity', tag: rides ?? id } },
      apns: { ...(rides ? { headers: { 'apns-collapse-id': rides } } : {}), payload: { aps: { sound: 'default', threadId: type } } },
    });
    const accepted = { notificationId: 'n1', type: 'invite_accepted', route: '/messages/%E5%B0%8F%E6%98%8E', fromUserId: 'bob' };
    const note = { notificationId: 'n2', type: 'note', route: '/messages/%E5%B0%8F%E6%98%8E?note=note1&card=walk', fromUserId: 'bob' };
    const notePayload = { fromHandle: '小明', preview: 'hello' };
    const got = sent(push);
    expect(got).toHaveLength(4);
    same(got[0], legacy(['tok-en'], pushText('en', 'invite_accepted', { fromHandle: '小明' })!, accepted, 'n1', 'invite_accepted', null));
    same(got[1], legacy(['tok-zh'], pushText('zh-TW', 'invite_accepted', { fromHandle: '小明' })!, accepted, 'n1', 'invite_accepted', null));
    same(got[2], legacy(['tok-en'], pushText('en', 'note', notePayload)!, note, 'n2', 'note', 'rtap_walk'));
    same(got[3], legacy(['tok-zh'], pushText('zh-TW', 'note', notePayload)!, note, 'n2', 'note', 'rtap_walk'));
  });

  it("a tap's push (with its row's id and collapse key)", async () => {
    const { ctx, push } = world();
    ctx.state.seed('cards', { walk: { authorId: 'alice', visibility: 'public', anonymous: false, publishedAt: new Date(NOW - 86_400_000) } });
    ctx.state.seed('resonanceTaps', { walk_bob: { on: true, rangAt: null } });
    const ring = await ringTapIn(ctx, 'bob', 'walk');
    expect(ring).toEqual({ to: 'alice', handle: '小明', notificationId: null, others: 0 });
    await pushTapIn(ctx, { ...ring!, notificationId: 'rtap_walk_20261119', from: 'bob', cardId: 'walk' });

    const legacy = (tokens: string[], title: string, key: string | null, notificationId: string | null): MulticastMessage => ({
      tokens,
      notification: { title },
      data: { type: 'resonance_tap', cardId: 'walk', route: '/card/walk', ...(notificationId ? { notificationId } : {}) },
      android: { notification: { channelId: 'activity', ...(key ? { tag: key } : {}) } },
      apns: { ...(key ? { headers: { 'apns-collapse-id': key } } : {}), payload: { aps: { sound: 'default', threadId: 'resonance_tap' } } },
    });
    const got = sent(push);
    same(got[0], legacy(['tok-en'], tapText('en', '小明', 0), 'rtap_walk', 'rtap_walk_20261119'));
    same(got[1], legacy(['tok-zh'], tapText('zh-TW', '小明', 0), 'rtap_walk', 'rtap_walk_20261119'));
  });

  const chatWorld = () => {
    const w = world();
    w.ctx.state.seed('connections', { alice_bob: { userIds: ['alice', 'bob'] } });
    return w;
  };
  const at = (ms: number) => toInstant(ms, 250);

  it("a chat message's push: a build that draws its own, and one the system shows", async () => {
    const { ctx, push } = chatWorld();
    ctx.state.seed('messages', { 'alice_bob/m1': { senderId: 'bob', text: '  hi there ', sentAt: at(NOW) } });
    await pushMessageIn(ctx, { conversationId: 'alice_bob', messageId: 'm1', from: 'bob', to: 'alice' });

    const route = '/messages/%E5%B0%8F%E6%98%8E';
    const own: MulticastMessage = {
      tokens: ['tok-zh'],
      data: { type: 'message', conversationId: 'alice_bob', messageId: 'm1', fromUserId: 'bob', toUserId: 'alice', fromHandle: '小明', title: '小明', body: 'hi there', route, sentAt: String(NOW) },
      android: { priority: 'high' },
    };
    const system: MulticastMessage = {
      tokens: ['tok-en'],
      notification: { title: '小明', body: 'hi there' },
      // Round 32 §P7: whose it is, who sent it and when, as the data-only kind says them.
      data: { type: 'message', route, fromUserId: 'bob', toUserId: 'alice', fromHandle: '小明', sentAt: String(NOW), conversationId: 'alice_bob', messageId: 'm1' },
      android: { priority: 'high', notification: { channelId: 'messages', tag: 'alice_bob' } },
      apns: { headers: { 'apns-collapse-id': 'm1' }, payload: { aps: { sound: 'default', threadId: 'alice_bob', mutableContent: true } } },
    };
    const got = sent(push);
    expect(got).toHaveLength(2);
    same(got.find((m) => m.tokens[0] === 'tok-zh')!, own);
    same(got.find((m) => m.tokens[0] === 'tok-en')!, system);
  });

  it("the system's chat push carries the sender's face, for the iPhone's extension to redraw it under (mutable-content)", async () => {
    const { ctx, push } = chatWorld();
    ctx.state.seed('users', { bob: { handle: '小明', initials: '小明', accentColor: 'oklch(90% 0.06 140)' } });
    ctx.state.seed('messages', { 'alice_bob/m1': { senderId: 'bob', text: 'hi', sentAt: at(NOW) } });
    await pushMessageIn(ctx, { conversationId: 'alice_bob', messageId: 'm1', from: 'bob', to: 'alice' });
    const face = { fromInitials: '小明', fromColor: 'oklch(90% 0.06 140)' };
    const system = sent(push).find((m) => m.tokens[0] === 'tok-en')!;
    same(system, {
      tokens: ['tok-en'],
      notification: { title: '小明', body: 'hi' },
      data: { type: 'message', route: '/messages/%E5%B0%8F%E6%98%8E', fromUserId: 'bob', toUserId: 'alice', fromHandle: '小明', sentAt: String(NOW), conversationId: 'alice_bob', messageId: 'm1', ...face },
      android: { priority: 'high', notification: { channelId: 'messages', tag: 'alice_bob' } },
      apns: { headers: { 'apns-collapse-id': 'm1' }, payload: { aps: { sound: 'default', threadId: 'alice_bob', mutableContent: true } } },
    });
    // Only a push that names `mutable` says so: a bell row's stays as the system draws it.
    expect(toMulticast(['t'], { title: 'a', data: {}, threadId: 'x' }).apns?.payload?.aps).toEqual({ sound: 'default', threadId: 'x' });
    expect(toMulticast(['t'], { title: 'a', data: {}, mutable: true }).apns?.payload?.aps).toEqual({ sound: 'default', mutableContent: true });
  });

  it('a sticker continuing a run rings quietly, and only where the system shows it', async () => {
    const { ctx, push } = chatWorld();
    ctx.state.seed('messages', {
      'alice_bob/s1': { senderId: 'bob', text: 'Thanks', sticker: { pack: 'zz', id: 'yy' }, sentAt: at(NOW - 3000) },
      'alice_bob/s2': { senderId: 'bob', text: 'Thanks', sticker: { pack: 'zz', id: 'yy' }, sentAt: at(NOW) },
    });
    await pushMessageIn(ctx, { conversationId: 'alice_bob', messageId: 's2', from: 'bob', to: 'alice' });
    const quiet: MulticastMessage = {
      tokens: ['tok-en'],
      notification: { title: '小明', body: 'Thanks' },
      data: { type: 'message', route: '/messages/%E5%B0%8F%E6%98%8E', fromUserId: 'bob', toUserId: 'alice', fromHandle: '小明', sentAt: String(NOW), conversationId: 'alice_bob', messageId: 's2' },
      android: { priority: 'normal' as const, notification: { channelId: 'messages', tag: 'alice_bob', priority: 'low' as const, defaultSound: false } },
      apns: { headers: { 'apns-collapse-id': 's2' }, payload: { aps: { threadId: 'alice_bob', 'interruption-level': 'passive', mutableContent: true } } },
    };
    const got = sent(push);
    expect(got).toHaveLength(1);
    same(got[0], quiet);
  });

  it("an unsend's push: the data-only redraw, and the quiet replacement of the newest", async () => {
    const { ctx, push } = chatWorld();
    ctx.state.seed('messages', { 'alice_bob/m1': { senderId: 'bob', text: '', unsentAt: NOW, sentAt: at(NOW - 1000) } });
    ctx.state.seed('conversations', { alice_bob: { lastMessage: { senderId: 'bob', unsent: true, sentAt: at(NOW - 1000) } } });
    await pushUnsendIn(ctx, { conversationId: 'alice_bob', messageId: 'm1', from: 'bob', to: 'alice' });
    const own: MulticastMessage = {
      tokens: ['tok-zh'],
      data: { type: 'unsend', conversationId: 'alice_bob', messageId: 'm1', fromUserId: 'bob', toUserId: 'alice' },
      android: { priority: 'high' },
    };
    const got = sent(push);
    expect(got).toHaveLength(2);
    same(got.find((m) => m.tokens[0] === 'tok-zh')!, own);
    const system = got.find((m) => m.tokens[0] === 'tok-en')!;
    same(system, {
      tokens: ['tok-en'],
      notification: { title: '小明', body: system.notification!.body! },
      data: { type: 'message', route: '/messages/%E5%B0%8F%E6%98%8E', fromUserId: 'bob', toUserId: 'alice', conversationId: 'alice_bob', messageId: 'm1' },
      android: { priority: 'normal', notification: { channelId: 'messages', tag: 'alice_bob', priority: 'min', defaultSound: false } },
      apns: { headers: { 'apns-collapse-id': 'm1', 'apns-priority': '5' }, payload: { aps: { threadId: 'alice_bob', 'interruption-level': 'passive', mutableContent: true } } },
    });
    expect(system.notification!.body).toContain('小明');
  });

  it("tonight's card, and a connection's new card", async () => {
    const { ctx, push } = world();
    const published = new Date(NOW - 86_400_000);
    ctx.state.seed('notificationSettings', { alice: { picks: true, connectionCards: true } });
    ctx.state.seed('recommendations', { alice: { date: null, items: [{ cardId: 'walk', reason: '' }] } });
    ctx.state.seed('cards', {
      walk: { authorId: 'bob', thoughtCore: 'A walk', visibility: 'public', anonymous: false, slug: 'a-walk', publishedAt: published },
    });
    ctx.state.seed('connections', { alice_bob: { userIds: ['alice', 'bob'] } });
    expect(await pushPickIn(ctx, 'alice')).toMatchObject({ outcome: 'sent', cardId: 'walk' });
    expect(await pushConnectionCardIn(ctx, 'walk')).toMatchObject({ recipients: 1, outcomes: { sent: 1 } });

    const legacyPick = (tokens: string[], text: { title: string; body: string }): MulticastMessage => ({
      tokens,
      notification: text,
      data: { type: 'pick', cardId: 'walk', route: '/card/a-walk' },
      android: { notification: { channelId: 'picks', tag: 'picks' } },
      apns: { payload: { aps: { sound: 'default', threadId: 'picks' } } },
    });
    const legacyNew = (tokens: string[], text: { title: string; body: string }): MulticastMessage => ({
      tokens,
      notification: text,
      data: { type: 'new_card', cardId: 'walk', route: '/card/a-walk' },
      android: { notification: { channelId: 'picks', tag: 'card-walk' } },
      apns: { payload: { aps: { sound: 'default', threadId: 'picks' } } },
    });
    const got = sent(push);
    expect(got).toHaveLength(4);
    same(got[0], legacyPick(['tok-en'], pickText('en', 'A walk', '')));
    same(got[1], legacyPick(['tok-zh'], pickText('zh-TW', 'A walk', '')));
    same(got[2], legacyNew(['tok-en'], connectionCardText('en', '小明', 'A walk')));
    same(got[3], legacyNew(['tok-zh'], connectionCardText('zh-TW', '小明', 'A walk')));
  });
});

describe('fromPushSender', () => {
  const sender = (dead: string[] = []) => {
    const calls: MulticastMessage[] = [];
    const s: PushSender = {
      async sendEachForMulticast(message) {
        calls.push(message);
        const responses = message.tokens.map((t) =>
          dead.includes(t) ? { success: false, error: { code: 'messaging/registration-token-not-registered' } } : t.startsWith('flaky') ? { success: false, error: { code: 'messaging/internal-error' } } : { success: true },
        );
        return { successCount: responses.filter((r) => r.success).length, failureCount: 0, responses } as unknown as BatchResponse;
      },
    };
    return { s, calls };
  };

  it(`splits the tokens ${MULTICAST_MAX} to a call, counts what FCM took, and names only the tokens it gave up on`, async () => {
    const tokens = Array.from({ length: MULTICAST_MAX + 3 }, (_, i) => `t${i}`).concat('flaky-1');
    const { s, calls } = sender(['t2', `t${MULTICAST_MAX + 1}`]);
    const out = await fromPushSender(s).send(tokens, { data: { a: 'b' } });
    expect(calls.map((c) => c.tokens.length)).toEqual([MULTICAST_MAX, 4]);
    expect(out).toEqual({ sent: MULTICAST_MAX + 3 - 2, dead: ['t2', `t${MULTICAST_MAX + 1}`] });
    expect(calls[0]).toStrictEqual({ tokens: calls[0].tokens, data: { a: 'b' } });
  });

  it('memory: a dead token is forgotten after the push, and a bell row rings once', async () => {
    const { ctx, push } = world();
    push.dead.add('tok-zh');
    ctx.state.seed('notifications', { n1: { userId: 'alice', type: 'invite_accepted', payload: { fromUserId: 'bob' }, readAt: null, pushedAt: null } });
    expect(await pushNotificationIn(ctx, 'n1')).toEqual({ sent: 1, pruned: 1 });
    expect(Object.keys(ctx.state.dump().devices)).toEqual(['i-en']);
    expect(await pushNotificationIn(ctx, 'n1')).toBeNull();
    expect(push.sends).toHaveLength(2);
  });
});

describe('fcmPushGateway', () => {
  it('loads FCM only on the first send, through @/lib/db/firestore/admin', async () => {
    const { fcmPushGateway } = await import('./push');
    const gateway = fcmPushGateway();
    expect(messaging.sendEachForMulticast).not.toHaveBeenCalled();
    expect(await gateway.send(['a', 'b'], { title: 't', data: {} })).toEqual({ sent: 2, dead: [] });
    expect(messaging.sendEachForMulticast).toHaveBeenCalledWith({ tokens: ['a', 'b'], notification: { title: 't' }, data: {} });
  });
});
