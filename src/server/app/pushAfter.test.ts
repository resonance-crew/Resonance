import { describe, expect, it, vi } from 'vitest';
import { memoryCtx } from '@/server/infra/memory/ctx';
import { memoryPush } from '@/server/infra/memory/push';
import { registerDeviceIn } from './pushDevices';
import { afterMessageSentIn, afterMessageUnsentIn, afterNoteSentIn, announceNewCardIn, ringAfterIn } from './pushAfter';
import type { SentMessage } from './conversations';
import type { MessagePush } from './pushChat';

// What the /api/v1 routes push after their response, on a memory context: the
// work waits on ctx.later until the response is sent, each bell row is
// claimed and pushed once through ctx.push, a bell whose writing fails rings
// no one and the next still rings, and nothing is queued for nothing to do.

async function ready() {
  const push = memoryPush();
  const ctx = memoryCtx({ push });
  ctx.state.seed('users', { ann: { handle: 'ann' }, ben: { handle: 'ben' } });
  await registerDeviceIn(ctx, 'ann', 'phone', { token: 'tok-ann', platform: 'ios', locale: 'en', capabilities: [] });
  const row = (id: string) => ({ [id]: { userId: 'ann', type: 'resonance', payload: { fromUserId: 'ben', cardId: 'walk' }, pushedAt: null, readAt: null } });
  ctx.state.seed('notifications', { ...row('n1'), ...row('n2') });
  return { ctx, push };
}

describe('ringAfterIn', () => {
  it('pushes each bell row after the response, in order and once — a failed write rings no one, the next still rings', async () => {
    const { ctx, push } = await ready();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const written = vi.fn(async () => 'n2');
    ringAfterIn(ctx, 'n1', null, undefined, async () => Promise.reject(new Error('reach failed')), written);
    // Nothing before the response.
    expect(ctx.later.pending).toEqual([{ label: 'push' }]);
    expect(written).not.toHaveBeenCalled();
    expect(push.sends).toEqual([]);

    await ctx.later.flush();
    expect(written).toHaveBeenCalledTimes(1);
    expect(push.sends.map((s) => s.message.data?.notificationId)).toEqual(['n1', 'n2']);
    expect(push.sends.every((s) => s.tokens.join() === 'tok-ann')).toBe(true);
    expect(errors).toHaveBeenCalledWith('[push]', expect.any(Error));

    // Claimed: ringing the same rows again pushes nothing more.
    ringAfterIn(ctx, 'n1', 'n2');
    await ctx.later.flush();
    expect(push.sends).toHaveLength(2);
    errors.mockRestore();
  });

  it('queues nothing when there is no bell to ring', async () => {
    const { ctx } = await ready();
    ringAfterIn(ctx, null, undefined, '');
    expect(ctx.later.pending).toEqual([]);
  });

  it('logs a push that fails, never throwing into the work after the response', async () => {
    const { ctx, push } = await ready();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    push.failNext(new Error('FCM down'));
    ringAfterIn(ctx, 'n1');
    await ctx.later.flush();
    expect(errors).toHaveBeenCalledWith('[push]', 'n1', expect.any(Error));
    errors.mockRestore();
  });
});

describe('the chat pushes after the response', () => {
  const push: MessagePush = { conversationId: 'ann_ben', messageId: 'm1', from: 'ben', to: 'ann' } as unknown as MessagePush;
  const sent = (extra: Partial<SentMessage> = {}) => ({ conversationId: 'ann_ben', id: 'm1', notificationId: null, duplicate: false, push, ...extra }) as SentMessage;

  it('queue the ring and the unfurl for a message sent, and nothing for one only sent again, or a silent picture without a link', async () => {
    const ctx = memoryCtx();
    afterMessageSentIn(ctx, sent({ duplicate: true }), 'https://example.com');
    afterMessageSentIn(ctx, sent({ push: null }), 'hi');
    afterMessageSentIn(ctx, sent({ silent: true }), 'no link here');
    expect(ctx.later.pending).toEqual([]);
    afterMessageSentIn(ctx, sent(), 'hi');
    afterMessageSentIn(ctx, sent({ silent: true }), 'see https://example.com');
    expect(ctx.later.pending).toEqual([{ label: 'afterMessage' }, { label: 'afterMessage' }]);
  });

  it('queue a note’s ring and an unsend’s word only when there is a push to send', async () => {
    const ctx = memoryCtx();
    afterNoteSentIn(ctx, null);
    afterMessageUnsentIn(ctx, null);
    expect(ctx.later.pending).toEqual([]);
    afterNoteSentIn(ctx, push);
    afterMessageUnsentIn(ctx, push);
    expect(ctx.later.pending).toEqual([{ label: 'afterNote' }, { label: 'afterUnsend' }]);
    // A message that isn't there rings no one, and the work never throws.
    await ctx.later.flush();
  });
});

describe('announceNewCardIn', () => {
  it('waits for the slug and never throws, even for a card that is gone', async () => {
    const ctx = memoryCtx();
    let settled = false;
    const slug = new Promise<string>((resolve) => setTimeout(() => ((settled = true), resolve('a-walk')), 5));
    await expect(announceNewCardIn(ctx, 'gone', slug)).resolves.toBeUndefined();
    expect(settled).toBe(true);
    await expect(announceNewCardIn(ctx, 'gone', Promise.reject(new Error('no slug')))).resolves.toBeUndefined();
  });
});
